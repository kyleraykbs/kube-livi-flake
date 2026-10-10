import { connect } from 'node:net'

/**
 * Best-effort one-shot line to the native compositor's control socket (which only
 * exists in compositor mode). Connect, write, close; never throws - the socket is
 * advisory and its absence just means there is no nested compositor to steer.
 */
export function sendCompositorLine(line: string): void {
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
    // compositor gone; the line is advisory
  }
}
