import assert from 'node:assert/strict'
import { test } from 'node:test'
import { deploymentRecovery } from '../src/app/deployment-recovery.ts'

function setup(latestEntry: () => Promise<string | null>) {
  let reloads = 0
  let lastReload = 0
  const recover = deploymentRecovery({
    currentEntry: '/assets/index-old.js',
    latestEntry,
    lastReloadAt: () => lastReload,
    rememberReload: (time) => {
      lastReload = time
    },
    reload: () => {
      reloads++
    },
    now: () => 100_000,
  })
  return { recover, reloads: () => reloads }
}

test('a missing old chunk reloads once when the HTML points to a new deployment', async () => {
  const app = setup(async () => '/assets/index-new.js')
  assert.equal(await app.recover(), true)
  assert.equal(await app.recover(), false)
  assert.equal(app.reloads(), 1)
})

test('unchanged HTML, unavailable HTML and network failures retain the manual retry screen', async () => {
  for (const latest of [
    async () => '/assets/index-old.js',
    async () => null,
    async () => {
      throw new Error('offline')
    },
  ]) {
    const app = setup(latest)
    assert.equal(await app.recover(), false)
    assert.equal(app.reloads(), 0)
  }
})

test('concurrent import failures cannot trigger multiple reloads', async () => {
  let finish!: (entry: string) => void
  const app = setup(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const first = app.recover()
  assert.equal(await app.recover(), false)
  finish('/assets/index-new.js')
  assert.equal(await first, true)
  assert.equal(app.reloads(), 1)
})

test('a persisted reload guard survives a new document and blocked storage does not loop', async () => {
  let reloads = 0
  const options = {
    currentEntry: '/assets/index-old.js',
    latestEntry: async () => '/assets/index-new.js',
    lastReloadAt: () => 99_000,
    rememberReload: () => {
      throw new Error('storage unavailable')
    },
    reload: () => {
      reloads++
    },
    now: () => 100_000,
  }
  assert.equal(await deploymentRecovery(options)(), false)
  assert.equal(await deploymentRecovery({ ...options, lastReloadAt: () => 0 })(), false)
  assert.equal(reloads, 0)
})
