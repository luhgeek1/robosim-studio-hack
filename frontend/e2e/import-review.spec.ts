import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

async function project(page: Page, kind = 'warehouse') {
  await page.goto('/login')
  await page.getByLabel('Эл. почта', { exact: true }).fill('user@robomera.demo')
  await page.getByLabel('Пароль', { exact: true }).fill('Demo12345!')
  const login = page.waitForResponse((r) => r.url().endsWith('/auth/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  const token = (await (await login).json()).access_token as string
  const created = await page.request.post('/api/v1/projects', {
    data: { name: 'Проверка импорта в браузере', object_type: kind },
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(created.status()).toBe(201)
  const id = (await created.json()).id as string
  await page.goto(`/projects/${id}/object`)
  await page.getByRole('button', { name: 'Загрузить файл', exact: true }).click()
  return { id, token }
}

async function upload(page: Page, filename: string) {
  const parsed = page.waitForResponse((r) => /\/import$/.test(r.url()) && r.request().method() === 'POST')
  await page.locator('input[type="file"]').setInputFiles(path.resolve('public/import-examples', filename))
  const response = await parsed
  expect(response.status()).toBe(200)
  return response.json()
}

test('review suggestions → manual repair → download → apply → reimport corrected file', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1366, height: 768 })
  const { id, token } = await project(page)
  const preview = await upload(page, 'warehouse-repairs.json')
  await page.getByText('Только проблемы и изменения', { exact: true }).click()
  await expect(page.getByRole('button', { name: 'Применить предложения (3)', exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('desktop-errors.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: test.info().outputPath('mobile-errors.png') })
  await page.setViewportSize({ width: 1366, height: 768 })
  const reviewed = page.waitForResponse((r) => r.url().endsWith('/review'))
  await page.getByRole('button', { name: 'Применить предложения (3)', exact: true }).click()
  expect((await reviewed).status()).toBe(200)
  const wms = preview.rows.find((r: { key: string }) => r.key === 'has_wms')
  await page.getByRole('textbox', { name: `Значение строки ${wms.row_id}`, exact: true }).fill('Нет')
  await page.getByRole('button', { name: 'Проверить изменения', exact: true }).click()
  const apply = page.getByRole('button', { name: /^Применить \(\d+\)$/ })
  await expect(apply).toBeEnabled()
  await expect(page.getByText('Исправлено', { exact: true })).toHaveCount(4)
  await page.screenshot({ path: test.info().outputPath('desktop-repaired.png') })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать исправленный JSON', exact: true }).click()
  const download = await downloadEvent
  const savedPath = await download.path()
  expect(savedPath).not.toBeNull()
  const saved = JSON.parse(await readFile(savedPath!, 'utf8'))
  expect(saved.find((p: { key: string }) => p.key === 'area_m2').value).toBe(20000)
  expect(saved.find((p: { key: string }) => p.key === 'has_wms').value).toBe(false)
  await apply.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const response = await page.request.get(`/api/v1/projects/${id}/params`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect((await response.json()).params.find((p: { key: string }) => p.key === 'has_wms').value).toBe(false)
  await page.getByRole('button', { name: 'Загрузить файл', exact: true }).click()
  await page.locator('input[type="file"]').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  })
  await expect(page.getByRole('button', { name: /^Применить \(\d+\)$/ })).toBeEnabled()
  expect(errors).toEqual([])
})

test('duplicates and unknown fields can be resolved in the same dialog', async ({ page }) => {
  await project(page)
  const preview = await upload(page, 'warehouse-duplicates.json')
  await page.getByRole('checkbox', { name: 'Включить строку 2', exact: true }).uncheck()
  await page.getByRole('textbox', { name: 'Значение строки 3', exact: true }).fill('80')
  await page.getByRole('textbox', { name: 'Значение строки 4', exact: true }).fill('2')
  await page.getByLabel('Параметр строки 5', { exact: true }).selectOption('cleaning_area_m2')
  await page.getByRole('textbox', { name: 'Значение строки 6', exact: true }).fill('10000')
  await page.getByRole('button', { name: 'Проверить изменения', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Применить (5)', exact: true })).toBeEnabled()
  expect(preview.rows).toHaveLength(6)
  await page.getByRole('button', { name: 'Применить (5)', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('hospital suggestions and JSON punctuation recovery are visible', async ({ page }) => {
  await project(page, 'hospital')
  const preview = await upload(page, 'hospital-repairs.json')
  await page.getByRole('button', { name: 'Применить предложения (2)', exact: true }).click()
  const lift = preview.rows.find((r: { key: string }) => r.key === 'elevators')
  await page.getByRole('textbox', { name: `Значение строки ${lift.row_id}`, exact: true }).fill('4')
  await page.getByRole('button', { name: 'Проверить изменения', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Применить \(\d+\)$/ })).toBeEnabled()
  await page.getByRole('button', { name: 'Выбрать другой файл', exact: true }).click({ trial: true })
  await upload(page, 'broken-json.json')
  await expect(page.getByText(/Формат JSON восстановлен/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Применить (1)', exact: true })).toBeEnabled()
  await page.locator('input[type="file"]').setInputFiles({
    name: 'unreadable.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{\n"area_m2": nope}'),
  })
  await expect(page.getByRole('alert').filter({ hasText: /Некорректный JSON: строка 2, столбец/ })).toBeVisible()
})
