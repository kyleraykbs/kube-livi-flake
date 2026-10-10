import { connect } from 'node:net'
import { registerIpcHandle } from '@main/ipc/register'
import type { ScrcpySupervisor } from '@main/services/scrcpy/ScrcpySupervisor'

/**
 * The native compositor classifies a toplevel titled "livi:phone" into its phone
 * layer. While the on-screen keyboard is up the UI must sit above that window or
 * the keyboard would be painted underneath the mirrored phone. Best-effort: the
 * control socket only exists inside compositor mode.
 */
function sendCompositorLine(line: string): void {
  const path = process.env.LIVI_COMPOSITOR_CTRL ?? ''
  if (process.platform !== 'linux' || path.length === 0) return
  try {
    const sock = connect(path)
    sock.on('error', () => {})
    sock.on('connect', () => {
      sock.write(line)
      sock.end()
    })
  } catch {
    // compositor gone; ordering will be reapplied on the next toggle
  }
}

export function registerScrcpyIpc(supervisor: ScrcpySupervisor): void {
  registerIpcHandle('scrcpy-type', async (_evt, text: unknown) => {
    if (typeof text !== 'string' || text.length === 0) return
    await supervisor.typeText(text)
  })

  registerIpcHandle('scrcpy-key', async (_evt, keycode: unknown) => {
    if (typeof keycode !== 'number' || !Number.isFinite(keycode)) return
    await supervisor.sendKey(keycode)
  })

  registerIpcHandle('scrcpy-osk', async (_evt, open: unknown) => {
    sendCompositorLine(`phoneorder ${open === true ? 'below' : 'above'}\n`)
  })
}
