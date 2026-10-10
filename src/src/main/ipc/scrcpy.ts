import { sendCompositorLine } from '@main/app/compositorCtrl'
import { registerIpcHandle } from '@main/ipc/register'
import type { ScrcpySupervisor } from '@main/services/scrcpy/ScrcpySupervisor'

export function registerScrcpyIpc(supervisor: ScrcpySupervisor): void {
  registerIpcHandle('scrcpy-type', async (_evt, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0) return
    await supervisor.typeText(text)
  })

  registerIpcHandle('scrcpy-key', async (_evt, keycode: unknown) => {
    if (typeof keycode !== 'number' || !Number.isFinite(keycode)) return
    await supervisor.sendKey(keycode)
  })

  // The compositor lays the mirror out around the UI's reserved strips (rail, mode
  // switch, on-screen keyboard), so the renderer reports them whenever they change.
  registerIpcHandle('scrcpy-insets', async (_evt, insets: unknown) => {
    // boundary read of our own renderer's payload; every field is validated
    const payload = (insets ?? {}) as { left?: unknown; right?: unknown; bottom?: unknown }
    const px = (v: unknown): number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0
    sendCompositorLine(
      `phoneinsets ${px(payload.left)} ${px(payload.right)} ${px(payload.bottom)}\n`
    )
  })
}
