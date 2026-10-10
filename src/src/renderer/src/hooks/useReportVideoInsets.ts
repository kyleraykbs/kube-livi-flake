import { RefObject, useEffect } from 'react'
import { getWindowRole } from '../utils/windowRole'

// The host UI's sidebar takes real layout width, so the native video plane has to be
// scaled into what is left of the window — otherwise the phone's display runs underneath
// the rail. Report the strip this window's UI reserves (px, per side) to the compositor.
export function useReportVideoInsets(
  mainRef: RefObject<HTMLElement | null>,
  scrcpyMode = false
): void {
  useEffect(() => {
    const el = mainRef.current ?? document.getElementById('content-root')
    if (!el) return

    const role = getWindowRole()
    let last = ''

    const report = (): void => {
      const rect = el.getBoundingClientRect()
      let left = Math.max(0, Math.round(rect.left))
      let right = Math.max(0, Math.round(window.innerWidth - rect.right))

      // In scrcpy mode there is no full-bleed video plane, but the fixed mode switch
      // sits at the top right while the rail is on its own side: measure BOTH so the
      // mirrored phone window stays clear of each (the cluster floats wider than the
      // rail, so a rail-width inset alone left its edge covered).
      if (scrcpyMode) {
        const navRect = document.getElementById('nav-root')?.getBoundingClientRect()
        const clusterRect = document.getElementById('scrcpy-cluster')?.getBoundingClientRect()
        const railWidth = navRect ? Math.max(0, Math.round(navRect.width)) : 0
        const CLUSTER_MARGIN = 8
        const navOnLeft = navRect ? navRect.left <= window.innerWidth - navRect.right : false
        const clusterOnLeft = clusterRect
          ? clusterRect.left <= window.innerWidth - clusterRect.right
          : false
        const clusterStrip = clusterRect
          ? Math.round(
              (clusterOnLeft ? clusterRect.right : window.innerWidth - clusterRect.left) +
                CLUSTER_MARGIN
            )
          : 0
        left =
          (navRect && navOnLeft ? railWidth : 0) + (clusterRect && clusterOnLeft ? clusterStrip : 0)
        right =
          (navRect && !navOnLeft ? railWidth : 0) +
          (clusterRect && !clusterOnLeft ? clusterStrip : 0)
        if (left === 0 && right === 0) {
          return
        }
      }

      const key = `${left}:${right}`
      if (key === last) return
      last = key
      window.projection?.ipc?.setVideoInsets?.({ role, left, right })
    }

    report()
    // the rail can settle a frame after mount (fonts, nav content): measure again then
    const raf =
      typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => report()) : null
    window.addEventListener('resize', report)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(report) : null
    observer?.observe(el)

    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
      window.removeEventListener('resize', report)
      observer?.disconnect()
    }
  }, [mainRef, scrcpyMode])
}
