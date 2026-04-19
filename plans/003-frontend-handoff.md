# FormFoundry Frontend Handoff

## Purpose

This document is the frontend handoff for the MVP backend. It explains what exists, what the frontend should build next, and which backend contracts are stable enough to rely on.

## Backend Scope Completed

The backend currently supports the full planned MVP workflow:

1. list templates
2. create a case
3. ingest notes and uploads as evidence
4. extract field candidates
5. resolve draft field state
6. ask next-best follow-up questions
7. review, edit, confirm, and approve
8. generate and download a PDF artifact

## Important Implementation Reality

There is not a real external LLM integration yet.

Current state:

- extraction is heuristic and implemented in [backend/app/extraction/service.py](/Users/hari/Desktop/sandbox/generic-form-filler/backend/app/extraction/service.py)
- conversation orchestration is real, but the answer-to-update pipeline still relies on the same heuristic extraction path
- architecture is already split so a real model client can be swapped into extraction and conversation later without major frontend contract changes

Frontend should treat the assistant as workflow guidance, not as an open-ended chat product.

## Product Model

Primary concepts:

- `TemplateDefinition`
- `CaseFile`
- `Evidence`
- `FieldCandidate`
- `FieldState`
- `ValidationIssue`
- `Artifact`

The UI should always help the user answer four questions:

- what data is required
- what the system inferred
- what is missing or conflicted
- what action should happen next

## API Base

Use `VITE_API_BASE_URL`.

Local backend storage now defaults to `.storage/`, not `storage/`.

That is intentional so repo-tracked infrastructure directories are not hidden by local artifact output.

## Routes To Build

Recommended frontend routes:

- `/`
  Template selection and case creation
- `/cases/:caseId`
  Main case workspace

Recommended workspace layout:

- case header
- evidence intake
- jobs/progress
- conversation
- schema review
- validation issues
- artifact actions

## Suggested UI Areas

### 1. Template Selection

Use:

- `GET /api/v1/templates`
- `POST /api/v1/cases`

Show:

- template name
- description
- domain
- supported artifacts

### 2. Case Workspace

Initial data to fetch in parallel:

- `GET /api/v1/cases/{case_id}`
- `GET /api/v1/cases/{case_id}/schema-state`
- `GET /api/v1/cases/{case_id}/evidence`
- `GET /api/v1/cases/{case_id}/jobs`
- `GET /api/v1/cases/{case_id}/validation`
- `GET /api/v1/cases/{case_id}/artifacts`
- `GET /api/v1/cases/{case_id}/conversation/next-question`

### 3. Evidence Intake

Use:

- `POST /api/v1/cases/{case_id}/evidence/text`
- `POST /api/v1/cases/{case_id}/evidence/upload`

After submit, refresh:

- evidence
- jobs
- schema state
- validation
- next question
- candidates when useful

### 4. Conversation

Use:

- `GET /api/v1/cases/{case_id}/conversation/next-question`
- `POST /api/v1/cases/{case_id}/conversation/turns`
- `GET /api/v1/cases/{case_id}/conversation/stream`

Current SSE behavior is simple:

- one `question` event payload

### 5. Review

Use:

- `GET /api/v1/cases/{case_id}/review`
- `POST /api/v1/cases/{case_id}/fields/{field_path}/edit`
- `POST /api/v1/cases/{case_id}/fields/{field_path}/confirm`

Review UI should be grouped by template `field_groups`.

Each field row/card should surface:

- label
- value
- field status
- confidence
- evidence linkage when available
- validation issues affecting the field

### 6. Approval

Use:

- `GET /api/v1/cases/{case_id}/validation`
- `POST /api/v1/cases/{case_id}/approve`

Approve must stay disabled while blocking issues exist.

### 7. Artifacts

Use:

- `POST /api/v1/cases/{case_id}/artifacts`
- `GET /api/v1/cases/{case_id}/artifacts`
- `GET /api/v1/cases/{case_id}/artifacts/{artifact_id}/download`

Only show the generate action after approval.

## Stable Backend Enums

Case status:

- `draft`
- `collecting_input`
- `extracting`
- `resolving`
- `awaiting_user`
- `ready_for_review`
- `approved`
- `artifact_generating`
- `completed`
- `failed`

Field status:

- `missing`
- `proposed`
- `confirmed`
- `conflicted`
- `invalid`
- `waived`

Job status:

- `queued`
- `running`
- `completed`
- `failed`

Frontend should render unknown future values safely.

## Recommended Data-Fetch Strategy

Suggested query keys:

- `templates`
- `case`
- `schema-state`
- `evidence`
- `jobs`
- `candidates`
- `validation`
- `review`
- `artifacts`
- `next-question`

Suggested invalidation after:

- evidence text submit:
  invalidate `evidence`, `jobs`, `schema-state`, `validation`, `review`, `next-question`, `candidates`, `case`
- upload submit:
  same as above
- conversation turn:
  same as above
- field edit:
  invalidate `case`, `schema-state`, `validation`, `review`
- field confirm:
  invalidate `case`, `schema-state`, `validation`, `review`
- approve:
  invalidate `case`, `validation`, `review`, `artifacts`
- generate artifact:
  invalidate `artifacts`, `case`

## Review UX Guidance

This product should not feel like a generic chatbot.

Prioritize:

- a serious workflow tone
- dense but readable field review
- strong visual distinction between `missing`, `proposed`, `confirmed`, and `conflicted`
- clear evidence and confidence cues

Avoid:

- burying important state in tabs
- over-centering the chat panel
- making approval feel like a casual action

## Recommended Frontend Build Order

1. typed API client
2. template selection page
3. case workspace shell
4. evidence intake panel
5. schema review grouped by field groups
6. validation issue panel
7. conversation panel
8. approve flow
9. artifact generation/download panel
10. SSE enhancement

## Known Backend Follow-Ups

These are not blockers for frontend implementation:

- real LLM provider integration is still missing
- jobs run inline right now when `AUTO_RUN_JOBS=true`
- authentication and multi-user access control are not implemented
- artifact renderer now reads template metadata, but template-level renderer config will likely expand over time

## Definition Of Done For Frontend MVP

Frontend MVP is done when a user can:

1. create a case
2. provide evidence
3. see draft state update
4. answer follow-up questions
5. review and correct values
6. clear blocking issues
7. approve the case
8. generate and download the PDF
