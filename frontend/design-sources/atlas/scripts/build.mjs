import { build } from 'esbuild'
import { parseHTML } from 'linkedom'
import { writeFile, mkdir } from 'node:fs/promises'
import { makeWorld } from '../src/world.js'
import * as T from 'three'
await mkdir('../../public/design-lab/atlas/assets/visuals', { recursive: true })
const { document, window } = parseHTML('<html><body></body></html>')
globalThis.document = document
globalThis.window = window
const { SVGRenderer } = await import('three/addons/renderers/SVGRenderer.js')
for (const kind of ['all', 'unfolded', 'warehouse', 'hospital', 'airport']) {
  const isAtlas = kind === 'all' || kind === 'unfolded'
  const { scene, camera, root, items } = makeWorld(isAtlas ? 'all' : kind)
  if (kind === 'unfolded') {
    items.forEach((i) => (i.object.position.y = i.lift))
    camera.zoom = 0.83
  }
  // SVGRenderer supports Lambert materials. Use the exact authored geometry for fallback.
  const materials = new Map()
  scene.traverse((m) => {
    if (m.isMesh) {
      if (!materials.has(m.material.uuid))
        materials.set(m.material.uuid, new T.MeshLambertMaterial({ color: m.material.color }))
      m.material = materials.get(m.material.uuid)
      m.castShadow = false
    }
  })
  const w = isAtlas ? 1440 : 960,
    h = isAtlas ? 440 : 660
  const fw = isAtlas ? 24 : 8.6
  camera.left = -fw / 2
  camera.right = fw / 2
  camera.top = (fw * h) / w / 2
  camera.bottom = (-fw * h) / w / 2
  camera.position.set(isAtlas ? 4 : 8, isAtlas ? 18.65 : 18, 30)
  camera.lookAt(0, isAtlas ? 1.3 : 1, 0)
  camera.updateProjectionMatrix()
  const renderer = new SVGRenderer()
  renderer.setSize(w, h)
  renderer.setPrecision(2)
  renderer.setQuality('high')
  renderer.render(scene, camera)
  const svg = renderer.domElement
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', w)
  svg.setAttribute('height', h)
  svg.removeAttribute('style')
  await writeFile(
    `../../public/design-lab/atlas/assets/visuals/${kind === 'all' ? 'atlas' : kind === 'unfolded' ? 'atlas-unfolded' : kind}.svg`,
    svg.outerHTML,
  )
}
await build({
  entryPoints: ['src/atlas.js'],
  outfile: '../../public/design-lab/atlas/assets/vendor/atlas.min.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'eof',
})
console.log('Built local scene bundle and five vector assets.')
