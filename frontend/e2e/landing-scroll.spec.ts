import { expect, test } from '@playwright/test'

for (const viewport of [
  { width: 1366, height: 768 },
  { width: 1470, height: 1100 },
]) {
  test(`applications follow native scroll after docking at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    const surface = page.locator('.cm-shared-warehouse')
    await expect(surface).toHaveAttribute('data-ready', 'true')
    await page.evaluate(() => document.fonts.ready)
    // Enter the docking interval without scrollIntoView skipping to its end.
    const dockScroll = await page.evaluate(() => {
      const story = document.querySelector('.cm-story')!.getBoundingClientRect()
      const target = document.querySelector('[data-object="warehouse"] .lp-object-model')!.getBoundingClientRect()
      const end = target.top + scrollY - Math.max(150, (innerHeight - target.height) * 0.4)
      return story.top + scrollY + Math.max(innerHeight * 2.6, end - story.top - scrollY) * 0.88
    })
    await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), dockScroll)
    await expect(surface).toHaveAttribute('data-docked', 'true')
    await expect.poll(async () => Number(await surface.getAttribute('data-progress'))).toBeCloseTo(0.88, 2)

    const samples = await page.evaluate(async () => {
      const section = document.querySelector('.lp-applications')!
      const surface = document.querySelector('.cm-shared-warehouse')!
      const target = document.querySelector('[data-object="warehouse"] .lp-object-model')!
      const documentTop = section.getBoundingClientRect().top + scrollY
      const samples: { drift: number; alignment: number; moved: number }[] = []
      for (const delta of [48, 48, 48, -48, -48, -48]) {
        const before = scrollY
        scrollBy({ top: delta, behavior: 'instant' })
        // An opposing transform can keep the model aligned while the section bounces.
        for (let frame = 0; frame < 8; frame++) {
          samples.push({
            drift: Math.abs(section.getBoundingClientRect().top + scrollY - documentTop),
            alignment: Math.abs(surface.getBoundingClientRect().top - target.getBoundingClientRect().top),
            moved: scrollY - before,
          })
          await new Promise(requestAnimationFrame)
        }
      }
      return samples
    })
    expect(samples.every(({ moved }) => Math.abs(moved) === 48)).toBe(true)
    expect(Math.max(...samples.map(({ drift }) => drift))).toBeLessThan(1)
    expect(Math.max(...samples.map(({ alignment }) => alignment))).toBeLessThan(1)
    const gaps = await page.evaluate(() => {
      const bottom = document.querySelector('.lp-applications')!.getBoundingClientRect().bottom
      return ['.landing-workflow', '.cm-experience'].map((selector) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect()
        return (selector === '.landing-workflow' ? rect.top : rect.bottom) - bottom
      })
    })
    expect(Math.max(...gaps.map(Math.abs))).toBeLessThan(1)
  })
}

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
