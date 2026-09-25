import { RefObject, useEffect } from 'react'
import { getWindowRole } from '../utils/windowRole'

// The host UI's sidebar takes real layout width, so the native video plane has to be
// scaled into what is left of the window — otherwise the phone's display runs underneath
// the rail. Report the strip this window's UI reserves (px, per side) to the compositor.
export function useReportVideoInsets(mainRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = mainRef.current ?? document.getElementById('content-root')
    if (!el) return

    const role = getWindowRole()
    let last = ''

    const report = (): void => {
      const rect = el.getBoundingClientRect()
      const left = Math.max(0, Math.round(rect.left))
      const right = Math.max(0, Math.round(window.innerWidth - rect.right))
      const key = `${left}:${right}`
      if (key === last) return
      last = key
      window.projection?.ipc?.setVideoInsets?.({ role, left, right })
    }

    report()
    window.addEventListener('resize', report)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null
    observer?.observe(el)

    return () => {
      window.removeEventListener('resize', report)
      observer?.disconnect()
    }
  }, [mainRef])
}
