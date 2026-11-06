import { expect, test } from '@playwright/test'

for (const detailed of [false, true]) {
  test(`document question accepts only inline files in ${detailed ? 'detailed' : 'chat'} view`, async ({ page }) => {
    let uploads = 0
    let attempts = 0
    let multipart = ''
    const uploadedEvidence: any[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const first = {
      kind: 'document_upload', priority: 0, field_path: 'aadhaar.full_name',
      field_paths: ['aadhaar.full_name', 'pan.full_name'], field_labels: [],
      question_turn_id: 'question-0',
      documents: [{ country: 'IN', document_type: 'aadhaar' }, { country: 'IN', document_type: 'pan' }],
      question: 'Please upload your Aadhaar and PAN.', reason: 'Upload documents first.',
    }
    const fieldQuestion = { kind: 'field', documents: [], field_path: 'phone', field_paths: ['phone'], field_labels: ['Phone'], priority: 1, question: 'What is your phone number?', reason: 'Missing field.' }
    const active = () => uploads === 0 ? { ...first, pending_documents: first.documents } : uploads === 1 ? { ...first, field_path: 'pan.full_name', field_paths: ['pan.full_name'], pending_documents: [first.documents[1]] } : fieldQuestion
    const turns = () => [{
      turn_id: 'question-0', role: 'assistant', message: first.question,
      metadata: { field_paths: uploads < 2 ? active().field_paths : first.field_paths, question_payload: { ...(uploads < 2 ? active() : first), pending_documents: uploads < 2 ? (active() as typeof first & { pending_documents: typeof first.documents }).pending_documents : [] }, status: uploads < 2 ? 'active' : 'completed' },
      created_at: '2026-11-06T10:00:00Z',
    }, ...(uploads < 2 ? [] : [{ turn_id: 'field-question', role: 'assistant', message: fieldQuestion.question, metadata: { field_paths: fieldQuestion.field_paths, question_payload: fieldQuestion }, created_at: '2026-11-06T10:01:00Z' }])]
    await page.addInitScript(() => {
      localStorage.setItem('i18nextLng', 'en')
      localStorage.setItem('formfoundry_access_token', 'test-token')
      // Playwright intercepts the request before native upload progress is emitted.
      // Provide controlled transfer events to test the actual Axios progress listener.
      let latestUpload: XMLHttpRequest | undefined
      const originalSend = XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.send = function(body) {
        if (body instanceof FormData) latestUpload = this
        return originalSend.call(this, body)
      }
      Object.assign(window, {
        emitTestUploadProgress: (loaded: number, total: number) => latestUpload?.upload.dispatchEvent(
          new ProgressEvent('progress', { loaded, total, lengthComputable: true }),
        ),
      })
    })
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
      if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false })
      if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
      if (path.endsWith('/evidence')) return json(uploadedEvidence)
      if (path.endsWith('/conversation/next-question')) return json(active())
      if (path.endsWith('/conversation/turns')) return json(turns())
      if (path.endsWith('/evidence/upload')) {
        attempts += 1
        multipart = route.request().postData() ?? ''
        if (multipart.includes('bad.pdf')) return json({ detail: 'Document could not be read. Please upload again.' }, 422)
        if (uploads === 0) await gate
        const kind = uploads === 0 ? 'aadhaar' : 'pan'
        const record = {
          evidence_id: `evidence-${kind}`, case_id: 'upload-question', source_type: 'pdf_upload', source_subtype: `${kind}.pdf`,
          parsed_payload: { filename: `${kind}.pdf` }, metadata: { upload_question_turn_id: 'question-0', declared_document: { country: 'IN', document_type: kind } },
          document_analysis: { schema_version: 1, declared: { country: 'IN', document_type: kind }, detected: { country: 'IN', document_type: kind }, status: 'matched', fields: { full_name: { value: `${kind} holder`, source_quote: `${kind} holder`, confidence: 0.98 } }, checks: [], stages: [], authenticity_checked: false },
        }
        uploadedEvidence.push(record)
        uploads += 1
        return json({ evidence: record, job: { status: 'completed' } }, 201)
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
    await expect(uploader).toContainText('bad.pdf')
    await expect(uploader).toContainText('Processing failed')
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(uploader.getByLabel('Upload Aadhaar')).toBeEnabled()
    await uploader.getByLabel('Upload Aadhaar').setInputFiles({ name: 'aadhaar.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic fixture') })
    await expect(uploader.getByLabel('Upload PAN')).toBeDisabled()
    await expect(uploader).toContainText('aadhaar.pdf')
    await expect.poll(() => attempts).toBe(2)
    const emitProgress = (loaded: number) => page.evaluate((bytes) => {
      (window as Window & { emitTestUploadProgress: (loaded: number, total: number) => void }).emitTestUploadProgress(bytes, 100)
    }, loaded)
    await emitProgress(50)
    await expect(uploader.getByRole('status')).toHaveText('Uploading 50%')
    await expect(uploader.getByRole('progressbar')).toHaveAttribute('value', '50')
    await emitProgress(100)
    await expect(uploader.getByRole('status')).toHaveText('Processing document')
    await page.screenshot({ path: `/tmp/document-progress-${detailed ? 'detailed' : 'chat'}.png`, fullPage: true })
    release()
    await expect(uploader.getByLabel('Upload Aadhaar')).toHaveCount(0)
    await expect(uploader).toContainText('aadhaar.pdf')
    await expect(uploader.getByRole('status')).toHaveText('Processed')
    expect(multipart).toContain('name="document_type"')
    expect(multipart).toContain('aadhaar')
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await uploader.getByLabel('Upload PAN').setInputFiles({ name: 'pan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic fixture') })
    await expect(page.getByRole('textbox')).toBeVisible()
    expect(multipart).toContain('pan')
    if (detailed) await page.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(uploader).toHaveCount(1)
    await expect(uploader).toHaveAttribute('data-state', 'completed')
    await expect(uploader.locator('input')).toHaveCount(0)
    await expect(uploader.getByTestId('document-analysis')).toHaveCount(2)
    await expect(page.getByText(/^Uploaded file:/)).toHaveCount(0)
    await expect(page.getByText(first.question, { exact: true })).toHaveCount(1)
    for (const details of await uploader.locator('details').all()) await details.locator('summary').click()
    await expect(uploader).toContainText('aadhaar holder')
    await expect(uploader).toContainText('pan holder')
    await page.screenshot({ path: `/tmp/document-batch-complete-${detailed ? 'detailed' : 'chat'}.png`, fullPage: true })
    await page.reload()
    await expect(uploader.getByTestId('document-analysis')).toHaveCount(2)
    await expect(page.getByText(fieldQuestion.question, { exact: true })).toBeVisible()
  })
}
