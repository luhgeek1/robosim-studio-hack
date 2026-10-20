import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { ROUTES, pointOnPath, clamp } from './model.js'

/** Procedural explanatory warehouse. No assets, metrics or geometry imply a surveyed digital twin. */
export function createWarehouse({ canvas, viewport, reduced, onPause, onFallback }) {
  let renderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' })
  } catch {
    onFallback()
    return null
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.94
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  const css = getComputedStyle(document.documentElement)
  const base = new THREE.Color(css.getPropertyValue('--bg').trim())
  const chalk = new THREE.Color(css.getPropertyValue('--fg').trim())
  const orange = new THREE.Color(css.getPropertyValue('--accent').trim())
  const mix = (amount) => base.clone().lerp(chalk, amount)
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-18, 18, 8, -8, 0.1, 180)
  const world = new THREE.Group()
  scene.add(world)
  const environmentScene = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(environmentScene, 0.05)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.32
  environmentScene.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(chalk, mix(0.08), 1.25))
  const key = new THREE.DirectionalLight(chalk, 2.3)
  key.position.set(-8, 19, 10)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -18
  key.shadow.camera.right = 18
  key.shadow.camera.top = 15
  key.shadow.camera.bottom = -15
  key.shadow.camera.near = 1
  key.shadow.camera.far = 65
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.035
  key.shadow.radius = 3
  scene.add(key)
  const rim = new THREE.DirectionalLight(chalk, 1.6)
  rim.position.set(12, 9, -10)
  scene.add(rim)
  const fill = new THREE.DirectionalLight(chalk, 0.7)
  fill.position.set(2, 5, 20)
  scene.add(fill)
  const materials = {
    slab: new THREE.MeshStandardMaterial({ color: mix(0.07), roughness: 0.76, metalness: 0.08 }),
    floor: new THREE.MeshStandardMaterial({ color: mix(0.09), roughness: 0.65, metalness: 0.16 }),
    rail: new THREE.MeshStandardMaterial({ color: mix(0.13), roughness: 0.36, metalness: 0.72 }),
    shelf: new THREE.MeshStandardMaterial({ color: mix(0.24), roughness: 0.54, metalness: 0.28 }),
    crate: new THREE.MeshStandardMaterial({ color: mix(0.68), roughness: 0.85 }),
    pale: new THREE.MeshStandardMaterial({ color: mix(0.91), roughness: 0.62 }),
    dark: new THREE.MeshStandardMaterial({ color: mix(0.02), roughness: 0.55, metalness: 0.2 }),
    line: new THREE.MeshStandardMaterial({ color: mix(0.55), roughness: 0.82 }),
    orange: new THREE.MeshStandardMaterial({ color: orange, roughness: 0.34, metalness: 0.16 }),
    route: new THREE.MeshBasicMaterial({ color: orange, transparent: true, opacity: 0.8 }),
  }
  const batches = new Map()
  function block(pos, size, type = 'rail') {
    if (!batches.has(type)) batches.set(type, [])
    batches.get(type).push({ pos, size })
  }
  const baseMesh = new THREE.Mesh(new RoundedBoxGeometry(23.2, 0.38, 14.3, 2, 0.14), materials.slab)
  baseMesh.position.y = -0.24
  baseMesh.receiveShadow = true
  world.add(baseMesh)
  block([0, -0.02, 0], [22.9, 0.05, 14], 'floor')
  // Slab rim and joints locate the routes on a real floor, without a decorative page grid.
  for (let x = -10; x <= 10; x += 2.5) block([x, 0.012, 0], [0.013, 0.014, 13.7], 'line')
  for (let z = -6; z <= 6; z += 2) block([0, 0.012, z], [22.7, 0.014, 0.013], 'line')
  block([0, 0.2, -6.95], [23, 0.46, 0.15], 'shelf')
  block([-11.45, 0.2, -1.3], [0.15, 0.46, 11.2], 'shelf')
  for (const x of [-9, -6, -3, 0, 3, 6, 9]) {
    block([x, 0.9, -6.94], [0.08, 1.4, 0.08], 'rail')
    block([x, 1.62, -6.94], [0.16, 0.045, 0.14], 'pale')
  }
  block([0, 1.58, -6.94], [22.7, 0.055, 0.055], 'shelf')
  // Six rack runs, each with structural uprights, trays, cross bars, parcels and labels.
  let rackIndex = 0
  for (const z of [-3, 2.6])
    for (const x of [-6, -1, 4]) {
      for (const dx of [-1.85, 0, 1.85])
        for (const dz of [-0.68, 0.68]) block([x + dx, 1.38, z + dz], [0.07, 2.76, 0.07], 'rail')
      for (const y of [0.2, 1.1, 2]) {
        block([x, y, z], [3.85, 0.09, 1.45], 'shelf')
        for (const dz of [-0.73, 0.73]) block([x, y - 0.03, z + dz], [3.87, 0.11, 0.05], 'rail')
        for (let n = 0; n < 5; n++) {
          const height = 0.44 + ((rackIndex + n) % 3) * 0.12
          const px = x - 1.45 + n * 0.71
          block([px, y + 0.08 + height / 2, z], [0.59, height, 1.02], n % 3 === 1 ? 'pale' : 'crate')
          block([px, y + 0.09 + height, z], [0.075, 0.012, 1.03], 'pale')
          block([px, y + 0.08 + height / 2, z + 0.516], [0.12, height, 0.012], 'pale')
        }
      }
      block([x - 1.4, 2.63, z + 0.73], [0.37, 0.16, 0.018], 'pale')
      rackIndex++
    }
  // Dock staging zones, pallets and guard rails.
  for (const z of [-4, 0, 4]) {
    block([-10.65, 0.04, z], [1.1, 0.04, 1.85], 'dark')
    block([-10.65, 0.08, z], [0.8, 0.13, 1.25], 'shelf')
    for (let n = 0; n < 3; n++) block([-10.9 + n * 0.25, 0.16, z], [0.18, 0.045, 1.25], 'crate')
  }
  for (const x of [-6.7, -4.1, -1.5]) {
    block([x, 0.06, 6.05], [1.65, 0.06, 0.02], 'line')
    block([x - 0.82, 0.06, 5.6], [0.02, 0.06, 0.9], 'line')
    block([x + 0.82, 0.06, 5.6], [0.02, 0.06, 0.9], 'line')
  }
  // Charging points are modelled as a shared resource, not a decoration.
  for (const z of [-4.5, -2.7, -0.9]) {
    block([10.55, 0.34, z], [0.38, 0.7, 0.8], 'shelf')
    block([10.32, 0.42, z], [0.045, 0.26, 0.42], 'dark')
    block([10.28, 0.57, z], [0.025, 0.035, 0.3], 'pale')
    block([9.9, 0.025, z], [1.2, 0.025, 1.15], 'dark')
    block([9.9, 0.045, z - 0.59], [1.3, 0.016, 0.025], 'line')
    block([9.9, 0.045, z + 0.59], [1.3, 0.016, 0.025], 'line')
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1),
    matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion()
  for (const [type, items] of batches) {
    const instances = new THREE.InstancedMesh(unitBox, materials[type], items.length)
    items.forEach(({ pos, size }, i) => {
      matrix.compose(new THREE.Vector3(...pos), quaternion, new THREE.Vector3(...size))
      instances.setMatrixAt(i, matrix)
    })
    instances.castShadow = type !== 'line'
    instances.receiveShadow = true
    world.add(instances)
  }
  const routeGroup = new THREE.Group()
  world.add(routeGroup)
  ROUTES.forEach((points, index) => {
    const path = new THREE.CurvePath()
    points
      .slice(1)
      .forEach((p, i) =>
        path.add(
          new THREE.LineCurve3(
            new THREE.Vector3(points[i][0], 0.06, points[i][1]),
            new THREE.Vector3(p[0], 0.06, p[1]),
          ),
        ),
      )
    const material = materials.route.clone()
    material.opacity = index === 0 ? 0.85 : 0.52
    const line = new THREE.Mesh(new THREE.TubeGeometry(path, 96, 0.021, 4, false), material)
    routeGroup.add(line)
  })
  function floorLabel(text, x, z, width = 3.2) {
    const label = document.createElement('canvas')
    label.width = 640
    label.height = 96
    const context = label.getContext('2d')
    context.fillStyle = chalk.getStyle()
    context.font = '510 35px Onest'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(text, 320, 48)
    const texture = new THREE.CanvasTexture(label)
    texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * 96) / 640),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.85 }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(x, 0.065, z)
    world.add(mesh)
  }
  floorLabel('ПРИЁМКА', -7.8, 6.5, 2.7)
  floorLabel('ХРАНЕНИЕ', -0.6, -6.1, 3.5)
  floorLabel('ОТГРУЗКА', 3, 6.5, 3)
  floorLabel('ЗАРЯДКА', 9.8, 1.6, 2.5)
  function robot(index) {
    const group = new THREE.Group()
    function part(geo, mat, y) {
      const m = new THREE.Mesh(geo, mat)
      m.position.y = y
      m.castShadow = true
      group.add(m)
      return m
    }
    part(new RoundedBoxGeometry(0.85, 0.27, 1.12, 2, 0.07), materials.orange, 0.28)
    part(new THREE.BoxGeometry(0.77, 0.13, 1.02), materials.dark, 0.13)
    const sensor = part(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 16), materials.dark, 0.48)
    sensor.position.z = 0.3
    const strip = part(new THREE.BoxGeometry(0.5, 0.035, 0.015), materials.pale, 0.29)
    strip.position.z = 0.57
    for (const side of [-1, 1])
      for (const z of [-0.3, 0.3]) {
        const wheel = part(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 12), materials.dark, 0.13)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(side * 0.42, 0.13, z)
      }
    if (index % 2 === 0) {
      const load = part(new THREE.BoxGeometry(0.62, 0.48, 0.75), materials.crate, 0.65)
      load.position.z = -0.07
    }
    world.add(group)
    return group
  }
  const robots = Array.from({ length: 7 }, (_, i) => ({ mesh: robot(i), path: ROUTES[i % 3], distance: i * 7.3 + 3 }))
  const zoneMaterial = new THREE.MeshBasicMaterial({
    color: orange,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.5), zoneMaterial)
  zone.rotation.x = -Math.PI / 2
  zone.position.set(8.7, 0.07, 0.2)
  zone.visible = false
  world.add(zone)
  let mode = 'routes',
    view = '3d',
    paused = reduced,
    visible = false,
    disposed = false,
    lost = false,
    userView = false
  let scrollTurn = 0
  let last = 0,
    elapsed = 0,
    yaw = 0.22,
    manualYaw = 0,
    currentYaw = 0.22,
    currentElevation = 0.43
  const lookAt = new THREE.Vector3(0, 1, 0),
    targetCamera = new THREE.Vector3()
  let pointer = null
  const resize = () => {
    const w = viewport.clientWidth,
      h = viewport.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    const aspect = w / h
    // Both axes frame the full physical footprint; narrow screens scale, never crop.
    const halfWidth = Math.max(15.4, 9.4 * aspect),
      halfHeight = halfWidth / aspect
    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    draw(0, true)
  }
  function draw(now = 0, force = false) {
    if (disposed || lost || (!visible && !force)) return
    const dt = Math.min(last ? (now - last) / 1000 : 0, 0.045)
    last = now
    if (!paused) {
      elapsed += dt
      if (elapsed >= 30) {
        paused = true
        onPause(true, 'Движение остановлено')
        syncLoop()
      }
    }
    const bounds = viewport.getBoundingClientRect()
    if (!reduced && !paused && !userView && window.innerWidth >= 768) scrollTurn = clamp((100 - bounds.top) / 240, 0, 1)
    const desiredElevation =
      view === '2d' ? 1.56 : mode === 'charging' ? 0.66 : mode === 'queues' ? 0.76 : 0.43 + scrollTurn * 0.19
    yaw = mode === 'charging' ? 0.12 : mode === 'queues' ? 0.34 : 0.22 - scrollTurn * 0.07
    const desiredYaw = view === '2d' ? 0 : yaw + manualYaw
    const mixAmount = reduced || force || paused ? 1 : 1 - Math.exp(-dt * 12)
    currentYaw = THREE.MathUtils.lerp(currentYaw, desiredYaw, mixAmount)
    currentElevation = THREE.MathUtils.lerp(currentElevation, desiredElevation, mixAmount)
    // Fit the projected bounding volume at every view; no empty margins or clipped plan.
    const aspect = viewport.clientWidth / viewport.clientHeight
    const projectedWidth = 23.2 * Math.abs(Math.cos(currentYaw)) + 14.3 * Math.abs(Math.sin(currentYaw))
    const projectedHeight =
      23.2 * Math.abs(Math.sin(currentYaw) * Math.sin(currentElevation)) +
      14.3 * Math.abs(Math.cos(currentYaw) * Math.sin(currentElevation)) +
      2.8 * Math.abs(Math.cos(currentElevation))
    const halfHeight = Math.max(projectedHeight / 2, projectedWidth / (2 * aspect)) * 1.1
    camera.left = -halfHeight * aspect
    camera.right = halfHeight * aspect
    camera.top = halfHeight
    camera.bottom = -halfHeight
    camera.updateProjectionMatrix()
    const distance = 38
    targetCamera.set(
      Math.sin(currentYaw) * Math.cos(currentElevation) * distance,
      Math.sin(currentElevation) * distance,
      Math.cos(currentYaw) * Math.cos(currentElevation) * distance,
    )
    camera.position.copy(targetCamera)
    camera.lookAt(lookAt)
    robots.forEach((r, i) => {
      if (!paused) {
        // Queue mode slows traffic at one junction. This is explanatory, not an analytical output.
        const pose = pointOnPath(r.path, r.distance)
        const slow = mode === 'queues' && pose.x > 6.3 && pose.z > 0 && i < 4 ? 0.1 : 1
        r.distance += dt * (0.8 + (i % 3) * 0.07) * slow
      }
      const p = pointOnPath(r.path, r.distance)
      r.mesh.position.set(p.x, 0.02, p.z)
      r.mesh.rotation.y = p.angle
    })
    zone.visible = mode !== 'routes'
    zone.position.set(mode === 'charging' ? 9.7 : 8.7, 0.07, mode === 'charging' ? -2.7 : 0.2)
    zone.scale.set(mode === 'charging' ? 0.65 : 1, mode === 'charging' ? 1.7 : 1, 1)
    renderer.render(scene, camera)
  }
  const loop = (time) => draw(time)
  function syncLoop() {
    renderer.setAnimationLoop(visible && !document.hidden && !lost && !paused ? loop : null)
    last = 0
  }
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting
      syncLoop()
    },
    { threshold: 0.02 },
  )
  observer.observe(viewport)
  const resizer = new ResizeObserver(resize)
  resizer.observe(viewport)
  const visibility = () => syncLoop()
  document.addEventListener('visibilitychange', visibility)
  const contextLost = (event) => {
    event.preventDefault()
    lost = true
    renderer.setAnimationLoop(null)
    viewport.classList.remove('is-ready')
    onFallback()
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  const pointerDown = (e) => {
    if (e.button !== 0 || view === '2d') return
    pointer = { x: e.clientX, yaw: manualYaw }
  }
  const pointerMove = (e) => {
    if (!pointer || reduced) return
    manualYaw = clamp(pointer.yaw + (e.clientX - pointer.x) * 0.003, -0.38, 0.38)
    userView = true
    if (paused) draw(0, true)
  }
  const pointerUp = () => {
    pointer = null
  }
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('pointercancel', pointerUp)
  canvas.addEventListener('pointerleave', pointerUp)
  const keydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(e.key)) return
    e.preventDefault()
    manualYaw = e.key === 'Home' ? 0 : clamp(manualYaw + (e.key === 'ArrowLeft' ? -0.12 : 0.12), -0.38, 0.38)
    userView = true
    draw(0, true)
  }
  canvas.addEventListener('keydown', keydown)
  resize()
  viewport.classList.add('is-ready')
  return {
    setMode(next) {
      mode = next
      userView = true
      scrollTurn = 0
      manualYaw = 0
      draw(0, paused || reduced)
    },
    setView(next) {
      view = next
      userView = true
      draw(0, paused || reduced)
    },
    setPaused(next) {
      paused = next
      if (!next) elapsed = 0
      syncLoop()
      draw(0, true)
    },
    setReduced(next) {
      reduced = next
      if (next) {
        paused = true
        onPause(true, 'Продолжить')
      }
      syncLoop()
      draw(0, true)
    },
    destroy() {
      disposed = true
      renderer.setAnimationLoop(null)
      observer.disconnect()
      resizer.disconnect()
      document.removeEventListener('visibilitychange', visibility)
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('pointerleave', pointerUp)
      canvas.removeEventListener('keydown', keydown)
      const geometries = new Set(),
        mats = new Set(),
        textures = new Set()
      scene.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry)
        if (o.material)
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
            mats.add(m)
            if (m.map) textures.add(m.map)
          })
      })
      geometries.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      environment.dispose()
      renderer.dispose()
    },
  }
}
