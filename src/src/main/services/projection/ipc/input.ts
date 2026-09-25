import { registerIpcHandle, registerIpcOn } from '@main/ipc/register'
import { parseRawKeyCommand } from '@shared/types/InputCommand'
import { SendCommand, SendMultiTouch, SendRawKey, SendTouch } from '../messages/sendable'
import type { ProjectionIpcHost } from './types'

type MultiTouchPoint = { id: number; x: number; y: number; action: number }

const to01 = (v: number): number => {
  const n = Number.isFinite(v) ? v : 0
  return n < 0 ? 0 : n > 1 ? 1 : n
}

type Deps = Pick<ProjectionIpcHost, 'send' | 'isStarted'>

export function registerInputIpc(host: Deps): void {
  registerIpcHandle('projection-sendframe', async () => host.send(new SendCommand('frame')))

  registerIpcOn('projection-touch', (_evt, data: { x: number; y: number; action: number }) => {
    try {
      host.send(new SendTouch(data.x, data.y, data.action))
    } catch {
      // ignore
    }
  })

  registerIpcOn('projection-multi-touch', (_evt, points: MultiTouchPoint[]) => {
    try {
      if (!Array.isArray(points) || points.length === 0) return
      const safe = points.map((p) => ({
        id: p.id | 0,
        x: to01(p.x),
        y: to01(p.y),
        action: p.action | 0
      }))
      host.send(new SendMultiTouch(safe))
    } catch {
      // ignore
    }
  })

  registerIpcOn('projection-command', (_evt, command: string) => {
    // Typing: `key:<Android keycode>` from the UI's physical keyboard. Routed
    // as a SendRawKey because SendCommand's constructor maps its argument
    // through CommandMapping, which turns raw keys into undefined.
    const rawKey = parseRawKeyCommand(command)
    if (rawKey !== null) {
      host.send(new SendRawKey(rawKey))
      return
    }
    host.send(new SendCommand(command as ConstructorParameters<typeof SendCommand>[0]))
  })
}
