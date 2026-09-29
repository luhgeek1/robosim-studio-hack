import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'

export type LayoutMapView = {
  /** Pixels per meter. */
  k: number
  tx: number
  ty: number
}

export type FitPadding = { x: number; top: number; bottom: number }

// Room for the toolbar above and the scale bar below, so the building is not hidden under the controls at fit.
const DEFAULT_PAD: FitPadding = { x: 24, top: 52, bottom: 40 }
const MIN_ZOOM = 0.5
const MAX_ZOOM = 40

export function fitView(
  width: number,
  height: number,
  contentW: number,
  contentH: number,
  pad: FitPadding = DEFAULT_PAD,
): LayoutMapView {
  const k = Math.max(0.0001, Math.min((width - pad.x * 2) / contentW, (height - pad.top - pad.bottom) / contentH))
  return { k, tx: (width - contentW * k) / 2, ty: pad.top + (height - pad.top - pad.bottom - contentH * k) / 2 }
}

export function useViewport(
  containerRef: RefObject<HTMLDivElement | null>,
  contentW: number,
  contentH: number,
  fitKey: string,
  pad: FitPadding = DEFAULT_PAD,
) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState<LayoutMapView>({ k: 1, tx: 0, ty: 0 })
  const fitK = useRef(1)
  const fittedFor = useRef<string | null>(null)
  const drag = useRef<{ id: number; x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [containerRef])

  const fit = useCallback(() => {
    if (!size.width || !size.height) return
    const next = fitView(size.width, size.height, contentW, contentH, pad)
    fitK.current = next.k
    setView(next)
  }, [size.width, size.height, contentW, contentH, pad])

  const key = `${fitKey}:${size.width}x${size.height}`
  useLayoutEffect(() => {
    if (fittedFor.current === key || !size.width) return
    fittedFor.current = key
    fit()
  }, [key, fit, size.width])

  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const k = Math.min(fitK.current * MAX_ZOOM, Math.max(fitK.current * MIN_ZOOM, v.k * factor))
      const applied = k / v.k
      return { k, tx: px - (px - v.tx) * applied, ty: py - (py - v.ty) * applied }
    })
  }, [])

  // React registers wheel listeners as passive, so preventDefault (to stop page scroll) needs a native listener.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = el.getBoundingClientRect()
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      zoomAt(Math.exp(-delta * 0.0015), event.clientX - rect.left, event.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [containerRef, zoomAt])

  const zoomCenter = useCallback(
    (factor: number) => zoomAt(factor, size.width / 2, size.height / 2),
    [zoomAt, size.width, size.height],
  )

  // Активные касания: один палец двигает план, два — масштабируют вокруг середины между ними и тоже двигают.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    const rest = [...pointers.current.entries()][0]
    drag.current = rest ? { id: rest[0], x: rest[1].x, y: rest[1].y } : null
  }

  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || (event.target as Element).closest('[data-map-control]')) return
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (!drag.current) drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      const prev = pointers.current.get(event.pointerId)
      if (!prev) return
      const next = { x: event.clientX, y: event.clientY }
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()]
        const other = a === prev ? b : a
        const rect = event.currentTarget.getBoundingClientRect()
        const before = Math.hypot(prev.x - other.x, prev.y - other.y)
        const after = Math.hypot(next.x - other.x, next.y - other.y)
        const mid = { x: (next.x + other.x) / 2 - rect.left, y: (next.y + other.y) / 2 - rect.top }
        // Сдвиг середины — половина хода пальца: второй палец в этом событии стоит на месте.
        const dx = (next.x - prev.x) / 2
        const dy = (next.y - prev.y) / 2
        pointers.current.set(event.pointerId, next)
        if (before > 0) zoomAt(after / before, mid.x, mid.y)
        setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
        return
      }
      pointers.current.set(event.pointerId, next)
      const d = drag.current
      if (!d || d.id !== event.pointerId) return
      const dx = event.clientX - d.x
      const dy = event.clientY - d.y
      d.x = event.clientX
      d.y = event.clientY
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
    },
    onPointerUp: release,
    onPointerCancel: release,
  }

  return { size, view, fit, zoomCenter, handlers }
}
