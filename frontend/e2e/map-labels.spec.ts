import { expect, test } from '@playwright/test'

test('3D labels follow a continuous orbit without jumping or flashing', async ({ page }, info) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/e2e/fixtures/twin.html')
  const captions = page.locator('[data-map-label]')
  await expect(captions).toHaveCount(8)
  await expect.poll(() => captions.first().evaluate((el) => getComputedStyle(el.parentElement!).opacity)).toBe('1')
  await page.waitForTimeout(500)
  const bounds = (await page.locator('canvas').boundingBox())!
  const start = { x: bounds.x + bounds.width * 0.4, y: bounds.y + bounds.height * 0.5 }
  let maxStep = 0
  let maxAcceleration = 0
  let visibilityChanges = 0
  for (const direction of [1, -1]) {
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    const samples = []
    for (let i = 0; i < 100; i++) {
      await page.mouse.move(start.x + direction * i * 2, start.y + Math.sin(i / 40) * 20)
      await page.evaluate(() => new Promise(requestAnimationFrame))
      samples.push(
        await captions.evaluateAll((els) =>
          els.map((el) => {
            const rect = el.getBoundingClientRect()
            return { x: rect.x, y: rect.y, opacity: (el.parentElement as HTMLElement).style.opacity }
          }),
        ),
      )
    }
    await page.mouse.up()
    for (let i = 2; i < samples.length; i++) {
      for (let j = 0; j < samples[i].length; j++) {
        const [a, b, c] = [samples[i - 2][j], samples[i - 1][j], samples[i][j]]
        maxStep = Math.max(maxStep, Math.hypot(c.x - b.x, c.y - b.y))
        maxAcceleration = Math.max(maxAcceleration, Math.hypot(c.x - 2 * b.x + a.x, c.y - 2 * b.y + a.y))
        if (c.opacity !== b.opacity) visibilityChanges++
      }
    }
    await page.waitForTimeout(1000)
    await expect
      .poll(() =>
        captions.evaluateAll((els) => {
          const rects = els
            .filter((el) => Number(getComputedStyle(el.parentElement!).opacity) > 0.95)
            .map((el) => el.getBoundingClientRect())
          return rects.some((a, i) =>
            rects
              .slice(i + 1)
              .some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top),
          )
        }),
      )
      .toBe(false)
  }
  await info.attach('motion-metrics', {
    body: JSON.stringify({ maxStep, maxAcceleration, visibilityChanges }),
    contentType: 'application/json',
  })
  expect(maxStep).toBeLessThan(12)
  expect(maxAcceleration).toBeLessThan(10)
  expect(visibilityChanges).toBe(0)
  expect(
    await captions.evaluateAll((els) => Math.max(...els.map((el) => el.getBoundingClientRect().height))),
  ).toBeLessThanOrEqual(18)
  expect(errors).toEqual([])
})
