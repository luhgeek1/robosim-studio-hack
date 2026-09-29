import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import * as THREE from 'three'
import { SceneBoundary } from '@/shared/ui/boundary'
import { useProduct } from '@/entities/catalog'
import { cn } from '@/shared/lib/utils'
import { modelKindOf, variantFromProduct } from './catalog'
import { Studio, type Framing } from './kit'
import type { DragState } from './store'

// A canvas per card keeps the model under the card's own overlays; it mounts only near the viewport, so a long
// candidate list never holds more WebGL contexts than the browser allows.
function useNearViewport<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: '200px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return { ref, near }
}

/** 3D model of a catalog product: the class picks the model, the product's specs shape it. */
export function RobotPreview3D({
  productId,
  framing,
  className,
}: {
  productId: string
  framing?: Framing
  className?: string
}) {
  const { ref, near } = useNearViewport<HTMLDivElement>()
  const detail = useProduct(productId)
  const product = detail.data
  const kind = product ? modelKindOf(product) : undefined
  const variant = useMemo(
    () => (kind && product ? variantFromProduct(kind, product, product) : undefined),
    [kind, product],
  )
  const bounds = useMemo(() => (kind && variant ? kind.bounds(variant) : undefined), [kind, variant])
  const drag = useRef<DragState>({ yaw: 0 }).current
  const last = useRef<number | null>(null)

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    last.current = e.clientX
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (last.current === null) return
    drag.yaw += (e.clientX - last.current) * 0.012
    last.current = e.clientX
  }
  const onUp = () => {
    last.current = null
  }

  const Model = kind?.Model
  return (
    <div
      ref={ref}
      className={cn('absolute inset-0', kind && 'cursor-grab touch-pan-y active:cursor-grabbing', className)}
      onPointerDown={kind ? onDown : undefined}
      onPointerMove={kind ? onMove : undefined}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {near && Model && variant && bounds && (
        <SceneBoundary>
          <Canvas
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0)
              gl.toneMapping = THREE.ACESFilmicToneMapping
              gl.toneMappingExposure = 1.05
            }}
          >
            <Studio bounds={bounds} drag={drag} framing={framing}>
              <Model v={variant} accent={kind.accent} />
            </Studio>
          </Canvas>
        </SceneBoundary>
      )}
    </div>
  )
}
