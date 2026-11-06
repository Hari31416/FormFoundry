import { test, expect, type Page } from '@playwright/test'

const admin = {
  id: 'admin',
  username: 'admin',
  role: 'admin',
  disabled: false,
  expires_at: null,
}
const reader = {
  id: 'reader',
  username: 'reader',
  role: 'user',
  disabled: false,
  expires_at: null,
}
const schema = {
  template_id: 'repair',
  template_version: 1,
  name: 'Repair intake',
  domain: 'custom',
  description: 'Repair requests',
  schema: [],
  field_groups: [],
  supported_artifacts: [],
}

async function mockSession(
  page: Page,
  role: 'admin' | 'user',
  initialToken = true,
) {
  let assigned: string[] = []
  let disabled = false
  const me = role === 'admin' ? admin : reader
  await page.addInitScript(
    ({ initialToken }) => {
      if (!localStorage.getItem('i18nextLng'))
        localStorage.setItem('i18nextLng', 'en')
      if (initialToken)
        localStorage.setItem('formfoundry_access_token', 'session-token')
    },
    { initialToken },
  )
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/token'))
      return route.fulfill({
        json: { access_token: 'session-token', token_type: 'bearer' },
      })
    if (path.endsWith('/auth/me')) {
      expect(route.request().headers()['authorization']).toBe(
        'Bearer session-token',
      )
      return route.fulfill({ json: me })
    }
    if (path.endsWith('/auth/users/reader/schemas')) {
      if (route.request().method() === 'PUT')
        assigned = route.request().postDataJSON().template_ids
      return route.fulfill({ json: assigned })
    }
    if (path.endsWith('/auth/users/admin/schemas'))
      return route.fulfill({ json: [] })
    if (path.endsWith('/auth/users/reader')) {
      disabled = route.request().postDataJSON().disabled
      return route.fulfill({ json: { ...reader, disabled } })
    }
    if (path.endsWith('/auth/users'))
      return route.fulfill({ json: [admin, { ...reader, disabled }] })
    if (path.endsWith('/templates')) return route.fulfill({ json: [schema] })
    return route.fulfill({ json: [] })
  })
  return { assigned: () => assigned }
}

test('redirects to login, signs in, and clears the session on logout', async ({
  page,
}) => {
  await mockSession(page, 'user', false)
  await page.goto('/schemas/repair')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Username', { exact: true }).fill('reader')
  await page
    .getByLabel('Password', { exact: true })
    .fill('test-reader-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page).toHaveURL(/\/schemas\/repair$/)
  await expect(page.getByRole('button', { name: /New schema/i })).toHaveCount(0)
  await expect(
    page.getByRole('link', { name: 'Users and schema access' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: /Sign out/ }).click()
  await expect(page).toHaveURL(/\/login$/)
  expect(
    await page.evaluate(() => localStorage.getItem('formfoundry_access_token')),
  ).toBeNull()
})

test('admin grants and revokes schema access and disables an account', async ({
  page,
}) => {
  const state = await mockSession(page, 'admin')
  await page.goto('/admin/users')
  await expect(
    page.getByRole('heading', { name: 'Users and schema access' }),
  ).toBeVisible()
  const section = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'reader', exact: true }) })
  await section.getByRole('checkbox', { name: 'Repair intake' }).check()
  await section.getByRole('button', { name: 'Save access' }).click()
  await expect(section.getByRole('status')).toContainText('Schema access saved')
  expect(state.assigned()).toEqual(['repair'])
  await section.getByRole('checkbox', { name: 'Repair intake' }).uncheck()
  await section.getByRole('button', { name: 'Save access' }).click()
  await expect(section.getByRole('status')).toContainText('Schema access saved')
  expect(state.assigned()).toEqual([])
  await section.getByRole('button', { name: 'Disable account' }).click()
  await expect(
    section.getByRole('button', { name: 'Enable account' }),
  ).toBeVisible()
})

test('regular users cannot open the admin screen', async ({ page }) => {
  await mockSession(page, 'user')
  await page.goto('/admin/users')
  await expect(page).toHaveURL(/\/$/)
  await expect(
    page.getByRole('heading', { name: 'Users and schema access' }),
  ).toHaveCount(0)
})

test('an expired session returns to login', async ({ page }) => {
  await mockSession(page, 'user')
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Expired' } }),
  )
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  expect(
    await page.evaluate(() => localStorage.getItem('formfoundry_access_token')),
  ).toBeNull()
})

test('login failures stay on the login screen', async ({ page }) => {
  await mockSession(page, 'user', false)
  await page.route('**/api/v1/auth/token', (route) =>
    route.fulfill({ status: 401, json: { detail: 'Invalid credentials' } }),
  )
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill('reader')
  await page.getByLabel('Password', { exact: true }).fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not sign in')
})

test('switches login language before sign in and preserves it after reload', async ({
  page,
}) => {
  await mockSession(page, 'user', false)
  await page.goto('/login')
  await page.getByLabel('Username', { exact: true }).fill('reader')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('menuitem', { name: 'हिन्दी', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'साइन इन करें', exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('उपयोगकर्ता नाम', { exact: true })).toHaveValue(
    'reader',
  )
  expect(await page.evaluate(() => localStorage.getItem('i18nextLng'))).toBe(
    'hi',
  )
  await page.reload()
  await expect(
    page.getByRole('heading', { name: 'साइन इन करें', exact: true }),
  ).toBeVisible()
  await page.screenshot({ path: '/tmp/formfoundry-login-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('button', { name: 'हिन्दी', exact: true }),
  ).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy()
  await page.screenshot({ path: '/tmp/formfoundry-login-mobile.png' })
  await page.getByRole('button', { name: 'हिन्दी', exact: true }).click()
  await page.getByRole('menuitem', { name: 'English', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible()
})

test('switches language on the admin access screen', async ({ page }) => {
  await mockSession(page, 'admin')
  await page.goto('/admin/users')
  await page.getByRole('button', { name: 'English', exact: true }).click()
  await page.getByRole('menuitem', { name: 'हिन्दी', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'उपयोगकर्ता और स्कीमा की पहुँच' }),
  ).toBeVisible()
})
