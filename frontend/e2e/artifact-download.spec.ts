import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

for (const kind of ['pdf', 'json_export']) {
  test(`downloads ${kind} through the authenticated API with the correct filename`, async ({ page }) => {
    const extension = kind === 'pdf' ? 'pdf' : 'json'
    const payload = kind === 'pdf' ? '%PDF-1.4 synthetic fixture' : '{"sample":true}'
    let authorization = ''
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en')
      localStorage.setItem('formfoundry_access_token', 'test-token')
    })
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown) => route.fulfill({ status: 200, json: body })
      if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false })
      if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
      if (path.endsWith('/conversation/next-question')) return json(null)
      if (path.endsWith('/cases/download-test')) return json({
        case_id: 'download-test', status: 'approved', metadata: {}, current_schema_state: {},
        template: { template_id: 'test', name: 'Document intake', schema: [], field_groups: [], supported_artifacts: [] }, field_states: [],
      })
      if (path.endsWith('/artifacts')) return json([{ artifact_id: 'artifact', artifact_type: kind, status: 'generated' }])
      if (path.endsWith('/artifacts/artifact/download')) {
        authorization = route.request().headers()['authorization']
        return route.fulfill({
          status: 200, body: payload, headers: {
            'content-type': kind === 'pdf' ? 'application/pdf' : 'application/json',
            'content-disposition': `attachment; filename*=UTF-8''case%20summary.${extension}`,
            'access-control-expose-headers': 'Content-Disposition',
          }
        })
      }
      return json([])
    })
    await page.goto('/cases/download-test')
    const downloadEvent = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download', exact: true }).click()
    const download = await downloadEvent
    expect(download.suggestedFilename()).toBe(`case summary.${extension}`)
    expect(await readFile((await download.path())!, 'utf8')).toBe(payload)
    expect(authorization).toBe('Bearer test-token')
  })
}
