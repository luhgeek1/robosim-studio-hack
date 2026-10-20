import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseHTML } from 'linkedom'
import { ROUTES, pathLength, pointOnPath, FINANCE } from '../src/model.js'
import { initInteractions } from '../src/interactions.js'

test('All route samples remain in the warehouse and preserve closed-loop continuity', () => {
  for (const route of ROUTES) {
    const length = pathLength(route)
    assert(length > 0)
    for (let d = -3; d < length * 3; d += 0.13) {
      const p = pointOnPath(route, d)
      assert(Number.isFinite(p.angle))
      assert(p.x >= -9.601 && p.x <= 8.701)
      assert(p.z >= -5.501 && p.z <= 5.001)
    }
    const first = pointOnPath(route, 0),
      next = pointOnPath(route, length)
    assert.equal(first.x, next.x)
    assert.equal(first.z, next.z)
  }
})
test('Financing controls update visible explanation and expose exactly one selected option', () => {
  const { document, window } = parseHTML(readFileSync('index.html', 'utf8'))
  initInteractions(document)
  for (const key of ['raas', 'leasing', 'current', 'purchase']) {
    document.querySelector(`[data-finance="${key}"]`).dispatchEvent(new window.Event('click'))
    assert.equal(document.querySelector('#finance-title').textContent, FINANCE[key].title)
    assert.equal(document.querySelector('#finance-copy').textContent, FINANCE[key].copy)
    assert.equal(document.querySelectorAll('[data-finance][aria-pressed="true"]').length, 1)
  }
})
test('Mobile navigation closes after selection and Escape', () => {
  const { document, window } = parseHTML(readFileSync('index.html', 'utf8'))
  initInteractions(document)
  const toggle = document.querySelector('.menu-toggle'),
    nav = document.querySelector('#mobile-nav')
  toggle.click()
  assert.equal(nav.hidden, false)
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  nav.querySelector('a').click()
  assert.equal(nav.hidden, true)
  toggle.click()
  const event = new window.Event('keydown')
  event.key = 'Escape'
  document.dispatchEvent(event)
  assert.equal(nav.hidden, true)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
})
test('Source dialog opens and closes through the documented controls', () => {
  const { document } = parseHTML(readFileSync('index.html', 'utf8'))
  const dialog = document.querySelector('dialog')
  dialog.showModal = () => dialog.setAttribute('open', '')
  dialog.close = () => dialog.removeAttribute('open')
  initInteractions(document)
  document.querySelector('#parameters-button').click()
  assert(dialog.hasAttribute('open'))
  document.querySelector('#close-dialog').click()
  assert(!dialog.hasAttribute('open'))
})
