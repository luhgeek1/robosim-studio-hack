import { useFrame } from '@react-three/fiber'
import { useRef, type RefObject } from 'react'
import * as THREE from 'three'
import type { SceneLabel } from './scene3d'

type LabelRefs = RefObject<Map<string, HTMLDivElement>>

/* Zone names are plain DOM over the canvas, moved every frame by projecting their scene point through the camera.
   drei <Html> gives each label its own React root, and with React 19 those roots fail to unmount cleanly. */
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
          className="absolute top-0 left-0 rounded-full border border-line bg-white/95 px-2.5 py-1 text-[12px] font-medium whitespace-nowrap text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)] select-none"
          style={{ visibility: 'hidden' }}
        >
          {label.name}
        </div>
      ))}
    </div>
  )
}

const point = new THREE.Vector3()

export function LabelProjector({ labels, refs }: { labels: SceneLabel[]; refs: LabelRefs }) {
  const last = useRef(new Map<string, string>())
  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const el = refs.current.get(label.id)
      if (!el) continue
      point.set(label.x, 0.3, label.z).project(camera)
      const visible = point.z < 1 && Math.abs(point.x) < 1.2 && Math.abs(point.y) < 1.2
      const x = Math.round(((point.x + 1) / 2) * size.width)
      const y = Math.round(((1 - point.y) / 2) * size.height)
      const next = visible ? `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)` : 'hidden'
      if (last.current.get(label.id) === next) continue
      last.current.set(label.id, next)
      if (visible) {
        el.style.transform = next
        el.style.visibility = 'visible'
      } else el.style.visibility = 'hidden'
    }
  })
  return null
}
