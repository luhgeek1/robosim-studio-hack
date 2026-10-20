import { lazy, Suspense, useRef, useState } from 'react'
import { useInView } from 'framer-motion'
import type { ObjectKind } from '../landing/LandingScene'

const LandingScene = lazy(() => import('../landing/LandingScene'))

export function IndustryModel({ kind, name }: { kind: ObjectKind; name: string }) {
  const root = useRef<HTMLDivElement>(null)
  const inView = useInView(root, { margin: '200px 0px' })
  const [hovered, setHovered] = useState(false)
  const poster = (
    <img
      src={`/design-lab/atlas/assets/visuals/${kind}.svg`}
      alt={`Пространственная схема: ${name.toLowerCase()}`}
      loading="lazy"
    />
  )
  return (
    <div
      className="platform-industry-model"
      ref={root}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
    >
      {inView ? (
        <Suspense fallback={poster}>
          <LandingScene kind={kind} paused={!hovered} />
        </Suspense>
      ) : (
        poster
      )}
    </div>
  )
}
