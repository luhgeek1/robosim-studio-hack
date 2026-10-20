import { expect, test, type Page } from '@playwright/test'

async function account(page: Page) {
  const response = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-Client': 'web' },
    data: {
      email: `progress-${crypto.randomUUID()}@example.com`,
      password: 'ProgressDemo123!',
      name: 'Проверка прогресса',
    },
  })
  expect(response.status()).toBe(201)
  return { Authorization: `Bearer ${(await response.json()).access_token}` }
}

test('server completes a sweep after navigation and reload, without duplicating it', async ({ page }) => {
  test.setTimeout(240_000)
  const headers = await account(page)
  const created = await page.request.post('/api/v1/projects', {
    headers,
    data: {
      name: 'Проверка фоновой имитации',
      object_type: 'warehouse',
      init: { mode: 'demo', demo_key: 'warehouse_demo_01' },
    },
  })
  const project = await created.json()
  const matching = await page.request.get(`/api/v1/projects/${project.id}/matching`, { headers })
  const pallet = (await matching.json()).processes.find(
    (p: { process_key: string }) => p.process_key === 'pallet_transport',
  )
  const product = pallet.candidates.find((c: { product: { name: string } }) => c.product.name.includes('H1500')).product
    .id
  const made = await page.request.post(`/api/v1/projects/${project.id}/scenarios`, {
    headers,
    data: {
      name: 'Паллеты: проверка фонового расчёта',
      kind: 'purchase',
      items: [{ process_key: 'pallet_transport', product_id: product }],
    },
  })
  const scenario = await made.json()
  await page.request.post(`/api/v1/scenarios/${scenario.id}/calculate`, { headers, data: {} })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/projects/${project.id}/scenarios/${scenario.id}`)
  const started = page.waitForResponse((r) => r.url().endsWith('/fleet-sweep') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Пересчитать', exact: true }).click()
  const job = await (await started).json()
  const panel = page.getByRole('region', { name: 'Фоновые задачи' })
  await expect(panel.getByText('Проверяем число роботов')).toBeVisible()
  await expect(panel.getByRole('progressbar')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('desktop.png') })
  await page.getByRole('link', { name: 'Каталог', exact: true }).first().click()
  await expect(panel).toBeVisible()
  await page.reload()
  await expect(panel).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: test.info().outputPath('mobile.png') })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/jobs/${job.id}`, { headers })).json()).status, {
      timeout: 180_000,
    })
    .toBe('done')
  await expect(panel.getByText('Готово', { exact: true })).toBeVisible()
  const jobs = await (await page.request.get('/api/v1/jobs', { headers })).json()
  expect(jobs.items.filter((j: { scenario_id: string }) => j.scenario_id === scenario.id)).toHaveLength(1)
  const saved = await (await page.request.get(`/api/v1/scenarios/${scenario.id}`, { headers })).json()
  const calculation = await (
    await page.request.get(`/api/v1/calculations/${saved.last_calculation.calculation_id}`, { headers })
  ).json()
  expect(calculation.sizing[0].count.source).toBe('simulated')
  await panel.getByRole('link', { name: 'Открыть результат' }).click()
  await expect(page).toHaveURL(new RegExp(`/scenarios/${scenario.id}$`))
  await expect(page.getByRole('button', { name: 'Пересчитать', exact: true })).toBeEnabled()
})

test('long-running task retains progress through network loss and reports worker failure', async ({ page }) => {
  await account(page)
  let offline = false
  let failed = false
  const created = new Date(Date.now() - 240_000).toISOString()
  await page.route('**/api/v1/jobs', (route) =>
    offline
      ? route.abort()
      : route.fulfill({
          json: {
            items: [
              {
                id: 'ee035be9-4f5b-4b0c-a36c-c019789b12c1',
                type: 'simulation',
                kind: 'fleet_sweep',
                status: failed ? 'failed' : 'running',
                progress: 0.64,
                stage: 'Отбор заказов · N = 147 · повтор 3/5',
                label: 'Фулфилмент 24/7: покупка по рекомендации',
                completed_runs: 24,
                created_at: created,
                started_at: created,
                progress_updated_at: new Date().toISOString(),
                eta_seconds: 18,
                error: failed ? { detail: 'Истёк лимит времени. Запустите расчёт снова.' } : null,
                finished_at: failed ? new Date().toISOString() : null,
              },
            ],
          },
        }),
  )
  await page.goto('/projects')
  const panel = page.getByRole('region', { name: 'Фоновые задачи' })
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '64')
  await expect(panel).toContainText('Прошло 4 мин')
  offline = true
  await expect(panel).toContainText('Нет связи с сервером', { timeout: 15_000 })
  await expect(panel.getByRole('progressbar')).toHaveAttribute('value', '64')
  await page.screenshot({ path: test.info().outputPath('offline.png') })
  await panel.getByRole('button', { name: 'Имитация выполняется', exact: true }).click()
  offline = false
  failed = true
  await expect(panel.getByRole('status')).toContainText('Имитация завершилась ошибкой')
  await panel.getByRole('button', { name: 'Фоновые задачи', exact: true }).click()
  await expect(panel).toContainText('Не удалось завершить')
  await expect(panel).toContainText('Истёк лимит времени')
  await page.screenshot({ path: test.info().outputPath('failed.png') })
  await panel.getByRole('button', { name: 'Скрыть завершённую задачу' }).click()
  await expect(panel).toHaveCount(0)
})

test('ordinary simulation links to its own scenario and cancellation never offers a result', async ({ page }) => {
  const headers = await account(page)
  const project = await (
    await page.request.post('/api/v1/projects', {
      headers,
      data: {
        name: 'Несколько сценариев',
        object_type: 'warehouse',
        init: { mode: 'blank' },
      },
    })
  ).json()
  const scenario = await (
    await page.request.post(`/api/v1/projects/${project.id}/scenarios`, {
      headers,
      data: {
        name: 'Другой сценарий для проверки',
        kind: 'purchase',
        items: [],
      },
    })
  ).json()
  expect(scenario.id).toBeTruthy()
  await page.route('**/api/v1/jobs', (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: 'f25cabcc-2ec0-4e31-adc1-cfffb8a77999',
            type: 'simulation',
            kind: 'simulation',
            status: 'cancelled',
            project_id: project.id,
            scenario_id: scenario.id,
            label: scenario.name,
            progress: 0.3,
            created_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          },
        ],
      },
    }),
  )
  await page.goto('/projects')
  const panel = page.getByRole('region', { name: 'Фоновые задачи' })
  await expect(panel).toContainText('Отменено')
  await expect(panel.getByRole('link', { name: 'Открыть результат' })).toHaveCount(0)
  await panel.getByRole('link', { name: 'К сценарию' }).click()
  await expect(page).toHaveURL(new RegExp(`/scenarios/${scenario.id}$`))
  await expect(page.getByRole('textbox', { name: 'Название сценария' })).toHaveValue(scenario.name)
})
