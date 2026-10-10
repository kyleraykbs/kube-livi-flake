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

  // The mirror is classified into the compositor's phone layer; while the on-screen
  // keyboard is up the UI must sit above it or the keyboard would be painted under
  // the mirrored phone.
  registerIpcHandle('scrcpy-osk', async (_evt, open: unknown) => {
    sendCompositorLine(`phoneorder ${open === true ? 'below' : 'above'}\n`)
  })
}
