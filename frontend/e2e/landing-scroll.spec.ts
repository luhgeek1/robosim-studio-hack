import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1470, height: 747 },
  { width: 390, height: 844 },
]) {
  test(`docked warehouse stays attached during native scrolling at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const surface = page.locator('.cm-shared-warehouse')
    const target = page.locator('[data-object="warehouse"] .lp-object-model')
    await expect(surface).toHaveAttribute('data-ready', 'true')
    await page.evaluate(() => document.fonts.ready)
    await target.scrollIntoViewIfNeeded()
    await expect(surface).toHaveAttribute('data-docked', 'true')
    const alignmentError = () =>
      surface.evaluate((el) => {
        const model = el.getBoundingClientRect()
        const card = document.querySelector('[data-object="warehouse"] .lp-object-model')!.getBoundingClientRect()
        return Math.max(Math.abs(model.top - card.top), Math.abs(model.left - card.left))
      })
    await expect.poll(alignmentError).toBeLessThan(1)

    const samples = await surface.evaluate((el) => {
      const target = document.querySelector('[data-object="warehouse"] .lp-object-model')!
      return [32, 64, -24, -48, 16].map((delta) => {
        const before = window.scrollY
        // Inspect within the same task: native scrolling can move the page before
        // WebGL or requestAnimationFrame has had a chance to update the model.
        window.scrollBy({ top: delta, behavior: 'instant' })
        const model = el.getBoundingClientRect()
        const card = target.getBoundingClientRect()
        return { moved: window.scrollY - before, error: Math.abs(model.top - card.top) }
      })
    })
    expect(samples.every((sample) => Math.abs(sample.moved) > 0)).toBe(true)
    expect(Math.max(...samples.map((sample) => sample.error))).toBeLessThan(1)
  })
}
