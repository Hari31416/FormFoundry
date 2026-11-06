import { test, expect } from '@playwright/test'

test('shows captured progress before answers are confirmed', async ({ page }) => {
  const caseId = '12345678-progress-test'
  const template = {
    template_id: 'repair', template_version: 1, name: 'Repair intake', domain: 'custom',
    schema: [], field_groups: [], supported_artifacts: [],
  }
  const caseFile = {
    case_id: caseId, template_id: 'repair', template_version: 1, status: 'collecting_input',
    metadata: {}, current_schema_state: {}, review_status: 'not_ready',
    created_at: '2026-11-06T05:00:00Z', updated_at: '2026-11-06T05:00:00Z',
    completion_pct: 50, fields_total: 2, fields_collected: 1, fields_confirmed: 0, fields_waived: 0,
  }
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'))
  await page.route('**/api/v1/**', route => route.fulfill({
    json: new URL(route.request().url()).pathname.endsWith('/templates') ? [template] : [caseFile],
  }))
  await page.goto('/')
  const row = page.locator(`a[href="/cases/${caseId}"]`)
  await expect(row).toContainText('1/2 fields addressed · 50%')
  await expect(row).toContainText('In progress')
  await expect(row).not.toContainText('Not started')
  await expect(row.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50')
})
