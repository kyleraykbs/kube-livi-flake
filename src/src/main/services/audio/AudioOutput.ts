import { DEBUG } from '@main/constants'
import { ChildProcessWithoutNullStreams, spawn } from 'child_process'
import path from 'path'
import { audioDeviceProp, audioSinkElement, gstEnv, resolveGStreamerRoot } from './gstreamer'

export interface AudioOutputOptions {
  sampleRate: number
  channels: number
  mode?: 'music' | 'realtime'
  device?: string
}

export class AudioOutput {
  private static readonly STOP_GRACE_MS = 500

  // Bound the JS-side backlog. The phone's media clock and the local DAC
  // clock drift apart, so a strictly-fed queue grows forever (a long
  // session ended up 10s behind live). On overflow the oldest audio is
  // dropped back down to TARGET_QUEUED_MS: playback skips ahead instead
  // of lagging ever more.
  private static readonly MAX_QUEUED_MS = 1000
  private static readonly TARGET_QUEUED_MS = 500

  // Drift compensation on top of the bound: steer the queue depth back
  // to STEER_TARGET_MS by stretching/squeezing the PCM by at most
  // MAX_RATIO_ADJ (0.5%, inaudible at these ratios) instead of letting
  // the backlog grow until it has to be chopped. No correction inside
  // the deadband, so ordinary audio passes through untouched.
  private static readonly STEER_TARGET_MS = 300
  private static readonly STEER_DEADBAND_MS = 50
  private static readonly MAX_RATIO_ADJ = 0.005
  // Correction gain: 1/60000 per ms of depth error means the equilibrium
  // depth sits just past the deadband for realistic clock drift
  // (e.g. 100ppm => ~56ms over target).
  private static readonly STEER_GAIN_PER_MS = 1 / 60000

  private process: ChildProcessWithoutNullStreams | null = null
  private readonly sampleRate: number
  private readonly channels: number
  private readonly bytesPerMs: number
  private readonly mode: 'music' | 'realtime'
  private device: string | undefined

  private bytesWritten = 0
  private queue: Buffer[] = []
  private queuedBytes = 0
  private writing = false
  private writeSeq = 0

  constructor(opts: AudioOutputOptions) {
    this.sampleRate = opts.sampleRate
    this.channels = Math.max(1, opts.channels | 0)
    this.bytesPerMs = (this.sampleRate * this.channels * 2) / 1000
    this.mode = opts.mode ?? AudioOutput.inferMode(this.sampleRate, this.channels)
    this.device = opts.device

    if (DEBUG) {
      console.debug('[AudioOutput] Init', {
        sampleRate: this.sampleRate,
        channels: this.channels,
        mode: this.mode,
        device: this.device ?? 'default',
        platform: process.platform
      })
    }
  }

  setDevice(device: string | undefined): void {
    this.device = device
  }

  start(): void {
    this.killImmediate()

    if (process.platform !== 'darwin' && process.platform !== 'linux') {
      console.error('[AudioOutput] Unsupported platform')
      return
    }

    const gstRoot = resolveGStreamerRoot()
    if (!gstRoot) {
      console.error('[AudioOutput] Bundled GStreamer not found')
      return
    }

    const cmd = path.join(gstRoot, 'bin', 'gst-launch-1.0')
    const args = this.buildArgs()
    const env = gstEnv(gstRoot)

    if (DEBUG) {
      console.debug('[AudioOutput] Spawning', cmd, args.join(' '))
    }

    this.bytesWritten = 0
    this.queue = []
    this.queuedBytes = 0
    this.writing = false
    this.writeSeq = 0

    this.process = spawn(cmd, args, {
      env,
      shell: false
    })

    const proc = this.process
    const stdin = proc.stdin

    stdin.on('error', (err) => {
      if (DEBUG) {
        console.warn('[AudioOutput] stdin error:', err.message)
      }
    })

    stdin.on('drain', () => {
      if (this.process !== proc) return

      if (DEBUG) {
        console.debug('[AudioOutput] stdin drain', {
          ts: Date.now(),
          mode: this.mode,
          queueLength: this.queue.length,
          bytesWritten: this.bytesWritten
        })
      }

      this.flushQueue()
    })

    proc.stderr.on('data', (d: Buffer) => {
      const s = d.toString().trim()
      if (s && DEBUG) {
        console.warn('[AudioOutput] STDERR:', s)
      }
    })

    proc.on('error', (err) => {
      if (DEBUG) {
        console.error('[AudioOutput] process error:', err)
      }
      if (this.process === proc) {
        this.cleanup()
      }
    })

    proc.on('close', (code, signal) => {
      if (DEBUG) {
        console.debug('[AudioOutput] process exited', {
          ts: Date.now(),
          code,
          signal,
          mode: this.mode,
          bytesWritten: this.bytesWritten
        })
      }

      if (this.process === proc) {
        this.cleanup()
      }
    })

    if (DEBUG) {
      console.debug('[AudioOutput] playback started', {
        ts: Date.now(),
        mode: this.mode
      })
    }
  }

  write(chunk: Int16Array | Buffer | undefined | null): void {
    const proc = this.process
    if (!proc || !proc.stdin || proc.stdin.destroyed) return
    if (!chunk) return

    const buf = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)

    const shaped = this.compensateDrift(buf)
    this.queue.push(shaped)
    this.queuedBytes += shaped.byteLength

    // Backlog bound: drop the oldest audio back down to the target depth.
    const maxQueued = AudioOutput.MAX_QUEUED_MS * this.bytesPerMs
    const targetQueued = AudioOutput.TARGET_QUEUED_MS * this.bytesPerMs
    if (this.queuedBytes > maxQueued) {
      const before = this.queuedBytes
      while (this.queuedBytes > targetQueued && this.queue.length > 1) {
        const dropped = this.queue.shift()!
        this.queuedBytes -= dropped.byteLength
      }
      if (DEBUG) {
        console.warn('[AudioOutput] queue overflow, dropped to target', {
          ts: Date.now(),
          mode: this.mode,
          droppedBytes: before - this.queuedBytes,
          queuedBytes: this.queuedBytes
        })
      }
    }

    if (DEBUG) {
      this.writeSeq += 1

      if (this.writeSeq === 1 || this.writeSeq % 100 === 0) {
        console.debug('[AudioOutput] write queued', {
          ts: Date.now(),
          mode: this.mode,
          seq: this.writeSeq,
          chunkBytes: buf.byteLength,
          queueLength: this.queue.length
        })
      }
    }

    if (!this.writing) {
      this.flushQueue()
    }
  }

  /**
   * Stretch or squeeze the chunk by a hair so the queue depth settles at
   * STEER_TARGET_MS: the phone clock and the DAC clock disagree by tens
   * of ppm and this absorbs the difference without drops. Returns the
   * input untouched while the depth is inside the deadband.
   */
  private compensateDrift(buf: Buffer): Buffer {
    const frameBytes = this.channels * 2
    const inFrames = buf.byteLength / frameBytes
    if (buf.byteLength % frameBytes !== 0 || inFrames < 2) return buf

    const target = AudioOutput.STEER_TARGET_MS * this.bytesPerMs
    const errorMs = (this.queuedBytes - target) / this.bytesPerMs
    const beyond = Math.abs(errorMs) - AudioOutput.STEER_DEADBAND_MS
    if (beyond <= 0) return buf

    const adj = Math.min(beyond * AudioOutput.STEER_GAIN_PER_MS, AudioOutput.MAX_RATIO_ADJ)
    // Deep queue => squeeze (fewer frames out); shallow => stretch.
    const ratio = 1 - Math.sign(errorMs) * adj

    if (buf.byteOffset % 2 !== 0) return buf
    const src = new Int16Array(buf.buffer, buf.byteOffset, inFrames * this.channels)
    const outFrames = Math.max(2, Math.round(inFrames * ratio))
    const out = new Int16Array(outFrames * this.channels)
    const step = (inFrames - 1) / (outFrames - 1)
    for (let k = 0; k < outFrames; k++) {
      const p = k * step
      const i = Math.floor(p)
      const frac = p - i
      const j = Math.min(i + 1, inFrames - 1)
      const a = i * this.channels
      const b = j * this.channels
      const o = k * this.channels
      for (let c = 0; c < this.channels; c++) {
        out[o + c] = Math.round(src[a + c] + (src[b + c] - src[a + c]) * frac)
      }
    }
    return Buffer.from(out.buffer, out.byteOffset, out.byteLength)
  }

  /**
   * Graceful stop: close stdin so EOS propagates through the gst pipeline,
   * letting pulsesink drain its tail. Anything still queued on this side
   * is discarded first — stopping must go quiet promptly (a pause used to
   * play a 10s backlog out before silence).
   */
  stop(): void {
    if (!this.process) return
    const proc = this.process

    this.queue = []
    this.queuedBytes = 0

    this.endStdin(proc)

    const fallback = setTimeout(() => {
      if (this.process !== proc) return
      try {
        proc.kill()
      } catch (e) {
        if (DEBUG) {
          console.warn('[AudioOutput] failed to kill process:', e)
        }
      }
    }, AudioOutput.STOP_GRACE_MS)
    fallback.unref?.()
  }

  dispose(): void {
    this.killImmediate()
  }

  private flushQueue(): void {
    const proc = this.process
    if (!proc || !proc.stdin || proc.stdin.destroyed) {
      this.queue = []
      this.queuedBytes = 0
      this.writing = false
      return
    }

    const stdin = proc.stdin
    this.writing = true

    while (this.queue.length > 0) {
      const buf = this.queue.shift()!
      this.queuedBytes -= buf.byteLength
      const ok = stdin.write(buf)
      this.bytesWritten += buf.byteLength

      if (!ok) {
        if (DEBUG) {
          console.warn('[AudioOutput] stdin backpressure', {
            ts: Date.now(),
            mode: this.mode,
            queueLength: this.queue.length,
            bytesWritten: this.bytesWritten
          })
        }
        return
      }
    }

    this.writing = false
  }

  private buildArgs(): string[] {
    const isRealtime = this.mode === 'realtime'

    // Music path is biased toward stability over latency. (300ms)
    const inputQueueArgs = isRealtime
      ? [
          'queue',
          'max-size-time=40000000', // max 40 ms
          'max-size-bytes=0',
          'max-size-buffers=0'
        ]
      : ['queue', 'max-size-time=350000000', 'max-size-bytes=0', 'max-size-buffers=0'] // max 350ms

    const outputQueueArgs = isRealtime
      ? [
          'queue',
          'max-size-time=20000000', // max 20 ms
          'max-size-bytes=0',
          'max-size-buffers=0'
        ]
      : ['queue', 'max-size-time=200000000', 'max-size-bytes=0', 'max-size-buffers=0'] // max 200ms

    const sink = audioSinkElement()

    // Sink-specific settings:
    //   realtime    → sync=false (mic/voice paths must not buffer)
    //   pulse music → sync=false + 300 ms ALSA ring + 30 ms period
    //   osxaudiosink music → CoreAudio default
    // Music uses sync=false too: pacing is done upstream (decoder jitterbuffer +
    // clocksync), so the sink must not wait on buffer timestamps. With sync=true the
    // sink stalled feeding ALSA after a burst-gap timestamp discontinuity and starved
    // (RUNNING but silent until a realtime stream re-drove the graph).
    const sinkArgs = isRealtime
      ? [sink, 'sync=false']
      : sink === 'osxaudiosink'
        ? [sink]
        : [sink, 'sync=false', 'buffer-time=300000', 'latency-time=30000']

    if (this.device) {
      sinkArgs.push(`${audioDeviceProp()}=${this.device}`)
    }

    return [
      'fdsrc',
      'fd=0',
      '!',
      ...inputQueueArgs,
      '!',
      'rawaudioparse',
      'format=pcm',
      'pcm-format=s16le',
      `sample-rate=${this.sampleRate}`,
      `num-channels=${this.channels}`,
      '!',
      'audioconvert',
      '!',
      'audioresample',
      '!',
      'audio/x-raw,format=S16LE,rate=48000,channels=2',
      '!',
      ...outputQueueArgs,
      '!',
      ...sinkArgs
    ]
  }

  private cleanup(): void {
    this.queue = []
    this.writing = false
    this.process = null
  }

  private killImmediate(): void {
    if (!this.process) return
    const proc = this.process

    this.endStdin(proc)

    try {
      proc.kill()
    } catch (e) {
      if (DEBUG) {
        console.warn('[AudioOutput] failed to kill process:', e)
      }
    }

    this.cleanup()
  }

  private endStdin(proc: ChildProcessWithoutNullStreams): void {
    try {
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.end()
      }
    } catch (e) {
      if (DEBUG) {
        console.warn('[AudioOutput] failed to end stdin:', e)
      }
    }
  }

  private static inferMode(sampleRate: number, channels: number): 'music' | 'realtime' {
    if (channels === 1) return 'realtime'
    if (sampleRate <= 24000) return 'realtime'
    return 'music'
  }
}
