import * as T from 'three'

// Original abstract architecture, not a representation of a specific facility.
export const colors = {
  paper: 0xefeade,
  cream: 0xf8f4e9,
  edge: 0xb4b4a4,
  ink: 0x293832,
  glass: 0x6e8275,
  orange: 0xe35a34,
  route: 0x803b26,
}
export function makeWorld(kind = 'all') {
  const scene = new T.Scene()
  scene.add(new T.AmbientLight(0xfff7e8, 1.7))
  const sun = new T.DirectionalLight(0xfffaf0, 3.2)
  sun.position.set(-8, 16, 10)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 14, bottom: -14 })
  sun.shadow.bias = -0.00015
  sun.shadow.normalBias = 0.025
  scene.add(sun)
  const fill = new T.DirectionalLight(0xe2eee4, 1.2)
  fill.position.set(10, 7, -5)
  scene.add(fill)
  const root = new T.Group()
  scene.add(root)
  const mats = Object.fromEntries(
    Object.entries(colors).map(([k, c]) => [
      k,
      new T.MeshStandardMaterial({
        color: c,
        roughness: k === 'glass' ? 0.3 : 0.73,
        metalness: k === 'ink' ? 0.28 : 0,
      }),
    ]),
  )
  const items = []
  function mesh(g, geometry, material, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(geometry, mats[material])
    m.position.set(x, y, z)
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
    return m
  }
  function box(g, x, y, z, w, h, d, mat = 'cream') {
    return mesh(g, new T.BoxGeometry(w, h, d), mat, x, y, z)
  }
  function cylinder(g, x, y, z, r, h, mat = 'ink') {
    return mesh(g, new T.CylinderGeometry(r, r, h, 32), mat, x, y, z)
  }
  function path(g, points, mat = 'orange', radius = 0.035) {
    const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      false,
      'centripetal',
    )
    return mesh(g, new T.TubeGeometry(curve, 32, radius, 6, false), mat)
  }
  function slab(g, y, w = 5.5, d = 4.4) {
    const s = box(g, 0, y, 0, w, 0.18, d, 'paper')
    return s
  }
  function robot(g, x, z) {
    box(g, x, 0.36, z, 0.36, 0.16, 0.44, 'ink')
    box(g, x, 0.48, z, 0.29, 0.1, 0.35, 'cream')
  }
  function warehouse() {
    const g = new T.Group()
    slab(g, 0.06)
    box(g, 0, -0.08, 0, 5.22, 0.12, 4.13, 'edge')
    for (let row = 0; row < 3; row++) {
      const x = -1.6 + row * 1.45
      for (let zz = 0; zz < 4; zz++) {
        const z = -1.4 + zz * 0.84
        for (const dx of [-0.43, 0.43]) box(g, x + dx, 1.23, z, 0.055, 2.24, 0.06, 'ink')
      }
      for (let level = 0; level < 3; level++) {
        const y = 0.53 + level * 0.68
        box(g, x, y, -0.16, 0.96, 0.065, 2.65, 'ink')
        for (let j = 0; j < 3; j++) {
          box(g, x, y + 0.24, -1.04 + j * 0.86, 0.72, 0.4, 0.63, (j + level + row) % 3 === 0 ? 'edge' : 'cream')
          box(g, x, y + 0.45, -1.04 + j * 0.86, 0.74, 0.025, 0.64, 'paper')
        }
      }
    }
    box(g, 0, 0.23, 1.77, 4.8, 0.055, 0.17, 'orange')
    path(
      g,
      [
        [2.33, 0.24, -1.6],
        [2.33, 0.24, 1.3],
        [1.9, 0.24, 1.72],
        [-1.9, 0.24, 1.72],
      ],
      'route',
      0.027,
    )
    robot(g, 0.55, 1.55)
    robot(g, 2.3, -0.55)
    for (let j = 0; j < 5; j++) box(g, -2.5, 0.21, -1.6 + j * 0.66, 0.12, 0.025, 0.28, 'ink')
    return g
  }
  function hospital() {
    const g = new T.Group()
    slab(g, 0.06)
    const floorGroup = new T.Group()
    g.add(floorGroup)
    items.push({ object: floorGroup, home: 0, lift: 1.1 })
    for (let l = 0; l < 3; l++) {
      const p = l === 2 ? floorGroup : g,
        y = 0.36 + l * 1.03
      slab(p, y, 4.3, 3.3)
      for (const x of [-1.98, 1.98]) for (const z of [-1.45, 1.45]) box(p, x, y + 0.46, z, 0.1, 0.8, 0.1, 'edge')
      for (let j = 0; j < 4; j++) {
        box(p, -1.61 + j * 0.98, y + 0.37, -1.5, 0.8, 0.65, 0.07, 'glass')
        box(p, -1.61 + j * 0.98, y + 0.38, -1.45, 0.06, 0.68, 0.12, 'cream')
      }
      box(p, -1.5, y + 0.23, 0.7, 0.8, 0.3, 0.48, 'cream')
      box(p, 1.5, y + 0.23, 0.7, 0.8, 0.3, 0.48, 'cream')
      box(p, 0, y + 0.11, 0.52, 3.65, 0.025, 0.28, 'orange')
      box(p, 0, y + 0.12, 0.1, 0.25, 0.025, 1.05, 'orange')
      for (const x of [-0.7, 0.7]) box(p, x, y + 0.3, -0.75, 0.06, 0.5, 1.1, 'cream')
    }
    box(g, 0, 1.63, -0.5, 0.66, 2.6, 0.6, 'ink')
    box(g, 0, 1.65, -0.18, 0.42, 2.4, 0.028, 'orange')
    box(g, 0, 3.08, -0.5, 0.8, 0.13, 0.78, 'paper')
    robot(g, -0.7, 1.5)
    return g
  }
  function airport() {
    const g = new T.Group()
    slab(g, 0.06)
    const roof = new T.Group()
    g.add(roof)
    items.push({ object: roof, home: 0, lift: 1.4 })
    box(g, 0, 0.2, -0.65, 4.4, 0.12, 2.15, 'edge')
    for (let i = 0; i < 9; i++) {
      const x = -2 + i * 0.5
      for (const z of [-1.55, 0.25]) box(g, x, 0.83, z, 0.07, 1.3, 0.07, 'ink')
      const pts = []
      for (let j = 0; j <= 12; j++) {
        const a = (Math.PI * j) / 12
        pts.push([x, 1.35 + Math.sin(a) * 0.65, -0.65 + Math.cos(a) * 1.15])
      }
      path(roof, pts, 'cream', 0.065)
    }
    for (let i = 0; i < 9; i++) {
      const a = (Math.PI * i) / 8
      box(roof, 0, 1.35 + Math.sin(a) * 0.65, -0.65 + Math.cos(a) * 1.15, 4.35, 0.045, 0.1, 'paper')
    }
    box(g, 0, 0.43, 1.22, 3.35, 0.22, 0.52, 'ink')
    for (let i = 0; i < 15; i++) box(g, -1.54 + i * 0.22, 0.55, 1.22, 0.08, 0.04, 0.5, 'edge')
    for (let i = 0; i < 4; i++) box(g, -1.35 + i * 0.8, 0.7, 1.22, 0.42, 0.25, 0.35, 'cream')
    cylinder(g, 2.04, 1.5, -1.55, 0.18, 2.6, 'cream')
    cylinder(g, 2.04, 2.68, -1.55, 0.43, 0.45, 'glass')
    cylinder(g, 2.04, 2.96, -1.55, 0.5, 0.1, 'paper')
    robot(g, -2.15, 0.7)
    path(
      g,
      [
        [-2.1, 0.24, 1.8],
        [1.9, 0.24, 1.8],
        [2.3, 0.24, 1.5],
        [2.3, 0.24, 0.5],
      ],
      'orange',
      0.04,
    )
    return g
  }
  const makers = { warehouse, hospital, airport }
  Object.entries(makers).forEach(([name, fn], i) => {
    if (kind !== 'all' && kind !== name) return
    const g = fn()
    g.name = name
    if (kind === 'all') {
      g.position.set((i - 1) * 6.3, i === 1 ? 0.18 : 0, i === 1 ? -0.8 : 0.4)
      g.rotation.y = -0.15
    }
    root.add(g)
  })
  if (kind === 'all') {
    path(
      root,
      [
        [-5, 0.13, 3.5],
        [-3, 0.13, 3.9],
        [0, 0.13, 3.5],
        [3, 0.13, 3.9],
        [5, 0.13, 3.5],
      ],
      'paper',
      0.035,
    )
    for (const x of [-6.3, 0, 6.3])
      path(
        root,
        [
          [x, 0.13, 2.3],
          [x, 0.13, 3.1],
          [x * 0.8, 0.13, 3.5],
        ],
        'paper',
        0.035,
      )
  }
  const camera = new T.OrthographicCamera(-12, 12, 5, -5, 0.1, 150)
  camera.position.set(8, 18, 30)
  camera.lookAt(0, 0.6, 0)
  return { scene, root, camera, items, mats }
}
