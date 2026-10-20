import { createWarehouse } from './warehouse.js'
import { INSPECTIONS } from './model.js'
import { initInteractions } from './interactions.js'

initInteractions()
const reduced = matchMedia('(prefers-reduced-motion: reduce)')
const canvas = document.querySelector('#warehouse-canvas'),
  viewport = document.querySelector('#scene-viewport')
const pause = document.querySelector('#pause-button')
let warehouse = null,
  paused = reduced.matches
function showPause(next, label) {
  paused = next
  pause.setAttribute('aria-pressed', String(next))
  pause.querySelector('span').textContent = next ? 'Продолжить' : 'Пауза'
  pause.setAttribute('aria-label', label || (next ? 'Продолжить движение модели' : 'Приостановить движение модели'))
  pause.querySelector('use').setAttribute('href', next ? '#i-play' : '#i-pause')
}
function fallback() {
  viewport.classList.add('is-fallback')
  viewport.classList.remove('is-ready')
  document.querySelector('#webgl-status').hidden = false
  canvas.tabIndex = -1
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.disabled = true
    button.title = '3D недоступен. Показана статическая схема.'
  })
  pause.disabled = true
  pause.querySelector('span').textContent = 'Схема'
  pause.setAttribute('aria-label', 'Статическая схема')
}
pause.addEventListener('click', () => {
  showPause(!paused)
  warehouse?.setPaused(paused)
})
document.querySelectorAll('[data-mode]').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-mode]')
      .forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    const data = INSPECTIONS[button.dataset.mode]
    document.querySelector('.scene-label').textContent = data.label
    document.querySelector('#scene-note-text').textContent = data.note
    document.querySelector('#inspection-title').textContent = data.title
    document.querySelector('#inspection-text').textContent = data.text
    warehouse?.setMode(button.dataset.mode)
  }),
)
document.querySelectorAll('[data-view]').forEach((button) =>
  button.addEventListener('click', () => {
    document
      .querySelectorAll('[data-view]')
      .forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
    warehouse?.setView(button.dataset.view)
  }),
)
showPause(paused)
async function startWarehouse() {
  await document.fonts.ready
  try {
    warehouse = createWarehouse({
      canvas,
      viewport,
      reduced: reduced.matches,
      onPause: showPause,
      onFallback: fallback,
    })
    if (warehouse) {
      warehouse.setPaused(paused)
      const mode = document.querySelector('[data-mode][aria-pressed="true"]').dataset.mode
      const view = document.querySelector('[data-view][aria-pressed="true"]').dataset.view
      if (mode !== 'routes') warehouse.setMode(mode)
      if (view !== '3d') warehouse.setView(view)
    }
  } catch (error) {
    console.warn('Warehouse view unavailable', error)
    fallback()
  }
}
startWarehouse()
reduced.addEventListener('change', (event) => {
  warehouse?.setReduced(event.matches)
  if (event.matches) showPause(true)
})
// A non-persisted page exit releases GPU memory. BFCache restores keep the scene intact.
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) warehouse?.destroy()
})
