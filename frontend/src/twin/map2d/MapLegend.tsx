import { useMemo } from 'react'
import type { Layout, ZoneKind } from '@/api/types'
import {
  EDGE_KIND_LABEL,
  EDGE_STYLE,
  MARKER_COLOR,
  MARKER_KINDS,
  MARKER_LABEL,
  ZONE_COLOR,
  ZONE_KIND_LABEL,
  type EdgeKind,
  type MarkerKind,
} from './geometry'

export function MapLegend({ layout, showGraph }: { layout: Layout; showGraph: boolean }) {
  const { zoneKinds, markerKinds, edgeKinds } = useMemo(() => {
    const zones = new Set<ZoneKind>(layout.zones.map((z) => z.kind))
    const nodes = new Set<string>(layout.nodes.map((n) => n.kind))
    const edges = new Set<EdgeKind>(layout.edges.map((e) => e.kind ?? 'rack_aisle'))
    return {
      zoneKinds: [...zones],
      markerKinds: MARKER_KINDS.filter((k) => nodes.has(k)),
      edgeKinds: (Object.keys(EDGE_KIND_LABEL) as EdgeKind[]).filter((k) => edges.has(k)),
    }
  }, [layout])

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-ink-3">
      {zoneKinds.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block size-3 rounded-sm border"
            style={{
              background: `color-mix(in oklab, ${ZONE_COLOR[kind]} 25%, transparent)`,
              borderColor: ZONE_COLOR[kind],
            }}
          />
          {ZONE_KIND_LABEL[kind]}
        </span>
      ))}
      {(layout.racks?.length ?? 0) > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-1.5 rounded-[1px]" style={{ background: 'oklch(0.5 0.05 250 / 0.6)' }} />
          Стеллажи
        </span>
      )}
      {markerKinds.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <MarkerSwatch kind={kind} />
          {MARKER_LABEL[kind]}
        </span>
      ))}
      {showGraph &&
        edgeKinds.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5">
            <svg width={18} height={8} aria-hidden>
              <line
                x1={1}
                y1={4}
                x2={17}
                y2={4}
                stroke={EDGE_STYLE[kind].color}
                strokeWidth={EDGE_STYLE[kind].width + 0.4}
                strokeDasharray={EDGE_STYLE[kind].dash}
              />
            </svg>
            {EDGE_KIND_LABEL[kind]}
          </span>
        ))}
    </div>
  )
}

function MarkerSwatch({ kind }: { kind: MarkerKind }) {
  const fill = MARKER_COLOR[kind]
  return (
    <svg width={12} height={12} aria-hidden>
      {kind === 'pick_station' || kind === 'dropoff' ? (
        <circle cx={6} cy={6} r={5} fill={fill} />
      ) : kind === 'charger' ? (
        <path d="M6 0.5L11.5 6L6 11.5L0.5 6Z" fill={fill} />
      ) : (
        <rect x={1} y={1} width={10} height={10} rx={1.5} fill={fill} />
      )}
    </svg>
  )
}
