import { expect, test } from '@playwright/test'

for (const detailed of [false, true]) {
  test(`document question accepts only inline files in ${detailed ? 'detailed' : 'chat'} view`, async ({ page }) => {
    let uploads = 0
    let multipart = ''
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = {
      kind: 'document_upload', priority: 0, field_path: 'aadhaar.full_name',
      field_paths: ['aadhaar.full_name', 'pan.full_name'], field_labels: [],
      documents: [{ country: 'IN', document_type: 'aadhaar' }, { country: 'IN', document_type: 'pan' }],
      question: 'Please upload your Aadhaar and PAN.', reason: 'Upload documents first.',
    }
    const fieldQuestion = { kind: 'field', documents: [], field_path: 'phone', field_paths: ['phone'], field_labels: ['Phone'], priority: 1, question: 'What is your phone number?', reason: 'Missing field.' }
    const active = () => uploads === 0 ? first : uploads === 1 ? { ...first, field_path: 'pan.full_name', field_paths: ['pan.full_name'], documents: [first.documents[1]], question: 'Please upload your PAN.' } : fieldQuestion
    const turns = () => [{
      turn_id: `question-${uploads}`, role: 'assistant', message: active().question,
      metadata: { field_paths: active().field_paths, question_payload: active() },
      created_at: '2026-11-06T10:00:00Z',
    }]
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en')
      localStorage.setItem('formfoundry_access_token', 'test-token')
    })
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
      if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false })
      if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
      if (path.endsWith('/conversation/next-question')) return json(active())
      if (path.endsWith('/conversation/turns')) return json(turns())
      if (path.endsWith('/evidence/upload')) {
        multipart = route.request().postData() ?? ''
        if (multipart.includes('bad.pdf')) return json({ detail: 'Document could not be read. Please upload again.' }, 422)
        if (uploads === 0) await gate
        uploads += 1
        return json({ evidence: {}, job: { status: 'completed' } }, 201)
      }
      if (path.endsWith('/cases/upload-question')) return json({
        case_id: 'upload-question', status: 'awaiting_user', metadata: {}, current_schema_state: {},
        template: { template_id: 'test', name: 'Document intake', schema: [{ path: 'phone', label: 'Phone', type: 'string', required: true }], field_groups: [], supported_artifacts: [] },
        field_states: [{ field_path: 'phone', status: 'missing', confidence: 0 }],
      })
      return json([])
    })
    await page.goto('/cases/upload-question')
    if (detailed) await page.getByRole('button', { name: 'Detailed' }).click()
    const uploader = page.getByTestId('document-upload-question')
    await expect(uploader).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(uploader.getByLabel('Upload Aadhaar')).toBeVisible()
    await expect(uploader.getByLabel('Upload PAN')).toBeVisible()
    await uploader.getByLabel('Upload Aadhaar').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('invalid fixture') })
    await expect(uploader.getByRole('alert')).toContainText('Please upload again')
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(uploader.getByLabel('Upload Aadhaar')).toBeEnabled()
    await uploader.getByLabel('Upload Aadhaar').setInputFiles({ name: 'aadhaar.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic fixture') })
    await expect(uploader.getByLabel('Upload PAN')).toBeDisabled()
    await expect(uploader.getByRole('status')).toBeVisible()
    release()
    await expect(uploader.getByLabel('Upload Aadhaar')).toHaveCount(0)
    expect(multipart).toContain('name="document_type"')
    expect(multipart).toContain('aadhaar')
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await uploader.getByLabel('Upload PAN').setInputFiles({ name: 'pan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic fixture') })
    await expect(uploader).toHaveCount(0)
    await expect(page.getByRole('textbox')).toBeVisible()
    expect(multipart).toContain('pan')
  })
}
