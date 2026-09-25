import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { COMPOSITOR_TITLEBAR_H } from '@main/app/compositorLayout'
import { applyHostOutputMode } from '@main/app/hostOutput'
import { loadConfig } from '@main/config/loadConfig'

// Linux windowed (GNOME/labwc): host the UI plus the GStreamer video plane in
// the nested wlroots compositor so they composite into one window, zero-copy :)
export function bootstrapCompositor(): boolean {
  if (process.platform !== 'linux') return false
  if (process.env.LIVI_COMPOSITOR === '1') return false
  if (process.env.LIVI_NO_COMPOSITOR === '1') return false

  // Packaged builds re-launch themselves inside the compositor: the AppImage
  // via $APPIMAGE, the .deb via its own binary.
  const relaunch = process.env.APPIMAGE ?? process.execPath

  // Electron installed separately (nix): process.resourcesPath points at the
  // Electron runtime; the compositor launcher sits next to the app path.
  const candidates: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, 'compositor', 'livi-compositor'))
  }
  const appPath = app?.getAppPath?.() ?? ''
  if (appPath) candidates.push(join(dirname(appPath), 'compositor', 'livi-compositor'))
  const launcher = candidates.find((p) => existsSync(p))
  if (!launcher) return false

  const hostLd = process.env.LD_LIBRARY_PATH ?? ''
  // A separately-installed Electron must be told which app to load on the
  // relaunch; the AppImage resolves its own from the executable.
  const appArg = process.env.APPIMAGE || !appPath ? '' : ` '${appPath}'`
  const inner =
    `LIVI_COMPOSITOR=1 LD_LIBRARY_PATH='${hostLd}' ` +
    `'${relaunch}' --ozone-platform=wayland${appArg}`

  // Control socket: the host drives screen outputs + video placement/crop/visibility over this
  const runtimeDir = process.env.XDG_RUNTIME_DIR || '/tmp'
  const ctrlSocket = join(runtimeDir, 'livi-compositor.ctrl')

  let outputSize: string | undefined
  try {
    const cfg = loadConfig()
    const ow = Math.round(Number(cfg.mainScreenWidth))
    const oh = Math.round(Number(cfg.mainScreenHeight))
    const wantKiosk = cfg.kiosk?.main === true || process.env.LIVI_KIOSK === '1'
    if (ow > 0 && oh > 0) outputSize = `${ow}x${oh + (wantKiosk ? 0 : COMPOSITOR_TITLEBAR_H)}`
    if (wantKiosk) applyHostOutputMode(cfg.displayMode)
  } catch {
    // fall back to the compositor's built-in default
  }

  // Known screen roles; the host opens/closes each output on demand via the control socket
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    // Host windows associate with the installed dev.f-io.livi.desktop entry
    LIVI_OUTPUT_APP_ID: 'dev.f-io.livi',
    LIVI_COMPOSITOR_CTRL: ctrlSocket,
    LIVI_SCREENS: 'main,dash,aux',
    ...(outputSize ? { LIVI_OUTPUT_SIZE: outputSize } : {})
  }
  delete env.APPIMAGE
  delete env.APPDIR
  delete env.ARGV0
  delete env.OWD

  spawn(launcher, ['-s', inner], { detached: true, stdio: 'inherit', env }).unref()
  return true
}
