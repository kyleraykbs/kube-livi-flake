import { type SpawnOptions, spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'
import { type ScrcpyState, ScrcpySupervisor } from '../ScrcpySupervisor'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

type FakeStream = EventEmitter & { setEncoding: Mock }

function fakeStream(): FakeStream {
  const stream = new EventEmitter() as FakeStream
  stream.setEncoding = vi.fn()
  return stream
}

type FakeProc = EventEmitter & {
  stdout: FakeStream
  stderr: FakeStream
  exitCode: number | null
  kill: Mock
}

function fakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc
  proc.stdout = fakeStream()
  proc.stderr = fakeStream()
  proc.exitCode = null
  // A killed child reports an exit code, which the supervisor's SIGKILL
  // fallback checks before escalating.
  proc.kill = vi.fn((signal?: NodeJS.Signals) => {
    proc.exitCode = signal === 'SIGKILL' ? 137 : 0
    return true
  })
  return proc
}

type SpawnedProc = {
  cmd: string
  args: string[]
  options: SpawnOptions | undefined
  proc: FakeProc
}

const spawnMock = vi.mocked(spawn)
let spawned: SpawnedProc[]

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  spawned = []
  spawnMock.mockImplementation(((cmd: string, args: readonly string[], options?: SpawnOptions) => {
    const proc = fakeProc()
    spawned.push({ cmd, args: [...args], options, proc })
    return proc as never
  }) as never)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ScrcpySupervisor mirror lifecycle', () => {
  test('spawns scrcpy with the phone window title and stays running', () => {
    const states: ScrcpyState[] = []
    const sup = new ScrcpySupervisor({ onState: (s) => states.push(s) })

    sup.setEnabled(true)

    expect(spawned).toHaveLength(1)
    expect(spawned[0].cmd).toBe('scrcpy')
    expect(spawned[0].args).toContain('--window-title=livi:phone')
    expect(spawned[0].args).toContain('--audio-source=output')
    expect(spawned[0].args).toContain('--audio-buffer=400')
    expect(spawned[0].options?.env).toEqual(
      expect.objectContaining({ ...process.env, SDL_VIDEODRIVER: 'wayland' })
    )
    expect(sup.state).toBe('starting')

    vi.advanceTimersByTime(2000)

    expect(sup.state).toBe('running')
    expect(states).toEqual(['starting', 'running'])
    expect(spawned).toHaveLength(1)

    sup.dispose()
  })

  test('disable terminates the child and reports off', () => {
    const sup = new ScrcpySupervisor()
    sup.setEnabled(true)
    const proc = spawned[0].proc

    sup.setEnabled(false)

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    expect(sup.state).toBe('off')
  })

  test('disable is a no-op when already disabled', () => {
    const sup = new ScrcpySupervisor()
    sup.setEnabled(false)
    expect(spawned).toHaveLength(0)
    expect(sup.state).toBe('off')
  })

  test('an unexpected exit while enabled retries after the delay', () => {
    const sup = new ScrcpySupervisor()
    sup.setEnabled(true)
    const proc = spawned[0].proc
    proc.exitCode = 1

    proc.emit('exit', 1, null)

    expect(sup.state).toBe('off')
    vi.advanceTimersByTime(2999)
    expect(spawned).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(spawned).toHaveLength(2)
    expect(sup.state).toBe('starting')
    expect(spawned[spawned.length - 1].args).toContain('--window-title=livi:phone')

    vi.advanceTimersByTime(2000)
    expect(sup.state).toBe('running')
    sup.dispose()
  })

  test('disable cancels a pending retry', () => {
    const sup = new ScrcpySupervisor()
    sup.setEnabled(true)
    const proc = spawned[0].proc
    proc.exitCode = 1
    proc.emit('exit', 1, null)

    sup.setEnabled(false)
    vi.advanceTimersByTime(10000)

    expect(spawned).toHaveLength(1)
    expect(sup.state).toBe('off')
  })

  test('dispose kills the child and cancels retries', () => {
    const sup = new ScrcpySupervisor()
    sup.setEnabled(true)
    const proc = spawned[0].proc

    sup.dispose()

    expect(proc.kill).toHaveBeenCalledWith('SIGTERM')
    expect(sup.state).toBe('off')
    vi.advanceTimersByTime(10000)
    expect(spawned).toHaveLength(1)
  })

  test('reports error when scrcpy cannot be spawned, then retries', () => {
    const states: ScrcpyState[] = []
    const sup = new ScrcpySupervisor({ onState: (s) => states.push(s) })
    sup.setEnabled(true)
    const proc = spawned[0].proc

    proc.emit('error', new Error('spawn scrcpy ENOENT'))

    expect(sup.state).toBe('error')
    expect(states).toContain('error')
    vi.advanceTimersByTime(3000)
    expect(spawned).toHaveLength(2)
    sup.dispose()
  })
})

describe('ScrcpySupervisor adb keyboard', () => {
  test('typeText escapes spaces for adb input text', async () => {
    const sup = new ScrcpySupervisor()
    const pending = sup.typeText('a b')

    expect(spawned[0].cmd).toBe('adb')
    expect(spawned[0].args).toEqual(['shell', 'input', 'text', 'a%sb'])
    expect(spawned[0].args.join(' ')).toContain('%s')

    spawned[0].proc.emit('exit', 0, null)
    await expect(pending).resolves.toBeUndefined()
  })

  test('typeText rejects when adb exits non-zero', async () => {
    const sup = new ScrcpySupervisor()
    const pending = sup.typeText('hi')

    spawned[0].proc.stderr.emit('data', 'no devices')
    spawned[0].proc.emit('exit', 1, null)

    await expect(pending).rejects.toThrow(/adb .*failed with code 1.*no devices/)
  })

  test('sendKey runs adb keyevent with the keycode', async () => {
    const sup = new ScrcpySupervisor()
    const pending = sup.sendKey(66)

    expect(spawned[0].cmd).toBe('adb')
    expect(spawned[0].args).toEqual(['shell', 'input', 'keyevent', '66'])

    spawned[0].proc.emit('exit', 0, null)
    await expect(pending).resolves.toBeUndefined()
  })
})
