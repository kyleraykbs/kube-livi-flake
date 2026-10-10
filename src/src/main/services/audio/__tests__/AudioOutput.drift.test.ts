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

// 48kHz stereo s16le = 192 bytes/ms; 960 frames = 20ms chunks.
const BYTES_PER_MS = 192
const FRAME_BYTES = 4
const FRAMES = 960
const CHUNK = FRAMES * FRAME_BYTES

class FakeStdin extends EventEmitter {
  destroyed = false
  backpressured = true
  written: Buffer[] = []

  write(buf: Buffer): boolean {
    this.written.push(buf)
    return !this.backpressured
  }

  end(): void {}
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

function startAtDepth(depthMs: number): { out: AudioOutput; stdin: FakeStdin } {
  const stdin = attachProc()
  const out = new AudioOutput({ sampleRate: 48000, channels: 2, mode: 'music' })
  out.start()
  // Test seam: the private depth counter is the drift controller's input.
  const internals = out as unknown as { queuedBytes: number }
  internals.queuedBytes = depthMs * BYTES_PER_MS
  return { out, stdin }
}

function frames(buf: Buffer): number {
  return buf.byteLength / FRAME_BYTES
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AudioOutput drift compensation', () => {
  it('passes audio through untouched inside the deadband', () => {
    // 300ms = STEER_TARGET_MS: no correction.
    const { out, stdin } = startAtDepth(300)
    const chunk = Buffer.alloc(CHUNK, 7)

    out.write(chunk)

    expect(stdin.written).toHaveLength(1)
    expect(stdin.written[0].byteLength).toBe(CHUNK)
  })

  it('squeezes the chunk when the queue is deeper than target', () => {
    // 400ms depth: 100ms over target => squeeze just above the deadband.
    const { out, stdin } = startAtDepth(400)

    out.write(Buffer.alloc(CHUNK))

    const got = frames(stdin.written[0])
    expect(got).toBeLessThan(FRAMES)
    expect(got).toBeGreaterThanOrEqual(FRAMES - 2)
  })

  it('stretches the chunk when the queue is shallower than target', () => {
    const { out, stdin } = startAtDepth(0)

    out.write(Buffer.alloc(CHUNK))

    const got = frames(stdin.written[0])
    expect(got).toBeGreaterThan(FRAMES)
  })

  it('holds the long-run rate at the saturation ratio under heavy drift', () => {
    // 650ms depth: correction saturates at a 0.5% squeeze, but stays
    // under the flood trim. Each chunk is consumed as it is written so
    // the depth - and therefore the correction - stays put.
    const { out, stdin } = startAtDepth(650)
    stdin.backpressured = false
    for (let i = 0; i < 200; i++) {
      out.write(Buffer.alloc(CHUNK))
    }

    const totalOut = stdin.written.reduce((n, b) => n + frames(b), 0)
    const expected = 200 * FRAMES * 0.995
    expect(Math.abs(totalOut - expected)).toBeLessThanOrEqual(200)
  })
})
