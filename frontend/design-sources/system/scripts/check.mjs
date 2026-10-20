import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import { parseHTML } from 'linkedom'
const html = await readFile('index.html', 'utf8'),
  css = await readFile('src/styles.css', 'utf8')
const { document } = parseHTML(html)
const seen = new Set()
for (const el of document.querySelectorAll('[id]')) {
  assert(!seen.has(el.id), `Duplicate id: ${el.id}`)
  seen.add(el.id)
}
const od = new Set()
for (const el of document.querySelectorAll('[data-od-id]')) {
  const id = el.dataset.odId
  assert(!od.has(id), `Duplicate OD id: ${id}`)
  od.add(id)
}
for (const el of document.querySelectorAll('[src],link[href]')) {
  const file = el.getAttribute('src') || el.getAttribute('href')
  assert(!/^(https?:)?\/\//.test(file), `Remote runtime asset: ${file}`)
  await stat('../../public/design-lab/system/' + file)
}
for (const a of document.querySelectorAll('a[href^="#"],use[href^="#"]'))
  assert(seen.has(a.getAttribute('href').slice(1)), `Missing anchor: ${a.outerHTML}`)
for (const el of document.querySelectorAll('section,article')) assert(el.dataset.odId, 'Missing region identifier')
for (const image of document.querySelectorAll('img'))
  assert(
    image.hasAttribute('alt') && image.hasAttribute('width') && image.hasAttribute('height'),
    'Missing image semantics or size',
  )
assert(document.documentElement.lang === 'ru')
const bodyText = document.body.textContent
assert(!/[—–]/.test(bodyText), 'Prohibited punctuation')
assert(!/lorem ipsum|TODO|{{|placeholder/i.test(bodyText), 'Unfinished content')
assert.equal(document.querySelectorAll('a.btn-primary').length, 2)
for (const a of document.querySelectorAll('a.btn-primary')) assert.equal(a.getAttribute('href'), '/demo?new=1')
assert.equal(document.querySelectorAll('.industry').length, 3)
assert(!/scrollIntoView|addEventListener\(['"]scroll/.test(await readFile('src/warehouse.js', 'utf8')))
assert(css.includes('prefers-reduced-motion'))
assert(/max-width:\s*767px/.test(css))
assert(css.includes(':focus-visible'))
assert(!(await readFile('../../public/design-lab/system/assets/app.js', 'utf8')).includes('https://unpkg.com'))
const rootEnd = html.indexOf('</style>')
assert(
  !/#[a-f\d]{6}\b/i.test(html.slice(rootEnd).replace(/<svg class="svg-symbols"[\s\S]*?<\/svg>/, '')),
  'Raw colors in content',
)
const rgb = (h) =>
  h
    .match(/\w\w/g)
    .map((x) => parseInt(x, 16) / 255)
    .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
const lum = (h) => rgb(h).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
const contrast = (a, b) => {
  const x = lum(a),
    y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
assert(contrast('ed7049', '171f1e') >= 4.5)
assert(contrast('f2f1e9', '171f1e') >= 4.5)
console.log(`PASS: ${od.size} inspectable elements, local assets, links, content, mobile/reduced-motion rules.`)
console.log(
  `Contrast: primary ${contrast('ed7049', '171f1e').toFixed(2)}:1; body ${contrast('f2f1e9', '171f1e').toFixed(2)}:1.`,
)
console.log('Static checks do not replace a real browser accessibility or layout audit.')
