import { test, expect, type Page } from '@playwright/test'

const question = {
  field_path: 'name', field_paths: ['name'], field_labels: ['Name'],
  question: 'What is your name?', reason: 'Required field is missing.', priority: 1,
}
const initialTurn = {
  turn_id: 'initial', case_id: 'composer-test', role: 'assistant',
  message: question.question, related_field_path: 'name',
  metadata: { field_paths: ['name'], field_labels: ['Name'] }, created_at: '2026-11-05T10:00:00Z',
}

async function mockWorkspace(page: Page, fail = false) {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  let turns = [initialTurn]
  let submissions = 0
  await page.addInitScript(() => { localStorage.setItem('i18nextLng', 'en'); localStorage.setItem('formfoundry_access_token', 'test-token') })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false, expires_at: null })
    if (path.endsWith('/languages/detect')) return json({ language: 'en' })
    if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
    if (path.endsWith('/conversation/turns')) {
      if (route.request().method() === 'POST') {
        submissions += 1
        const message = route.request().postDataJSON().message
        await gate
        if (fail) return json({ detail: 'Service unavailable' }, 503)
        const userTurn = { ...initialTurn, turn_id: 'answer', role: 'user', message, created_at: new Date().toISOString() }
        const assistantTurn = { ...initialTurn, turn_id: 'followup', message: 'Thanks. What is your phone number?', created_at: new Date(Date.now() + 1).toISOString() }
        turns = [...turns, userTurn, assistantTurn]
        return json({ user_turn: userTurn, assistant_turn: assistantTurn, next_question: { ...question, question: assistantTurn.message } })
      }
      return json(turns)
    }
    if (path.endsWith('/conversation/next-question')) return json(question)
    if (path.endsWith('/cases/composer-test')) return json({
      case_id: 'composer-test', status: 'awaiting_user', metadata: {}, current_schema_state: {},
      template: {
        template_id: 'test', name: 'Test form', schema: [{ path: 'name', label: 'Name', type: 'string', required: true }],
        field_groups: [], supported_artifacts: [],
      },
      field_states: [{ field_path: 'name', status: 'missing', confidence: 0 }],
    })
    return json([])
  })
  await page.goto('/cases/composer-test')
  await expect(page.getByText(question.question, { exact: true })).toBeVisible()
  return { release, submissions: () => submissions }
}

test('shows a submitted bubble immediately and reconciles without duplicates', async ({ page }) => {
  const mock = await mockWorkspace(page)
  const input = page.getByRole('textbox', { name: /Reply to the question/ })
  const composer = input.locator('..')
  expect((await composer.boundingBox())!.height).toBeLessThan(80)
  await input.fill('Hari')
  await input.press('Enter')
  await expect(page.getByText('Hari', { exact: true })).toBeVisible()
  await expect(input).toHaveValue('')
  await expect(page.getByRole('status')).toContainText('Generating a response')
  await expect(page.getByRole('button', { name: 'Send message' })).toBeDisabled()
  await page.screenshot({ path: '/tmp/form-filler-compact-composer.png', fullPage: true })
  mock.release()
  await expect(page.getByText('Thanks. What is your phone number?', { exact: true })).toBeVisible()
  await expect(page.getByText('Hari', { exact: true })).toHaveCount(1)
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(mock.submissions()).toBe(1)
})

test('restores a failed message so it can be retried', async ({ page }) => {
  const mock = await mockWorkspace(page, true)
  const input = page.getByRole('textbox', { name: /Reply to the question/ })
  await input.fill('Please keep my answer')
  await page.getByRole('button', { name: 'Send message' }).click()
  await expect(page.getByText('Please keep my answer', { exact: true })).toBeVisible()
  mock.release()
  await expect(input).toHaveValue('Please keep my answer')
  await expect(page.getByRole('alert')).toContainText('Your draft has been restored')
  await expect(page.locator('p').filter({ hasText: /^Please keep my answer$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled()
  await expect(page.getByRole('status')).toHaveCount(0)
  expect(mock.submissions()).toBe(1)
})

test('supports multiline replies in the compact composer', async ({ page }) => {
  await mockWorkspace(page)
  const input = page.getByRole('textbox', { name: /Reply to the question/ })
  const initialHeight = (await input.boundingBox())!.height
  await input.fill('First line')
  await input.press('Shift+Enter')
  await input.pressSequentially('Second line')
  await expect(input).toHaveValue('First line\nSecond line')
  expect((await input.boundingBox())!.height).toBeGreaterThan(initialHeight)
})
