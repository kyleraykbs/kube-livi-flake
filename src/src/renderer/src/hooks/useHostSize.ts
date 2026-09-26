import { useEffect, useState } from 'react'

export type HostSize = { w: number; h: number; left: number; top: number }

const read = (): HostSize => {
  const el = document.getElementById('content-root')
  const r = el?.getBoundingClientRect()
  // Atomic: never mix a settled column axis with a not-yet-laid-out one, which would
  // centre the content on the window while scaling it to the column.
  if (r && r.width > 0 && r.height > 0) {
    return {
      w: Math.round(r.width),
      h: Math.round(r.height),
      left: Math.round(r.left),
      top: Math.round(r.top)
    }
  }
  return { w: window.innerWidth, h: window.innerHeight, left: 0, top: 0 }
}

// Pages that scale a fixed design to "the screen" must measure the content column they
// actually live in: the nav rail keeps its own layout width, so the window is wider than
// the host area. Falls back to the window when there is no content column (tests, dialogs).
// Debounced: attaching the native cluster plane makes macOS relayout the window, which
// fires transient 1-2px resize blips; only a size that holds for a beat is a real change.
export function useHostSize(settleMs = 150): HostSize {
  const [size, setSize] = useState<HostSize>(read)

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | null = null

    const apply = (): void => {
      const next = read()
      setSize((prev) =>
        prev.w === next.w && prev.h === next.h && prev.left === next.left && prev.top === next.top
          ? prev
          : next
      )
    }

    const onSettle = (): void => {
      if (settle != null) clearTimeout(settle)
      settle = setTimeout(() => {
        settle = null
        apply()
      }, settleMs)
    }

    const el = document.getElementById('content-root')
    window.addEventListener('resize', onSettle)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onSettle) : null
    if (el) observer?.observe(el)

    // The first render can read a column that is not laid out yet; measure again once the
    // frame is committed.
    const raf =
      typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => apply()) : null

    return () => {
      if (raf !== null) cancelAnimationFrame(raf)
      if (settle != null) clearTimeout(settle)
      window.removeEventListener('resize', onSettle)
      observer?.disconnect()
    }
  }, [settleMs])

  return size
}
