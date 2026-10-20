import * as T from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { makeWorld } from './world.js'

const host = document.querySelector('[data-atlas-canvas]')
if (host) {
  let renderer,
    environment,
    disposed = false,
    frame = 0,
    visible = true,
    unfolded = false,
    deadline = 0
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')
  const world = makeWorld()
  const { scene, root, camera, items } = world
  const controls = new AbortController()
  const fallback = () => {
    host.classList.remove('is-ready')
    host.dataset.render = 'svg'
  }
  let enabled = !reduce.matches && !document.documentElement.classList.contains('motion-off'),
    tx = 0,
    ty = 0
  function draw() {
    if (!disposed && renderer && visible) {
      renderer.render(scene, camera)
    }
  }
  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
  }
  function update(time) {
    if (disposed || !visible || !renderer) return
    if (time >= deadline) {
      root.rotation.y = tx
      root.rotation.x = ty
      camera.zoom = unfolded ? 0.83 : 1
      camera.updateProjectionMatrix()
      items.forEach((i) => (i.object.position.y = unfolded ? i.lift : 0))
      draw()
      frame = 0
      return
    }
    root.rotation.y += (tx - root.rotation.y) * 0.16
    root.rotation.x += (ty - root.rotation.x) * 0.16
    const targetZoom = unfolded ? 0.83 : 1
    camera.zoom += (targetZoom - camera.zoom) * 0.13
    camera.updateProjectionMatrix()
    let moving =
      Math.abs(tx - root.rotation.y) + Math.abs(ty - root.rotation.x) > 0.0002 ||
      Math.abs(targetZoom - camera.zoom) > 0.0002
    for (const item of items) {
      const target = unfolded ? item.lift : 0
      item.object.position.y += (target - item.object.position.y) * 0.13
      moving ||= Math.abs(target - item.object.position.y) > 0.002
    }
    draw()
    frame = moving ? requestAnimationFrame(update) : 0
  }
  function request() {
    deadline = performance.now() + 420
    if (!frame && !disposed) {
      frame = requestAnimationFrame(update)
    }
  }
  function size() {
    const w = host.clientWidth,
      h = host.clientHeight
    if (!w || !h) return
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75))
    renderer.setSize(w, h, false)
    const width = Math.max(24, (7.3333 * w) / h)
    camera.left = -width / 2
    camera.right = width / 2
    camera.top = (width * h) / w / 2
    camera.bottom = (-width * h) / w / 2
    camera.position.set(4, 18.65, 30)
    camera.lookAt(0, 1.3, 0)
    camera.updateProjectionMatrix()
    draw()
  }
  const raycaster = new T.Raycaster(),
    pointer = new T.Vector2()
  function hit(event) {
    const r = host.getBoundingClientRect()
    pointer.set(((event.clientX - r.left) / r.width) * 2 - 1, (-(event.clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster.intersectObjects(root.children, true)
    for (const hit of hits) {
      let o = hit.object
      while (o.parent && o.parent !== root) o = o.parent
      if (['warehouse', 'hospital', 'airport'].includes(o.name)) return o.name
    }
    return null
  }
  let resizeObserver, observer
  try {
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
    renderer.setClearColor(0, 0)
    renderer.outputColorSpace = T.SRGBColorSpace
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = T.PCFShadowMap
    const pmrem = new T.PMREMGenerator(renderer),
      room = new RoomEnvironment()
    environment = pmrem.fromScene(room, 0.04)
    scene.environment = environment.texture
    scene.environmentIntensity = 0.32
    room.dispose()
    pmrem.dispose()
    const shadow = new T.Mesh(new T.PlaneGeometry(25, 11), new T.ShadowMaterial({ opacity: 0.13 }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -0.2
    shadow.receiveShadow = true
    scene.add(shadow)
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.append(renderer.domElement)
    size()
    host.classList.add('is-ready')
    host.dataset.render = 'webgl'
    resizeObserver = new ResizeObserver(size)
    resizeObserver.observe(host)
    observer = new IntersectionObserver(
      (entries) => {
        visible = entries[0].isIntersecting
        if (visible) request()
        else stop()
      },
      { threshold: 0 },
    )
    observer.observe(host)
    host.addEventListener(
      'click',
      (e) => {
        const kind = hit(e)
        if (kind) document.dispatchEvent(new CustomEvent('atlas:select', { detail: kind }))
      },
      { signal: controls.signal },
    )
    host.addEventListener(
      'pointermove',
      (e) => {
        host.style.cursor = hit(e) ? 'pointer' : 'default'
        if (!enabled || e.pointerType === 'touch') return
        const r = host.getBoundingClientRect()
        tx = ((e.clientX - r.left) / r.width - 0.5) * 0.13
        ty = ((e.clientY - r.top) / r.height - 0.5) * 0.04
        request()
      },
      { signal: controls.signal },
    )
    host.addEventListener(
      'pointerleave',
      () => {
        tx = ty = 0
        request()
      },
      { signal: controls.signal },
    )
    document.addEventListener(
      'atlas:unfold',
      (e) => {
        unfolded = e.detail
        if (!enabled) {
          items.forEach((i) => (i.object.position.y = unfolded ? i.lift : 0))
          camera.zoom = unfolded ? 0.83 : 1
          camera.updateProjectionMatrix()
          draw()
        } else request()
      },
      { signal: controls.signal },
    )
    document.addEventListener(
      'atlas:motion',
      (e) => {
        enabled = e.detail && !reduce.matches
        if (!enabled) {
          stop()
          tx = ty = 0
          root.rotation.set(0, 0, 0)
          items.forEach((i) => (i.object.position.y = unfolded ? i.lift : 0))
          camera.zoom = unfolded ? 0.83 : 1
          camera.updateProjectionMatrix()
          draw()
        }
      },
      { signal: controls.signal },
    )
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) stop()
        else request()
      },
      { signal: controls.signal },
    )
    renderer.domElement.addEventListener(
      'webglcontextlost',
      (e) => {
        e.preventDefault()
        stop()
        fallback()
      },
      { signal: controls.signal },
    )
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      () => {
        draw()
        host.classList.add('is-ready')
      },
      { signal: controls.signal },
    )
    reduce.addEventListener(
      'change',
      () => {
        enabled = !reduce.matches && !document.documentElement.classList.contains('motion-off')
        if (!enabled) {
          stop()
          root.rotation.set(0, 0, 0)
          draw()
        }
      },
      { signal: controls.signal },
    )
  } catch (error) {
    fallback()
    if (renderer) renderer.dispose()
  }
  function dispose() {
    disposed = true
    stop()
    controls.abort()
    resizeObserver?.disconnect()
    observer?.disconnect()
    scene.traverse((o) => {
      o.geometry?.dispose()
      if (o.material) o.material.dispose()
    })
    environment?.dispose()
    renderer?.dispose()
  }
  window.addEventListener(
    'pagehide',
    (e) => {
      if (!e.persisted) dispose()
      else stop()
    },
    { signal: controls.signal },
  )
  window.addEventListener('pageshow', () => request(), { signal: controls.signal })
}
