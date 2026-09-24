import type { Layout, LayoutNode } from '@/shared/api/types'
import type { LayoutRoute } from './labels'

export type RouteKey = LayoutRoute['key']

export type ExampleRoute = { nodes: LayoutNode[]; length: number; from: LayoutNode; to: LayoutNode }

type Adjacency = Map<string, [string, number][]>

// The same graphs as the backend (`engine/layout/graph.py`): pallet robots do not cut through the G2P field.
function adjacency(layout: Layout, pallets: boolean, reverse: boolean): Adjacency {
  const picking = new Set(layout.zones.filter((z) => z.kind === 'picking').map((z) => z.id))
  const zoneOf = new Map(layout.nodes.map((n) => [n.id, n.zone_id]))
  const inPicking = (id: string) => picking.has(zoneOf.get(id) ?? '')
  const adj: Adjacency = new Map()
  const add = (a: string, b: string, length: number) => {
    const list = adj.get(a)
    if (list) list.push([b, length])
    else adj.set(a, [[b, length]])
  }
  for (const edge of layout.edges) {
    if (pallets && inPicking(edge.from) && inPicking(edge.to)) continue
    const [a, b] = reverse ? [edge.to, edge.from] : [edge.from, edge.to]
    add(a, b, edge.length_m)
    if (!edge.one_way) add(b, a, edge.length_m)
  }
  return adj
}

// Multi-source Dijkstra; `prev` points one step back towards the nearest source.
function dijkstra(adj: Adjacency, sources: string[]) {
  const dist = new Map<string, number>()
  const prev = new Map<string, string>()
  const heap: [number, string, string | null][] = sources.map((s) => [0, s, null])
  const push = (item: [number, string, string | null]) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, node, from] = pop()
    if (dist.has(node)) continue
    dist.set(node, d)
    if (from) prev.set(node, from)
    for (const [next, length] of adj.get(node) ?? []) if (!dist.has(next)) push([d + length, next, node])
  }
  return { dist, prev }
}

const SPEC: Record<RouteKey, { from: LayoutNode['kind']; to: LayoutNode['kind']; pallets: boolean; nearest: boolean }> =
  {
    dock_in_to_storage: { from: 'dock_in', to: 'rack_face', pallets: true, nearest: false },
    storage_to_dock_out: { from: 'rack_face', to: 'dock_out', pallets: true, nearest: false },
    storage_to_storage: { from: 'rack_face', to: 'rack_face', pallets: true, nearest: false },
    pod_to_station: { from: 'pickup', to: 'pick_station', pallets: false, nearest: true },
    storage_to_charger: { from: 'rack_face', to: 'charger', pallets: true, nearest: true },
  }

/* One real path of the route whose length is closest to the route's mean: the plan shows what «92 м on average»
   looks like. The mean itself comes from the backend; this only picks an illustration of it. */
export function exampleRoute(layout: Layout, key: RouteKey, mean: number): ExampleRoute | null {
  const spec = SPEC[key]
  const byId = new Map(layout.nodes.map((n) => [n.id, n]))
  const ofKind = (kind: LayoutNode['kind']) => layout.nodes.filter((n) => n.kind === kind)
  const froms = ofKind(spec.from)
  const tos = ofKind(spec.to)
  if (!froms.length || !tos.length) return null

  // «To the nearest X» searches backwards from every X; otherwise from one origin in the middle of its row.
  const anchorIsTarget = spec.nearest || spec.to === 'dock_out'
  const anchors = anchorIsTarget ? tos : froms
  const sources = spec.nearest ? anchors : [anchors[Math.floor(anchors.length / 2)]]
  const { dist, prev } = dijkstra(
    adjacency(layout, spec.pallets, anchorIsTarget),
    sources.map((n) => n.id),
  )

  const candidates = (anchorIsTarget ? froms : tos).filter((n) => dist.has(n.id) && !sources.includes(n))
  if (!candidates.length) return null
  const end = candidates.reduce((best, n) =>
    Math.abs(dist.get(n.id)! - mean) < Math.abs(dist.get(best.id)! - mean) ? n : best,
  )

  const chain: LayoutNode[] = []
  for (let id: string | undefined = end.id; id; id = prev.get(id)) chain.push(byId.get(id)!)
  // Walking `prev` goes back to the source: that is travel order when searching backwards from the target.
  const nodes = anchorIsTarget ? chain : chain.reverse()
  return { nodes, length: dist.get(end.id)!, from: nodes[0], to: nodes[nodes.length - 1] }
}
