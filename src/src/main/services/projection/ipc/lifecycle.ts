import { registerIpcHandle, registerIpcOn } from '@main/ipc/register'
import type { ClusterScreen } from '@shared/utils'
import type { ProjectionIpcHost } from './types'

type Deps = Pick<
  ProjectionIpcHost,
  | 'start'
  | 'stop'
  | 'restartSession'
  | 'pickPreferredTransport'
  | 'applyCodecCapabilities'
  | 'setVideoVisible'
  | 'setViewInsets'
>

// Sidebar strip a window's UI reserves, in px. Only 'dash'/'aux' name a secondary
// window; anything else belongs to the main window.
const toRole = (role: unknown): ClusterScreen =>
  role === 'dash' || role === 'aux' ? role : 'main'

const toPx = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)

export function registerLifecycleIpc(host: Deps): void {
  registerIpcHandle('projection-start', async () => host.start())

  registerIpcHandle('projection-stop', async () => {
    if (host.pickPreferredTransport() === 'aa') return
    return host.stop()
  })

  registerIpcHandle('projection-restart', async () => host.restartSession())

  registerIpcHandle('projection-set-visible', async (_evt, visible: boolean) => {
    host.setVideoVisible(Boolean(visible))
  })

  registerIpcOn(
    'projection-video-insets',
    (_evt, insets: { role?: unknown; left?: unknown; right?: unknown }) => {
      host.setViewInsets(toRole(insets?.role), toPx(insets?.left), toPx(insets?.right))
    }
  )

  registerIpcHandle('projection-codec-capabilities', async (_evt, caps: unknown) => {
    host.applyCodecCapabilities(caps)
  })
}
