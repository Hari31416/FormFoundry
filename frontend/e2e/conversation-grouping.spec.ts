import { expect, test } from '@playwright/test'
import { groupDocumentUploadTurns } from '../src/lib/conversation'
import type { ConversationTurn } from '../src/lib/api'

test('groups legacy upload receipts and repeated prompts under the original request', () => {
  const base: ConversationTurn = { turn_id: 'first', case_id: 'case', role: 'assistant', message: 'Upload Aadhaar and PAN', related_field_path: null, metadata: { question_payload: { kind: 'document_upload', documents: [{ country: 'IN', document_type: 'aadhaar' }, { country: 'IN', document_type: 'pan' }] } }, created_at: '2026-11-06T10:00:00Z' }
  const turns: ConversationTurn[] = [base, { ...base, turn_id: 'file', role: 'user', message: 'Uploaded file: aadhaar.pdf', metadata: { kind: 'upload', evidence_id: 'aadhaar' } }, { ...base, turn_id: 'second', message: 'Upload PAN', metadata: { question_payload: { kind: 'document_upload', documents: [{ country: 'IN', document_type: 'pan' }] } } }, { ...base, turn_id: 'field', message: 'What is your phone?', metadata: { question_payload: { kind: 'field' } } }]
  const grouped = groupDocumentUploadTurns(turns)
  expect(grouped.map((turn) => turn.turn_id)).toEqual(['first', 'field'])
  expect(grouped[0].message).toBe('Upload Aadhaar and PAN')
  expect(grouped[0].metadata.upload_question_ids).toEqual(['first', 'second'])
  expect(grouped[0].metadata.upload_evidence_ids).toEqual(['aadhaar'])
  expect(grouped[0].metadata.question_payload.documents).toHaveLength(2)
  expect(turns[0].metadata.upload_evidence_ids).toBeUndefined()
})
