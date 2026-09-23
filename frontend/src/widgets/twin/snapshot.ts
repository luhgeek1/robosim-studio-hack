const STYLE_PROPS = [
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'opacity',
  'font-size',
  'font-family',
  'font-weight',
  'paint-order',
  'text-anchor',
  'dominant-baseline',
] as const

const SCALE = 2

// The plan uses CSS variables and classes; a standalone SVG image has neither, so computed values are inlined.
export async function svgToPng(svg: SVGSVGElement, background: string): Promise<Blob | null> {
  const { width, height } = svg.getBoundingClientRect()
  const clone = svg.cloneNode(true) as SVGSVGElement
  const source = [svg, ...svg.querySelectorAll('*')]
  const target = [clone, ...clone.querySelectorAll('*')]
  source.forEach((el, i) => {
    const computed = getComputedStyle(el)
    const style = STYLE_PROPS.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(';')
    target[i]?.setAttribute('style', style)
  })
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' }),
  )
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * SCALE)
    canvas.height = Math.round(height * SCALE)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = background
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}
