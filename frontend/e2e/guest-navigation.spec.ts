import { expect, test } from '@playwright/test'

test('guest Projects opens the demo chooser on desktop, mobile and direct entry', async ({ page }) => {
  await page.goto('/projects?new=1')
  await expect(page).toHaveURL(/\/demo\?new=1$/)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/projects')
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole('region', { name: 'Выберите объект' }).getByRole('link')).toHaveCount(4)
  const projects = page
    .getByRole('navigation', { name: 'Разделы', exact: true })
    .getByRole('link', { name: 'Проекты', exact: true })
  await expect(projects).toHaveAttribute('href', '/demo')

  await page.getByRole('link', { name: 'Начать со склада', exact: true }).click()
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/object$/)
  const projectUrl = page.url()
  await projects.click()
  await expect(page).toHaveURL(/\/demo$/)
  await expect(
    page.getByRole('heading', { name: 'От объекта до решения. Пройдите путь сами.', exact: true }),
  ).toBeVisible()

  await page.goto(projectUrl)
  await expect(page.getByRole('button', { name: 'Загрузить файл', exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Меню', exact: true }).click()
  const mobileProjects = page.getByRole('dialog').getByRole('link', { name: 'Проекты', exact: true })
  await expect(mobileProjects).toHaveAttribute('href', '/demo')
  await mobileProjects.click()
  await expect(page).toHaveURL(/\/demo$/)

  await page.getByRole('button', { name: 'Меню', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Новый проект', exact: true }).click()
  await expect(page).toHaveURL(/\/demo\?new=1$/)
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Новый проект оценки' })).toBeVisible()
})

test('an account keeps the project list and its Projects link', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Эл. почта', { exact: true }).fill('user@robomera.demo')
  await page.getByLabel('Пароль', { exact: true }).fill('Demo12345!')
  await page.getByRole('button', { name: 'Войти', exact: true }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(page.getByRole('heading', { name: 'Проекты', exact: true })).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Разделы', exact: true }).getByRole('link', { name: 'Проекты', exact: true }),
  ).toHaveAttribute('href', '/projects')
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/projects$/)
})

test('a registered account reopens a demo with full object and matching tools', async ({ page }) => {
  test.setTimeout(300_000)
  await page.goto('/demo/warehouse_demo_01')
  await expect(page).toHaveURL(/\/projects\/[\w-]+\/object$/, { timeout: 120_000 })
  const objectPath = new URL(page.url()).pathname
  const projectPath = objectPath.replace(/\/object$/, '')
  const steps = page.getByRole('navigation', { name: 'Шаги оценки' })
  await expect(steps.getByRole('link')).toHaveCount(5)
  await page.getByRole('button', { name: 'Изменить параметры', exact: true }).click()
  const area = page.locator('#param-area_m2 input')
  await expect(area).toHaveValue(/20\s*000/)

  await page
    .getByRole('complementary', { name: 'Режим проекта' })
    .getByRole('link', { name: 'Сохранить в аккаунт', exact: true })
    .click()
  await page.getByLabel('Имя', { exact: true }).fill('Проверка полного проекта')
  await page.getByLabel('Эл. почта', { exact: true }).fill(`full-project-${crypto.randomUUID()}@example.org`)
  await page.getByLabel('Пароль (не короче 8 символов)', { exact: true }).fill('FullProject123!')
  const registered = page.waitForResponse(
    (response) => response.url().endsWith('/auth/register') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Зарегистрироваться', exact: true }).click()
  const registration = await registered
  expect(registration.status()).toBe(201)
  const { access_token: token, user } = await registration.json()
  expect(user.role).toBe('user')
  const headers = { Authorization: `Bearer ${token}` }
  try {
    await expect(page).toHaveURL(new RegExp(`${objectPath}$`))
    await expect(steps.getByRole('link')).toHaveCount(9)
    await expect(area).toBeVisible()
    await expect(area).toHaveValue(/20\s*000/)
    await expect(page.getByRole('button', { name: 'Изменить параметры', exact: true })).toHaveCount(0)
    await expect(page.getByRole('complementary', { name: 'Режим проекта' })).toHaveCount(0)

    await steps.getByRole('link', { name: /Подбор/ }).click()
    await expect(page.getByRole('button', { name: 'Веса критериев', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Пересчитать', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Сценарий из рекомендации', exact: true })).toBeVisible()

    // Повторный переход через список и прямое открытие должны сохранять полный интерфейс.
    await page.goto('/projects')
    const project = await page.request.get(`/api/v1${projectPath}`, { headers })
    expect(project.status()).toBe(200)
    await page
      .getByRole('article', { name: (await project.json()).name, exact: true })
      .getByRole('link')
      .first()
      .click()
    await expect(steps.getByRole('link')).toHaveCount(9)
    await page.goto(objectPath)
    await page.reload()
    await expect(steps.getByRole('link')).toHaveCount(9)
    await expect(area).toBeVisible()
    await expect(area).toHaveValue(/20\s*000/)
    await expect(page.getByRole('complementary', { name: 'Режим проекта' })).toHaveCount(0)

    // И новый пример, открытый уже под аккаунтом, сразу получает полный интерфейс.
    await page.goto('/demo/warehouse_demo_01')
    await expect(page).toHaveURL(/\/projects\/[\w-]+\/object$/)
    await expect(steps.getByRole('link')).toHaveCount(9)
    await expect(page.getByRole('complementary', { name: 'Режим проекта' })).toHaveCount(0)
  } finally {
    const projects = await page.request.get('/api/v1/projects', { headers })
    for (const project of (await projects.json()).items)
      await page.request.delete(`/api/v1/projects/${project.id}`, { headers })
  }
})
