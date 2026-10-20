import { expect, test, type Page } from '@playwright/test'

async function account(page: Page) {
  const response = await page.request.post('/api/v1/auth/register', {
    headers: { 'X-Client': 'web' },
    data: { email: `starter-${crypto.randomUUID()}@example.com`, password: 'StarterDemo123!', name: 'Тест проекта' },
  })
  expect(response.status()).toBe(201)
  const { access_token: token } = await response.json()
  return { Authorization: `Bearer ${token}` }
}

test('first project uses own data, opens parameters and replaces the starter with the list', async ({ page }) => {
  const headers = await account(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.goto('/projects')
  const starter = page.getByRole('region', { name: 'Начните с вашего объекта.' })
  await expect(starter.getByRole('radio', { name: 'Свои данные', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Новый проект', exact: true })).toHaveCount(0)
  const button = starter.getByRole('button', { name: 'Создать проект', exact: true })
  await expect(button).toBeInViewport()
  await page.screenshot({ path: test.info().outputPath('desktop-1366.png'), fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.screenshot({ path: test.info().outputPath('desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true })
  await page.setViewportSize({ width: 1366, height: 768 })
  await starter.getByText('Медицинское учреждение', { exact: true }).click()
  await starter.getByLabel('Название проекта').fill('Новая больница')
  const created = page.waitForResponse((r) => r.url().endsWith('/projects') && r.request().method() === 'POST')
  await button.click()
  const response = await created
  expect(response.status()).toBe(201)
  const project = await response.json()
  expect(project.object_type).toBe('hospital')
  expect(project.organization_id).toBeNull()
  await expect(page).toHaveURL(new RegExp(`/projects/${project.id}/object$`))
  const params = await page.request.get(`/api/v1/projects/${project.id}/params`, { headers })
  expect((await params.json()).params.find((p: { key: string }) => p.key === 'area_m2').value).toBeNull()
  await page.goto('/projects')
  await expect(page.getByRole('main').getByRole('link', { name: 'Новая больница', exact: true })).toBeVisible()
  await expect(starter).toHaveCount(0)
  await page.getByRole('button', { name: 'Новый проект', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('empty organization resets the draft and creates the chosen example in that workspace', async ({ page }) => {
  const headers = await account(page)
  const org = await page.request.post('/api/v1/organizations', { headers, data: { name: 'Команда проекта' } })
  expect(org.status()).toBe(201)
  const organization = await org.json()
  await page.goto('/projects')
  await page.getByLabel('Название проекта').fill('Личный черновик')
  await page.getByRole('button', { name: 'Профиль и рабочие области' }).click()
  await page.getByRole('menuitem', { name: /Команда проекта/ }).click()
  await expect(page.getByLabel('Название проекта')).toHaveValue('')
  await expect(page.getByText(/Проект появится в организации/)).toBeVisible()
  await page.getByText('Готовый пример', { exact: true }).click()
  await page.getByLabel('Набор исходных данных').selectOption('warehouse_showcase_24x7')
  await page.getByText('Аэропорт', { exact: true }).click()
  await expect(page.getByLabel('Набор исходных данных')).toHaveValue('airport_demo_01')
  await page.getByText('Склад', { exact: true }).click()
  await expect(page.getByLabel('Набор исходных данных')).toHaveValue('warehouse_showcase_24x7')
  const created = page.waitForResponse((r) => r.url().endsWith('/projects') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Создать проект', exact: true }).click()
  const response = await created
  expect(response.status()).toBe(201)
  expect(response.request().postDataJSON().init).toEqual({ mode: 'demo', demo_key: 'warehouse_showcase_24x7' })
  const project = await response.json()
  expect(project.organization_id).toBe(organization.id)
  expect(project.name).toContain('Фулфилмент 24/7')
  const params = await page.request.get(`/api/v1/projects/${project.id}/params`, { headers })
  expect((await params.json()).params.find((p: { key: string }) => p.key === 'area_m2').value).toBe(20000)
})

test('mobile starter retains a draft after a failed request and supports retry', async ({ page }) => {
  await account(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/projects')
  await expect(page.getByRole('heading', { name: 'Начните с вашего объекта.' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true })
  await page.getByLabel('Название проекта').fill('Мобильный проект')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  await page.route('**/api/v1/projects', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 503,
      json: {
        type: 'about:blank',
        title: 'Недоступно',
        status: 503,
        error_code: 'INTERNAL_ERROR',
        detail: 'Попробуйте создать проект ещё раз.',
      },
    })
  })
  await page.getByRole('button', { name: 'Создать проект', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Попробуйте создать проект ещё раз.')
  await expect(page.getByLabel('Название проекта')).toHaveValue('Мобильный проект')
  await page.unroute('**/api/v1/projects')
  await page.getByRole('button', { name: 'Создать проект', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/object$/)
})
