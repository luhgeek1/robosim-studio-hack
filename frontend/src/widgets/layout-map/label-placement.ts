export type LabelRect = { x: number; y: number; width: number; height: number }
export type LabelAnchor = { id: string; x: number; y: number; width: number; height: number }

const GAP = 6
const MARGIN = 10

export function overlaps(a: LabelRect, b: LabelRect, gap = GAP): boolean {
  return (
    a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y
  )
}

export function placeLabel(
  anchor: LabelAnchor,
  viewport: { width: number; height: number },
  occupied: readonly LabelRect[],
  preferred = { x: anchor.x - anchor.width / 2, y: anchor.y - anchor.height - 24 },
): LabelRect | null {
  const { width, height } = anchor
  if (width > viewport.width - MARGIN * 2 || height > viewport.height - MARGIN * 2) return null
  const candidates: LabelRect[] = []
  // Search in screen pixels: the clearance from a station survives both zoom and camera rotation.
  for (let ring = 0; ring <= 8; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        candidates.push({
          x: Math.round(Math.max(MARGIN, Math.min(viewport.width - width - MARGIN, preferred.x + dx * 32))),
          y: Math.round(Math.max(MARGIN, Math.min(viewport.height - height - MARGIN, preferred.y + dy * 24))),
          width,
          height,
        })
      }
    }
  }
  candidates.sort(
    (a, b) => Math.hypot(a.x - preferred.x, a.y - preferred.y) - Math.hypot(b.x - preferred.x, b.y - preferred.y),
  )
  return candidates.find((box) => occupied.every((other) => !overlaps(box, other))) ?? null
}

export function labelEndpoint(box: LabelRect, anchor: { x: number; y: number }) {
  return {
    x: Math.max(box.x, Math.min(box.x + box.width, anchor.x)),
    y: Math.max(box.y, Math.min(box.y + box.height, anchor.y)),
  }
}
