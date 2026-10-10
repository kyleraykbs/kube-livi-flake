import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('child_process', () => ({ spawn: vi.fn() }))
vi.mock('@main/services/audio/gstreamer', () => ({
  resolveGStreamerRoot: () => '/fake/gst',
  gstEnv: () => ({}),
  audioSinkElement: () => 'fakesink',
  audioDeviceProp: () => 'device'
}))

import { spawn } from 'child_process'
import { AudioOutput } from '../AudioOutput'

// 48kHz stereo s16le = 192 bytes/ms; chunks of 4800 bytes = 25ms each.
const CHUNK = 4800
const BYTES_PER_MS = 192
const MAX_QUEUED_BYTES = 1000 * BYTES_PER_MS

class FakeStdin extends EventEmitter {
  destroyed = false
  ended = false
  backpressured = true
  written: Buffer[] = []

  write(buf: Buffer): boolean {
    this.written.push(buf)
    return !this.backpressured
  }

  end(): void {
    this.ended = true
  }
}

function attachProc(): FakeStdin {
  const stdin = new FakeStdin()
  const proc = new EventEmitter() as EventEmitter & Record<string, unknown>
  proc.stdin = stdin
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  vi.mocked(spawn).mockReturnValue(proc as never)
  return stdin
}

function chunk(marker: number): Buffer {
  const buf = Buffer.alloc(CHUNK, 0)
  buf[0] = marker & 0xff
  return buf
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AudioOutput backlog bound', () => {
  it('drops the oldest audio down to the target depth on overflow, keeping the newest', () => {
    const stdin = attachProc()
    const out = new AudioOutput({ sampleRate: 48000, channels: 2, mode: 'music' })
    out.start()

    // First chunk is handed to stdin and hits backpressure; everything
    // after accumulates on the JS side, like a phone outrunning the DAC.
    out.write(chunk(0))
    for (let i = 1; i < 80; i++) {
      out.write(chunk(i))
    }

    // Let the pipeline resume: the surviving backlog must be bounded and
    // the stale head must be gone. (Overflow trims to the target depth,
    // but the queue may then regrow up to the cap before the next trim.)
    stdin.backpressured = false
    stdin.emit('drain')

    const tail = stdin.written.slice(1) // skip the chunk written before backpressure
    const tailBytes = tail.reduce((n, b) => n + b.byteLength, 0)
    const markers = tail.map((b) => b[0])

    expect(tail.length).toBeGreaterThan(0)
    expect(tailBytes).toBeLessThanOrEqual(MAX_QUEUED_BYTES)
    expect(Math.max(...markers)).toBe(79) // the freshest audio survives
    expect(Math.min(...markers)).toBeGreaterThan(2) // the stale backlog was dropped
  })

  it('grows without bound before the cap kicks in only up to MAX', () => {
    const stdin = attachProc()
    const out = new AudioOutput({ sampleRate: 48000, channels: 2, mode: 'music' })
    out.start()

    out.write(chunk(0))
    for (let i = 1; i < 41; i++) {
      out.write(chunk(i)) // 40 chunks = 192000 bytes = exactly MAX
    }

    stdin.backpressured = false
    stdin.emit('drain')

    const tailBytes = stdin.written.slice(1).reduce((n, b) => n + b.byteLength, 0)
    expect(tailBytes).toBeLessThanOrEqual(MAX_QUEUED_BYTES)
  })

  it('stop() discards the pending backlog instead of draining it', () => {
    const stdin = attachProc()
    const out = new AudioOutput({ sampleRate: 48000, channels: 2, mode: 'music' })
    out.start()

    out.write(chunk(0))
    for (let i = 1; i < 10; i++) {
      out.write(chunk(i))
    }

    out.stop()
    expect(stdin.ended).toBe(true)

    // A late drain must not resurrect the discarded backlog.
    stdin.backpressured = false
    stdin.emit('drain')

    expect(stdin.written).toHaveLength(1)
  })

  it('passes audio through in order when the pipeline keeps up', () => {
    const stdin = attachProc()
    stdin.backpressured = false
    const out = new AudioOutput({ sampleRate: 48000, channels: 2, mode: 'music' })
    out.start()

    for (let i = 0; i < 5; i++) {
      out.write(chunk(i))
    }

    expect(stdin.written.map((b) => b[0])).toEqual([0, 1, 2, 3, 4])
  })
})
