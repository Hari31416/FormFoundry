import type { ConversationTurn, DocumentKind, Evidence } from './api'

/** Project legacy upload receipts and repeated upload prompts into one chat card. */
export function groupDocumentUploadTurns(turns: ConversationTurn[]): ConversationTurn[] {
  const result: ConversationTurn[] = []
  let batch: ConversationTurn | undefined
  for (const turn of turns) {
    const uploadQuestion = turn.role === 'assistant' && turn.metadata?.question_payload?.kind === 'document_upload'
    if (uploadQuestion) {
      if (!batch) {
        batch = { ...turn, metadata: { ...turn.metadata, upload_question_ids: [turn.turn_id], upload_evidence_ids: [] } }
        result.push(batch)
      } else {
        const documents: DocumentKind[] = batch.metadata.question_payload.documents ?? []
        const additional: DocumentKind[] = turn.metadata.question_payload.documents ?? []
        batch.metadata = {
          ...batch.metadata, ...turn.metadata,
          upload_question_ids: [...batch.metadata.upload_question_ids, turn.turn_id],
          upload_evidence_ids: batch.metadata.upload_evidence_ids,
          question_payload: {
            ...turn.metadata.question_payload,
            documents: [...documents, ...additional.filter((item) => !documents.some((existing) => existing.country === item.country && existing.document_type === item.document_type))],
          },
        }
      }
      continue
    }
    if (batch && turn.role === 'user' && turn.metadata?.kind === 'upload') {
      batch.metadata.upload_evidence_ids.push(turn.metadata.evidence_id)
      continue
    }
    batch = undefined
    result.push(turn)
  }
  return result
}

export function getQuestionEvidence(evidence: Evidence[] | undefined, questionIds: string[], evidenceIds: string[] = []): Evidence[] {
  return (evidence ?? []).filter((item) => questionIds.includes(item.metadata?.upload_question_turn_id) || evidenceIds.includes(item.evidence_id))
}
