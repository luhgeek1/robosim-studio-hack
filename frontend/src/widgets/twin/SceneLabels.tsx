import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { LayoutGeometry } from '@/shared/api/types'
import { labelEndpoint, placeLabel, type LabelRect } from '@/widgets/layout-map/label-placement'
import type { SceneFrame, SceneLabel } from './scene-frame'

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
          className="absolute top-0 left-0"
          style={{ visibility: 'hidden' }}
        >
          <svg className="absolute top-0 left-0 overflow-visible" width={1} height={1} aria-hidden="true">
            <line stroke="#6c6a64" strokeOpacity={0.65} />
            <circle r={2} fill="#6c6a64" />
          </svg>
          <div
            data-map-label={label.id}
            className="absolute top-0 left-0 w-max max-w-60 rounded-md bg-white/95 px-2 py-1 text-center text-[11px] leading-4 font-medium break-words text-ink-2 shadow-sm select-none"
          >
            {label.name}
          </div>
        </div>
      ))}
    </div>
  )
}

const point = new THREE.Vector3()

export function LabelProjector({
  labels,
  refs,
  layout,
  frame,
}: {
  labels: SceneLabel[]
  refs: LabelRefs
  layout: LayoutGeometry
  frame: SceneFrame
}) {
  const last = useRef(new WeakMap<HTMLDivElement, string>())
  const markers = useMemo(
    () =>
      layout.nodes.filter((node) =>
        ['dock_in', 'dock_out', 'charger', 'pick_station', 'elevator', 'dropoff'].includes(node.kind),
      ),
    [layout.nodes],
  )
  useFrame(({ camera, size }) => {
    const elements = labels.flatMap((label) => {
      const el = refs.current.get(label.id)
      if (!el) return []
      const caption = el.children[1] as HTMLDivElement
      return [{ label, el, caption, width: caption.offsetWidth, height: caption.offsetHeight }]
    })
    const occupied: LabelRect[] = []
    const host = refs.current.values().next().value?.parentElement?.parentElement
    if (host) {
      const bounds = host.getBoundingClientRect()
      for (const control of host.querySelectorAll('[data-map-control]')) {
        const rect = control.getBoundingClientRect()
        occupied.push({ x: rect.x - bounds.x, y: rect.y - bounds.y, width: rect.width, height: rect.height })
      }
    }
    for (const node of markers) {
      const corners = []
      for (const dx of [-1.6, 1.6]) {
        for (const dz of [-1.6, 1.6]) {
          for (const y of [0, 1.2]) {
            point.set(frame.x(node.x) + dx, y, frame.z(node.y) + dz).project(camera)
            if (Math.abs(point.z) <= 1)
              corners.push({ x: ((point.x + 1) / 2) * size.width, y: ((1 - point.y) / 2) * size.height })
          }
        }
      }
      if (!corners.length) continue
      const xs = corners.map((p) => p.x)
      const ys = corners.map((p) => p.y)
      occupied.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      })
    }
    for (const label of labels) {
      point.set(label.x, 0.3, label.z).project(camera)
      if (Math.abs(point.z) > 1) continue
      occupied.push({
        x: ((point.x + 1) / 2) * size.width - 6,
        y: ((1 - point.y) / 2) * size.height - 6,
        width: 12,
        height: 12,
      })
    }
    for (const { label, el, caption, width, height } of elements) {
      point.set(label.x, 0.3, label.z).project(camera)
      const visible = Math.abs(point.z) <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1
      const x = Math.round(((point.x + 1) / 2) * size.width)
      const y = Math.round(((1 - point.y) / 2) * size.height)
      const box = visible ? placeLabel({ id: label.id, x, y, width, height }, size, occupied) : null
      if (box) occupied.push(box)
      const next = box ? `${x},${y},${box.x},${box.y},${width},${height}` : 'hidden'
      if (last.current.get(el) === next) continue
      last.current.set(el, next)
      el.style.visibility = box ? 'visible' : 'hidden'
      if (!box) continue
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      caption.style.transform = `translate(${box.x - x}px, ${box.y - y}px)`
      const end = labelEndpoint(box, { x, y })
      const line = el.querySelector('line')!
      line.setAttribute('x2', String(end.x - x))
      line.setAttribute('y2', String(end.y - y))
    }
  })
  return null
}
