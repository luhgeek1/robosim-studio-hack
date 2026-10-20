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
