import { expect, test } from '@playwright/test'

for (const mismatch of [false, true]) {
  test(`uploads a declared document and shows ${mismatch ? 'a mismatch' : 'extracted fields'} in both views`, async ({ page }) => {
    let uploaded = false
    let multipart = ''
    const analysis = {
      schema_version: 1, analysis_id: 'analysis', analyzed_at: '2026-11-06T10:00:00Z',
      declared: { country: 'IN', document_type: mismatch ? 'aadhaar' : 'pan' },
      detected: { country: 'IN', document_type: 'pan' },
      status: mismatch ? 'mismatch' : 'matched', authenticity_checked: false, stages: [],
      fields: { full_name: { value: 'Priya Sharma', source_quote: 'Priya Sharma', confidence: 0.95 } },
      checks: mismatch ? [{ code: 'document_type', scope: 'classification', outcome: 'fail', field: null }] : [],
    }
    const evidence = {
      evidence_id: 'evidence', case_id: 'document-test', source_type: 'image_upload',
      source_subtype: 'identity.png', storage_uri: 'local://identity.png', parsed_payload: {},
      document_analysis: analysis, metadata: {}, source_refs: [], created_by: 'test', created_at: '2026-11-06T10:00:00Z',
    }
    const question = { field_path: 'name', field_paths: ['name'], field_labels: ['Name'], question: 'What is your name?', reason: 'Required field is missing.', priority: 1 }
    const turn = { turn_id: 'question', case_id: 'document-test', role: 'assistant', message: question.question, metadata: {}, created_at: '2026-11-06T09:00:00Z' }
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en')
      localStorage.setItem('formfoundry_access_token', 'test-token')
    })
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
      if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false })
      if (path.endsWith('/documents/types')) return json(['aadhaar', 'pan', 'driving_licence'].map((document_type) => ({ country: 'IN', document_type, fields: [], required_fields: [], version: '1' })))
      if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
      if (path.endsWith('/evidence/upload')) {
        multipart = route.request().postData() ?? ''
        uploaded = true
        return json({ evidence, job: { status: 'completed' } }, 201)
      }
      if (path.endsWith('/evidence')) return json(uploaded ? [evidence] : [])
      if (path.endsWith('/conversation/turns')) return json(uploaded ? [turn, { ...turn, turn_id: 'upload', role: 'user', message: 'Uploaded file: identity.png', metadata: { evidence_id: 'evidence', kind: 'upload' }, created_at: '2026-11-06T10:00:00Z' }] : [turn])
      if (path.endsWith('/conversation/next-question')) return json(question)
      if (path.endsWith('/cases/document-test')) return json({
        case_id: 'document-test', status: 'awaiting_user', metadata: {}, current_schema_state: {},
        template: { template_id: 'test', name: 'Test form', schema: [{ path: 'name', label: 'Name', type: 'string', required: true }], field_groups: [], supported_artifacts: [] },
        field_states: [{ field_path: 'name', status: 'missing', confidence: 0 }],
      })
      return json([])
    })
    await page.goto('/cases/document-test')
    await page.getByRole('combobox', { name: 'Document type' }).selectOption(mismatch ? 'aadhaar' : 'pan')
    await page.locator('#simplified-chat-file-upload').setInputFiles({ name: 'identity.png', mimeType: 'image/png', buffer: Buffer.from('synthetic fixture') })
    const summary = page.getByTestId('document-analysis')
    await expect(summary).toContainText(mismatch ? 'Document type mismatch' : 'Type matches')
    await expect(summary).toContainText('Authenticity has not been checked')
    await summary.getByText('Extracted information').click()
    await expect(summary).toContainText('Priya Sharma')
    expect(multipart).toContain('name="document_type"')
    expect(multipart).toContain(mismatch ? 'aadhaar' : 'pan')
    expect(multipart).toContain('name="document_country"')
    if (mismatch) await expect(summary).toContainText('You selected Aadhaar')
    await page.getByRole('button', { name: 'Detailed' }).click()
    await page.getByRole('tab', { name: 'Raw Evidence' }).click()
    await expect(page.getByTestId('document-analysis')).toContainText(mismatch ? 'Document type mismatch' : 'Type matches')
  })
}
