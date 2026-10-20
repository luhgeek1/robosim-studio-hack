import { expect, test } from '@playwright/test'

// Ответы API изолированы: проверяем реальный переход сессии и интерфейс проекта без расчётного сервера.
for (const mode of ['register', 'login'] as const) {
  test(`a saved demo becomes a full project after ${mode} and stays full on reload`, async ({ page, context }) => {
    const projectId = 'saved-demo-project'
    const projectPath = `/projects/${projectId}/report`
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let account = false
    const user = () => ({
      id: account ? 'account-user' : 'guest-user',
      role: account ? 'user' : 'guest',
      name: 'Тестовый пользователь',
      email: account ? 'saved-demo@example.org' : null,
      is_active: true,
      email_verified: false,
    })
    const tokens = () => ({ access_token: 'test-access-token', user: user() })
    await context.addCookies([{ name: 'csrf_token', value: 'test-csrf', url: test.info().project.use.baseURL! }])
    await page.addInitScript(
      ({ projectId }) => {
        if (!localStorage.getItem('robomera-project-journey-v1'))
          localStorage.setItem(
            'robomera-project-journey-v1',
            JSON.stringify({
              state: { projects: { [projectId]: { demoKey: 'warehouse_demo_01', full: false } } },
              version: 0,
            }),
          )
      },
      { projectId },
    )
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
      if (path === `/auth/${mode}` && route.request().method() === 'POST') {
        expect(route.request().headers()['x-keep-guest-csrf']).toBe('test-csrf')
        account = true
        return route.fulfill({ status: mode === 'register' ? 201 : 200, json: tokens() })
      }
      if (path === '/auth/refresh') return route.fulfill({ json: tokens() })
      if (path === '/me') return route.fulfill({ json: user() })
      if (path === `/projects/${projectId}`)
        return route.fulfill({
          json: { id: projectId, name: 'Мой склад', object_type: 'warehouse', data_quality: { score: 0.8 } },
        })
      if (path === `/projects/${projectId}/comparison`)
        return route.fulfill({ status: 409, json: { status: 409, detail: 'Нет рассчитанных сценариев' } })
      return route.fulfill({ json: { items: [] } })
    })

    await page.goto(projectPath)
    const steps = page.getByRole('navigation', { name: 'Шаги оценки' }).getByRole('link')
    const notice = page.getByRole('complementary', { name: 'Режим проекта' })
    await expect(steps).toHaveCount(5)
    await expect(notice).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Сохраните свой результат', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Все инструменты', exact: true }).click()
    await expect(steps).toHaveCount(9)
    await page.getByRole('button', { name: 'Короткий маршрут', exact: true }).click()
    await expect(steps).toHaveCount(5)

    await notice.getByRole('link', { name: 'Сохранить в аккаунт', exact: true }).click()
    if (mode === 'login') await page.getByRole('button', { name: 'Уже есть аккаунт? Войти', exact: true }).click()
    else await page.getByLabel('Имя', { exact: true }).fill('Тестовый пользователь')
    await page.getByLabel('Эл. почта', { exact: true }).fill('saved-demo@example.org')
    await page
      .getByLabel(mode === 'register' ? 'Пароль (не короче 8 символов)' : 'Пароль', { exact: true })
      .fill('SavedDemo123!')
    await page.getByRole('button', { name: mode === 'register' ? 'Зарегистрироваться' : 'Войти', exact: true }).click()

    await expect(page).toHaveURL(new RegExp(`${projectPath}$`))
    await expect(steps).toHaveCount(9)
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'От примера - к вашему объекту', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(steps).toHaveCount(9)
    await expect(notice).toHaveCount(0)
    expect(errors).toEqual([])
  })
}
