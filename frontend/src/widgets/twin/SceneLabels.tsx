import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { labelEndpoint, overlaps, type LabelRect } from '@/widgets/layout-map/label-placement'
import type { SceneLabel } from './scene-frame'

type LabelRefs = RefObject<Map<string, HTMLDivElement>>

export function LabelLayer({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {labels.map((label) => (
        <div
          key={label.id}
          ref={(el) => {
            if (el) refs.current.set(label.id, el)
            else refs.current.delete(label.id)
          }}
          className="absolute top-0 left-0 transition-opacity duration-200 motion-reduce:transition-none"
          style={{ opacity: 0 }}
        >
          <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden="true">
            <line stroke="#6c6a64" strokeOpacity={0.45} />
            <circle r={1.5} fill="#6c6a64" />
          </svg>
          <div
            data-map-label={label.id}
            className="absolute top-0 left-0 w-max max-w-52 rounded-sm bg-white/80 px-1 py-px text-center text-[11px] leading-[14px] font-medium break-words text-ink-2 select-none"
          >
            {label.name}
          </div>
        </div>
      ))}
    </div>
  )
}

const point = new THREE.Vector3()
const edgePoint = new THREE.Vector3()
const outsidePoint = new THREE.Vector3()

export function LabelProjector({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  const allowed = useRef(new Map<string, boolean>())
  const cameraState = useRef({
    world: new THREE.Matrix4(),
    projection: new THREE.Matrix4(),
    metrics: '',
    idle: 0,
    dirty: true,
  })
  useFrame(({ camera, size }, delta) => {
    const elements = labels.flatMap((label) => {
      const el = refs.current.get(label.id)
      if (!el) return []
      const caption = el.children[1] as HTMLDivElement
      return [{ label, el, caption, width: caption.offsetWidth, height: caption.offsetHeight }]
    })
    const state = cameraState.current
    const metrics = `${size.width}:${size.height}:${elements.map(({ label, width, height }) => `${label.id}:${width}:${height}`).join(';')}`
    const moving =
      state.world.elements.some((value, i) => Math.abs(value - camera.matrixWorld.elements[i]) > 0.001) ||
      !state.projection.equals(camera.projectionMatrix) ||
      state.metrics !== metrics
    state.world.copy(camera.matrixWorld)
    state.projection.copy(camera.projectionMatrix)
    state.metrics = metrics
    state.idle = moving ? 0 : state.idle + delta
    state.dirty ||= moving

    const placements = elements.map(({ label, el, caption, width, height }) => {
      point.set(label.x, 0.3, label.z).project(camera)
      const x = ((point.x + 1) / 2) * size.width
      const y = ((1 - point.y) / 2) * size.height
      let cx = x
      let cy = y - height / 2 - 10
      let edgeVisible = true
      if (label.edge) {
        const edge = label.edge
        edgePoint.set(edge.x, 0.3, edge.z).project(camera)
        outsidePoint.set(edge.x + edge.dx, 0.3, edge.z + edge.dz).project(camera)
        edgeVisible = Math.abs(edgePoint.z) <= 1 && Math.abs(outsidePoint.z) <= 1
        const dx = (outsidePoint.x - edgePoint.x) * size.width
        const dy = (edgePoint.y - outsidePoint.y) * size.height
        const length = Math.hypot(dx, dy) || 1
        const nx = dx / length
        const ny = dy / length
        const clearance = (Math.abs(nx) * width) / 2 + (Math.abs(ny) * height) / 2 + 8
        cx = ((edgePoint.x + 1) / 2) * size.width + nx * clearance
        cy = ((1 - edgePoint.y) / 2) * size.height + ny * clearance
      }
      const box: LabelRect = {
        x: Math.max(8, Math.min(size.width - width - 8, cx - width / 2)),
        y: Math.max(8, Math.min(size.height - height - 8, cy - height / 2)),
        width,
        height,
      }
      return {
        label,
        el,
        caption,
        box,
        x,
        y,
        visible: edgeVisible && Math.abs(point.z) <= 1 && Math.abs(point.x) <= 1.1 && Math.abs(point.y) <= 1.1,
      }
    })

    // Resolve crowding only after the camera settles; moving annotations retain their identity and visibility.
    if (state.dirty && state.idle > 0.25) {
      const occupied: LabelRect[] = []
      const host = elements[0]?.el.parentElement?.parentElement
      if (host) {
        const bounds = host.getBoundingClientRect()
        for (const control of host.querySelectorAll('[data-map-control]')) {
          const rect = control.getBoundingClientRect()
          occupied.push({ x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height })
        }
      }
      const ordered = [...placements].sort(
        (a, b) => Number(allowed.current.get(b.label.id) ?? true) - Number(allowed.current.get(a.label.id) ?? true),
      )
      for (const { label, box, visible } of ordered) {
        const show = visible && occupied.every((other) => !overlaps(box, other, 4))
        allowed.current.set(label.id, show)
        if (show) occupied.push(box)
      }
      state.dirty = false
    }
    for (const { label, el, caption, box, x, y, visible } of placements) {
      el.style.opacity = visible && (allowed.current.get(label.id) ?? true) ? '1' : '0'
      if (!visible) continue
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      caption.style.transform = `translate(${box.x - x}px, ${box.y - y}px)`
      const line = el.querySelector('line')!
      const end = labelEndpoint(box, { x, y })
      line.setAttribute('x2', String(end.x - x))
      line.setAttribute('y2', String(end.y - y))
      const connector = el.children[0] as SVGSVGElement
      connector.style.display = label.edge ? '' : 'none'
    }
  })
  return null
}
