import { FINANCE } from './model.js'

export function initInteractions(doc = document) {
  const menu = doc.querySelector('.menu-toggle'),
    nav = doc.querySelector('#mobile-nav')
  const setMenu = (open) => {
    menu.setAttribute('aria-expanded', String(open))
    nav.hidden = !open
  }
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'))
  nav.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)))
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      setMenu(false)
      menu.focus()
    }
  })
  const dialog = doc.querySelector('#parameters-dialog')
  doc.querySelector('#parameters-button').addEventListener('click', () => dialog.showModal())
  doc.querySelector('#close-dialog').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (e) => {
    if (e.target !== dialog) return
    const r = dialog.getBoundingClientRect()
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close()
  })
  const financeButtons = [...doc.querySelectorAll('[data-finance]')]
  financeButtons.forEach((button) =>
    button.addEventListener('click', () => {
      const data = FINANCE[button.dataset.finance]
      financeButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)))
      for (const key of ['label', 'title', 'copy']) doc.querySelector(`#finance-${key}`).textContent = data[key]
    }),
  )
  return { setMenu }
}
