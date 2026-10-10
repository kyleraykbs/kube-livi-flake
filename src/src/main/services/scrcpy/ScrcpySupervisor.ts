import { type ChildProcess, spawn } from 'node:child_process'

/** Mirror-mode lifecycle. `starting` means scrcpy was spawned but not yet proven alive. */
export type ScrcpyState = 'off' | 'starting' | 'running' | 'error'

export interface ScrcpySupervisorOptions {
  onState?: (s: ScrcpyState) => void
  /** Delay before respawning scrcpy after an unexpected exit. */
  retryDelayMs?: number
  /** How long scrcpy must stay alive before the state is reported as `running`. */
  runningDelayMs?: number
}

/** The native compositor classifies windows by this title into the phone layer. */
const WINDOW_TITLE = 'livi:phone'
const DEFAULT_RETRY_DELAY_MS = 3000
const DEFAULT_RUNNING_DELAY_MS = 2000
const SIGKILL_DELAY_MS = 3000

function logLine(stream: 'out' | 'err', line: string): void {
  const message = line.trim()
  if (message.length === 0) return
  if (stream === 'err') console.warn(`[Scrcpy] ${message}`)
  else console.log(`[Scrcpy] ${message}`)
}

function wireLineLogging(child: ChildProcess): void {
  if (child.stdout) {
    child.stdout.setEncoding('utf8')
    let outBuf = ''
    child.stdout.on('data', (chunk: string) => {
      outBuf += chunk
      let nl = outBuf.indexOf('\n')
      while (nl !== -1) {
        logLine('out', outBuf.slice(0, nl))
        outBuf = outBuf.slice(nl + 1)
        nl = outBuf.indexOf('\n')
      }
    })
  }
  if (child.stderr) {
    child.stderr.setEncoding('utf8')
    let errBuf = ''
    child.stderr.on('data', (chunk: string) => {
      errBuf += chunk
      let nl = errBuf.indexOf('\n')
      while (nl !== -1) {
        logLine('err', errBuf.slice(0, nl))
        errBuf = errBuf.slice(nl + 1)
        nl = errBuf.indexOf('\n')
      }
    })
  }
}

/**
 * Owns the `scrcpy` mirror process (and the `adb` one-shots used by the
 * on-screen keyboard) while scrcpy mode is enabled.
 */
export class ScrcpySupervisor {
  private _child: ChildProcess | null = null
  private _enabled = false
  private _state: ScrcpyState = 'off'
  private _retryTimer: NodeJS.Timeout | null = null
  private _runningTimer: NodeJS.Timeout | null = null
  private readonly _onState: ((s: ScrcpyState) => void) | undefined
  private readonly _retryDelayMs: number
  private readonly _runningDelayMs: number

  constructor(opts: ScrcpySupervisorOptions = {}) {
    this._onState = opts.onState
    this._retryDelayMs = opts.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
    this._runningDelayMs = opts.runningDelayMs ?? DEFAULT_RUNNING_DELAY_MS
  }

  get state(): ScrcpyState {
    return this._state
  }

  setEnabled(on: boolean): void {
    if (on === this._enabled) return
    this._enabled = on
    if (on) {
      console.log('[Scrcpy] mirror mode enabled')
      this._spawn()
    } else {
      console.log('[Scrcpy] mirror mode disabled')
      this._clearRetry()
      this._killChild()
      this._setState('off')
    }
  }

  /**
   * Types `text` into the phone via `adb shell input text`. The helper escapes
   * spaces as `%s` (the only substitution `input text` performs); everything
   * else passes through, so a literal `%` needs no escaping. A literal "%s"
   * inside one call would arrive as a space - the on-screen keyboard sends one
   * character per call, so that cannot happen in practice.
   */
  async typeText(text: string): Promise<void> {
    await this._runAdb(['shell', 'input', 'text', text.replace(/ /g, '%s')])
  }

  /** Sends an Android keyevent (e.g. 66 = ENTER) to the phone. */
  async sendKey(keycode: number): Promise<void> {
    await this._runAdb(['shell', 'input', 'keyevent', String(keycode)])
  }

  /** Kills scrcpy and stops all retries; used from `before-quit`. */
  dispose(): void {
    this._enabled = false
    this._clearRetry()
    this._killChild()
    this._setState('off')
  }

  private _setState(state: ScrcpyState): void {
    if (this._state === state) return
    this._state = state
    this._onState?.(state)
  }

  private _spawn(): void {
    if (!this._enabled || this._child) return
    const args = [`--window-title=${WINDOW_TITLE}`]
    console.log(`[Scrcpy] spawning scrcpy ${args.join(' ')}`)
    const child = spawn('scrcpy', args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this._child = child
    this._setState('starting')
    wireLineLogging(child)

    this._runningTimer = setTimeout(() => {
      this._runningTimer = null
      if (this._child === child) this._setState('running')
    }, this._runningDelayMs)
    this._runningTimer.unref?.()

    child.on('error', (err) => this._onChildGone(child, err))
    child.on('exit', (code, signal) => {
      console.log(`[Scrcpy] scrcpy exited code=${code} signal=${signal}`)
      this._onChildGone(child)
    })
  }

  private _onChildGone(child: ChildProcess, err?: Error): void {
    // A stale handler (child already replaced/killed by us) must not touch state.
    if (this._child !== child) return
    this._child = null
    this._clearRunningTimer()
    if (err) {
      console.warn(`[Scrcpy] scrcpy failed to run: ${err.message}`)
      this._setState('error')
    } else {
      this._setState('off')
    }
    if (this._enabled) this._scheduleRetry()
  }

  private _scheduleRetry(): void {
    if (this._retryTimer) return
    console.log(`[Scrcpy] retrying in ${this._retryDelayMs}ms`)
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      this._spawn()
    }, this._retryDelayMs)
    this._retryTimer.unref?.()
  }

  private _clearRetry(): void {
    if (!this._retryTimer) return
    clearTimeout(this._retryTimer)
    this._retryTimer = null
  }

  private _clearRunningTimer(): void {
    if (!this._runningTimer) return
    clearTimeout(this._runningTimer)
    this._runningTimer = null
  }

  private _killChild(): void {
    const child = this._child
    this._child = null
    this._clearRunningTimer()
    if (!child || child.exitCode !== null) return
    console.log('[Scrcpy] terminating scrcpy')
    child.kill('SIGTERM')
    const killTimer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, SIGKILL_DELAY_MS)
    killTimer.unref?.()
  }

  private _runAdb(args: string[]): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const child = spawn('adb', args, {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe']
      })
      let stderr = ''
      if (child.stderr) {
        child.stderr.setEncoding('utf8')
        child.stderr.on('data', (chunk: string) => {
          stderr += chunk
        })
      }
      child.on('error', reject)
      child.on('exit', (code) => {
        if (code === 0) {
          resolve()
          return
        }
        const detail = stderr.trim()
        reject(
          new Error(`adb ${args.join(' ')} failed with code ${code}${detail ? `: ${detail}` : ''}`)
        )
      })
    })
  }
}
