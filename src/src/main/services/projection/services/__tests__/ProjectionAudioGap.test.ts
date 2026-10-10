import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '@shared/types'
import type { AudioData } from '../messages'
import { ProjectionAudio } from '../ProjectionAudio'

const h = vi.hoisted(() => {
  class FakeAudioOutput {
    static made: FakeAudioOutput[] = []
    stopped = 0
    constructor(_opts: unknown) {
      FakeAudioOutput.made.push(this)
    }
    start(): void {}
    write(): void {}
    stop(): void {
      this.stopped++
    }
    dispose(): void {}
  }
  return { FakeAudioOutput }
})

vi.mock('@main/services/audio', () => ({
  AudioOutput: h.FakeAudioOutput,
  Microphone: class {
    stop(): void {}
  },
  downsampleToMono: (x: Int16Array): Int16Array => x
}))

// Music is the default logical stream, so no command preamble is needed.
const musicChunk = (): AudioData =>
  ({
    data: new Int16Array(960),
    audioType: 0,
    sampleRate: 48000,
    channels: 2
  }) as AudioData

function makeAudio(): ProjectionAudio {
  return new ProjectionAudio(() => ({}) as Config, vi.fn() as never, vi.fn() as never, vi.fn() as never)
}

beforeEach(() => {
  vi.useFakeTimers()
  h.FakeAudioOutput.made.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ProjectionAudio music gap handling', () => {
  it('stops the music player when the stream goes silent (phone-side pause)', () => {
    const pa = makeAudio()
    pa.handleAudioData(musicChunk())
    const player = h.FakeAudioOutput.made[0]
    expect(player).toBeDefined()

    // No further chunks: the watchdog must drop the stale player instead
    // of letting its backlog play out.
    vi.advanceTimersByTime(600)
    expect(player.stopped).toBe(1)
  })

  it('replaces the stale player when chunks resume after a gap', () => {
    const pa = makeAudio()
    pa.handleAudioData(musicChunk())
    const first = h.FakeAudioOutput.made[0]

    // Land between the gap threshold (500ms) and the watchdog (525ms) so
    // the arrival path is what resets.
    vi.advanceTimersByTime(510)
    pa.handleAudioData(musicChunk())

    expect(first.stopped).toBe(1)
    expect(h.FakeAudioOutput.made).toHaveLength(2)
    expect(h.FakeAudioOutput.made[1].stopped).toBe(0)
  })

  it('never resets a continuously flowing stream', () => {
    const pa = makeAudio()
    for (let i = 0; i < 10; i++) {
      pa.handleAudioData(musicChunk())
      vi.advanceTimersByTime(100)
    }

    expect(h.FakeAudioOutput.made).toHaveLength(1)
    expect(h.FakeAudioOutput.made[0].stopped).toBe(0)
  })
})
