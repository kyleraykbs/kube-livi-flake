import { renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { useReportVideoInsets } from '../useReportVideoInsets'

type Insets = { role: string; left: number; right: number }

function stubRect(el: HTMLElement, rect: Partial<DOMRect>): void {
  el.getBoundingClientRect = () =>
    ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, ...rect }) as DOMRect
}

describe('useReportVideoInsets', () => {
  let setVideoInsets: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setVideoInsets = vi.fn()
    ;(window as any).projection = { ipc: { setVideoInsets } }
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 })
  })

  test('reports the strip the sidebar reserves on each side', () => {
    const ref = createRef<HTMLDivElement>()
    const el = document.createElement('div')
    stubRect(el, { left: 56, right: 1000 })
    ref.current = el

    renderHook(() => useReportVideoInsets(ref))

    expect(setVideoInsets).toHaveBeenCalledWith({ role: 'main', left: 56, right: 0 })
  })

  test('reports a right-hand-drive rail as a right inset', () => {
    const ref = createRef<HTMLDivElement>()
    const el = document.createElement('div')
    stubRect(el, { left: 0, right: 944 })
    ref.current = el

    renderHook(() => useReportVideoInsets(ref))

    expect(setVideoInsets).toHaveBeenCalledWith({ role: 'main', left: 0, right: 56 })
  })

  test('re-reports on a window resize and skips an unchanged strip', () => {
    const ref = createRef<HTMLDivElement>()
    const el = document.createElement('div')
    stubRect(el, { left: 56, right: 1000 })
    ref.current = el

    renderHook(() => useReportVideoInsets(ref))
    expect(setVideoInsets).toHaveBeenCalledTimes(1)

    window.dispatchEvent(new Event('resize'))
    expect(setVideoInsets).toHaveBeenCalledTimes(1)

    stubRect(el, { left: 0, right: 1000 })
    window.dispatchEvent(new Event('resize'))
    expect(setVideoInsets).toHaveBeenLastCalledWith({ role: 'main', left: 0, right: 0 })
  })

  test('stays silent without a projection bridge', () => {
    delete (window as any).projection
    const ref = createRef<HTMLDivElement>()
    const el = document.createElement('div')
    stubRect(el, { left: 56, right: 1000 })
    ref.current = el

    expect(() => renderHook(() => useReportVideoInsets(ref))).not.toThrow()
  })
})
