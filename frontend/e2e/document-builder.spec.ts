import { expect, test, type Page } from '@playwright/test'
import { buildDocumentNode, documentPathsConflict } from '../src/lib/documentNodes'
import { apiErrorMessage } from '../src/lib/apiErrors'
import type { DocumentDefinition } from '../src/lib/api'

const pan: DocumentDefinition = { country: 'IN', document_type: 'pan', version: '1', type_indicators: ['income tax'], fields: ['document_number', 'full_name', 'date_of_birth', 'father_name'], required_fields: ['document_number', 'full_name'] }

async function builder(page: Page, failSave = false) {
  let saved: any
  await page.addInitScript(() => {
    localStorage.setItem('i18nextLng', 'en')
    localStorage.setItem('formfoundry_access_token', 'test-token')
  })
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    if (path.endsWith('/auth/me')) return json({ id: 'test', username: 'admin', role: 'admin', disabled: false })
    if (path.endsWith('/languages/config')) return json({ is_tts_enabled: false })
    if (path.endsWith('/documents/types')) return json([pan])
    if (path.endsWith('/templates') && route.request().method() === 'POST') {
      saved = route.request().postDataJSON()
      if (failSave) return json({ detail: [{ type: 'value_error', loc: ['body'], msg: 'Value error, Title placeholders must use schema field paths without formatting', input: saved }] }, 422)
      return json(saved, 201)
    }
    if (path.endsWith('/templates')) return json(saved ? [saved] : [])
    return json([])
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'New Schema', exact: true }).click()
  await page.getByRole('button', { name: '2. Form Fields Schema', exact: true }).click()
  await page.getByRole('button', { name: 'Add Field Node', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Document source', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('document-node-editor')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Field Data Type', exact: true }).selectOption('document')
  await page.getByTestId('document-node-editor').getByRole('combobox', { name: 'Document type' }).selectOption('IN/pan')
  return { saved: () => saved }
}

test('saves one document upload field with multiple named extraction keys', async ({ page }) => {
  const mock = await builder(page)
  await expect(page.getByRole('textbox', { name: 'JSON Path', exact: true })).toHaveValue('pan')
  const editor = page.getByTestId('document-node-editor')
  await editor.getByRole('textbox', { name: 'Dictionary key for Full name', exact: true }).fill('legal_name')
  await editor.getByRole('textbox', { name: 'Dictionary key for Date of birth', exact: true }).fill('birth_date')
  await editor.getByRole('checkbox', { name: "Father's name", exact: true }).uncheck()
  await editor.getByRole('checkbox', { name: 'Document number', exact: true }).uncheck()
  await page.screenshot({ path: '/tmp/document-node-builder.png', fullPage: true })
  await page.getByRole('button', { name: 'Save Document Field', exact: true }).click()
  await expect(page.getByText('PAN · 2 extraction mappings', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Edit PAN', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: 'Dictionary key for Full name', exact: true })).toHaveValue('legal_name')
  await expect(editor.getByRole('textbox', { name: 'Dictionary key for Date of birth', exact: true })).toHaveValue('birth_date')
  await page.getByRole('button', { name: 'Save Document Field', exact: true }).click()
  await page.getByRole('button', { name: '1. Metadata & Output', exact: true }).click()
  await expect(page.getByText(/Available title fields:/)).toContainText('{pan.legal_name}')
  await page.getByRole('textbox', { name: 'Case title pattern (optional)', exact: true }).fill('Intake - {pan.legal_name}')
  await page.getByRole('button', { name: 'Save Template Configuration', exact: true }).click()
  await expect.poll(() => mock.saved()).toBeTruthy()
  const saved = mock.saved()
  expect(saved.schema).toHaveLength(2)
  const node = saved.schema.find((field: any) => field.path === 'pan')
  expect(node.type).toBe('document')
  expect(node.required).toBe(true)
  expect(node.document).toEqual({ country: 'IN', document_type: 'pan', extractions: [{ field: 'full_name', key: 'legal_name' }, { field: 'date_of_birth', key: 'birth_date' }] })
  expect(saved.field_groups.some((group: any) => group.field_paths.includes('pan'))).toBe(true)
})

test('validates dictionary keys and prevents overlapping field paths', async ({ page }) => {
  await builder(page)
  const editor = page.getByTestId('document-node-editor')
  await editor.getByRole('textbox', { name: 'Dictionary key for Full name', exact: true }).fill('document_number')
  await page.getByRole('button', { name: 'Save Document Field', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('unique dictionary key')
  await editor.getByRole('textbox', { name: 'Dictionary key for Full name', exact: true }).fill('legal.name')
  await page.getByRole('button', { name: 'Save Document Field', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('only letters, digits, or underscores')
  await editor.getByRole('textbox', { name: 'Dictionary key for Full name', exact: true }).fill('name')
  await page.getByRole('textbox', { name: 'JSON Path', exact: true }).fill('subject')
  await page.getByRole('button', { name: 'Save Document Field', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('overlap existing fields')
})

test('constructs a file field without expanding it into scalar nodes', () => {
  const base = { path: 'proof', label: 'PAN proof', type: 'string' as const, required: true, repeated: false, enum_options: [], default_question: 'Upload', clarification_question: 'Upload', help_text: '' }
  const node = buildDocumentNode(pan, [{ field: 'full_name', key: 'name' }, { field: 'date_of_birth', key: 'dob' }], base)
  expect(node.path).toBe('proof')
  expect(node.type).toBe('document')
  expect(node.document?.extractions).toHaveLength(2)
  expect(documentPathsConflict([node], [{ ...base, path: 'proof.name' }])).toBe(true)
  expect(buildDocumentNode(pan, [], base).document?.extractions).toEqual([])
})


test('shows the actual validation message when saving returns 422', async ({ page }) => {
  await builder(page, true)
  await page.getByRole('button', { name: 'Save Document Field', exact: true }).click()
  let message = ''
  page.once('dialog', async (dialog) => { message = dialog.message(); await dialog.accept() })
  await page.getByRole('button', { name: 'Save Template Configuration', exact: true }).click()
  await expect.poll(() => message).toContain('Title placeholders must use schema field paths')
  expect(message).not.toContain('[object Object]')
})

test('formats FastAPI validation details without including request values', () => {
  const message = apiErrorMessage({ response: { data: { detail: [{ msg: 'Invalid title path', input: { secret: 'do not show' } }] } } }, 'Failed')
  expect(message).toBe('Invalid title path')
})
