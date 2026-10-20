import assert from 'node:assert/strict'
import { test } from 'node:test'
import { projectsHome, sessionHome, workspaceHome } from '../src/entities/session/home.ts'
import { accountReturnPath } from '../src/features/auth/links.ts'

test('a guest can return to the landing without losing access to the demo entry', () => {
  for (const user of [null, { role: 'guest' as const }]) {
    assert.equal(sessionHome(user).path, '/')
    assert.equal(workspaceHome(user), '/demo')
    assert.equal(projectsHome(user), '/demo')
  }
})

test('account homes follow the role rather than the presence of a guest token', () => {
  for (const [role, path] of [
    ['user', '/projects'],
    ['admin', '/admin'],
    ['vendor', '/vendor'],
  ] as const) {
    assert.equal(sessionHome({ role }).path, path)
    assert.equal(workspaceHome({ role }), path)
    assert.equal(projectsHome({ role }), '/projects')
  }
})

test('logging in from a demo entry or example does not return to guest onboarding', () => {
  for (const path of ['/demo', '/demo/', '/demo?step=object', '/demo/warehouse_demo_01?step=simulation']) {
    assert.equal(accountReturnPath(path), null, path)
  }
})

test('an explicit request to create a project survives account login', () => {
  for (const path of ['/demo?new=1', '/demo/?new=1', '/projects?new=1']) {
    assert.equal(accountReturnPath(path), '/projects?new=1')
  }
  assert.equal(accountReturnPath('/demo/warehouse_demo_01?new=1'), null)
})

test('saving an open project and accepting an invitation retain their destinations', () => {
  for (const path of [
    '/projects/saved-guest-project/object?tab=params',
    '/invitations/pending-invitation',
    '/organizations/team',
    '/account',
    '/app',
  ]) {
    assert.equal(accountReturnPath(path), path)
  }
})

test('unsafe login destinations cannot become redirects', () => {
  for (const path of [null, undefined, '', 'https://example.com', '//example.com', '/\\example.com', '/demo\n']) {
    assert.equal(accountReturnPath(path), null)
  }
})
