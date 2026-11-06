import { test, expect, type Page } from '@playwright/test'

const caseId = '12345678-title-test'
const template = {
  template_id: 'repair', template_version: 1, name: 'Repair intake', domain: 'custom', description: 'Repair requests',
  schema: [
    { path: 'topic', label: 'Topic', type: 'string', required: true, default_question: 'What needs repair?', clarification_question: 'Please describe it.' },
    { path: 'location', label: 'Location', type: 'string', required: true, default_question: 'Where?', clarification_question: 'Please provide a location.' },
  ],
  field_groups: [], supported_artifacts: [], conversation_config: { tone: 'professional' },
}

async function mockCases(page: Page, failRename = false) {
  let detail = {
    case_id: caseId, template_id: template.template_id, template_version: 1, status: 'collecting_input', created_by: 'test',
    metadata: {} as Record<string, string>, review_status: 'not_ready', current_schema_state: { topic: 'Leaking tap' },
    created_at: '2026-11-06T05:00:00Z', updated_at: '2026-11-06T05:00:00Z',
    completion_pct: 50, fields_total: 2, fields_collected: 1, fields_confirmed: 0, fields_waived: 0,
    template, field_states: [{ field_path: 'topic', status: 'proposed', resolved_value: 'Leaking tap', confidence: 1 }],
  }
  let savedTemplate: any = null
  await page.addInitScript(() => { localStorage.setItem('i18nextLng', 'en'); localStorage.setItem('formfoundry_access_token', 'test-token') })
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ json: body, status })
    if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false, expires_at: null })
    if (path.endsWith('/title')) {
      if (failRename) return json({ detail: 'Unavailable' }, 503)
      detail = { ...detail, metadata: { title: route.request().postDataJSON().title, title_source: 'manual' } }
      return json(detail)
    }
    if (path.endsWith('/templates')) {
      if (route.request().method() === 'POST') {
        savedTemplate = route.request().postDataJSON()
        return json(savedTemplate, 201)
      }
      return json([template])
    }
    if (path.endsWith('/cases')) return json([detail])
    if (path.endsWith(`/cases/${caseId}`)) return json(detail)
    if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
    if (path.endsWith('/conversation/next-question')) return json(null)
    return json([])
  })
  return { savedTemplate: () => savedTemplate }
}

test('renames a case and shows its saved title after navigation and reload', async ({ page }) => {
  await mockCases(page)
  await page.goto(`/cases/${caseId}`)
  await page.getByRole('button', { name: 'Rename case' }).click()
  await page.getByRole('textbox', { name: 'Case title', exact: true }).fill('Kitchen tap repair')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('header')).toContainText('Kitchen tap repair')
  await page.screenshot({ path: '/tmp/formfiller-title.png' })
  await page.reload()
  await expect(page.locator('header')).toContainText('Kitchen tap repair')
  await page.getByRole('button', { name: 'Back to intake hub' }).click()
  await expect(page.locator(`a[href="/cases/${caseId}"]`)).toContainText('Kitchen tap repair')
})

test('preserves an unsaved title on failure and supports cancellation', async ({ page }) => {
  await mockCases(page, true)
  await page.goto(`/cases/${caseId}`)
  await page.getByRole('button', { name: 'Rename case' }).click()
  const input = page.getByRole('textbox', { name: 'Case title', exact: true })
  await input.fill('Try this title')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not save')
  await expect(input).toHaveValue('Try this title')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('header')).toContainText('Case #12345678')
})

test('keeps the title pattern when editing other conversation settings', async ({ page }) => {
  const mock = await mockCases(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'New Schema', exact: true }).click()
  await page.getByLabel('Case title pattern (optional)').fill('{subject.full_name}')
  await page.getByRole('button', { name: /AI/ }).click()
  // The tone input belongs to the existing builder; changing it must retain the pattern.
  await page.getByPlaceholder('e.g. empathetic, supportive, yet professional and direct').fill('friendly')
  await page.getByRole('button', { name: /Save/ }).click()
  await expect.poll(() => mock.savedTemplate()).not.toBeNull()
  expect(mock.savedTemplate().conversation_config.title_pattern).toBe('{subject.full_name}')
})

test('keeps long titles and rename controls inside a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockCases(page)
  await page.goto(`/cases/${caseId}`)
  await page.getByRole('button', { name: 'Rename case' }).click()
  await page.getByRole('textbox', { name: 'Case title', exact: true }).fill('A'.repeat(160))
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Rename case' })).toBeInViewport()
  await expect(page.locator('header').getByText(/^(Collecting Input|In progress)$/)).toBeInViewport({ ratio: 1 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: '/tmp/formfiller-title-mobile.png' })
})
