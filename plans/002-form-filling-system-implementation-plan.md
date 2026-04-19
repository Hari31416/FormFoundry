# Form Filling System Implementation Plan

## Purpose

Translate the product plan into an implementation roadmap for a generalized form-filling and artifact-generation platform.

This document assumes:

- the project is greenfield
- the first delivery should prove the architecture with one end-to-end template
- deterministic backend validation is the final gate before artifact generation
- the LLM assists with extraction and questioning, but does not directly own persisted truth
- templates are declarative-only in v1
- conversational follow-up happens in the in-app chat only for v1
- review should expose both confidence and supporting evidence

## Success Criteria

The first production-worthy slice should allow a user to:

1. create a case for a chosen template
2. upload files and add freeform information
3. let the system extract candidate values into a schema draft
4. answer follow-up questions in a conversational UI
5. review, correct, and approve the final structured data
6. generate at least one artifact, initially a PDF

## System Architecture

The platform should be implemented as a small set of clear backend domains plus a focused frontend workflow.

### Backend domains

- `template_registry`
  Stores template definitions, schema metadata, renderer config, and versioning.
- `case_management`
  Owns case files, lifecycle state, field states, approvals, and audit trail.
- `intake`
  Receives uploads and freeform user input, stores evidence, and schedules extraction.
- `extraction`
  Runs OCR, parsing, chunking, and LLM-assisted candidate extraction.
- `resolution`
  Merges candidates into draft field states with provenance and confidence.
- `conversation`
  Selects the next best question and stores user answers as evidence plus field updates.
- `validation`
  Applies deterministic field and cross-field rules.
- `artifacts`
  Renders approved case data into exportable outputs such as PDFs and JSON payloads.

### Shared platform services

- Postgres for durable relational state
- Minio for uploaded assets, OCR outputs, and generated artifacts
- Redis for async jobs, transient orchestration state, and rate limiting
- Qdrant reserved for later retrieval use cases over evidence chunks
- FastAPI as the API layer and SSE provider for streaming progress

## Canonical Data Contracts

These contracts should be defined first in backend Pydantic models and remain stable across services.

### `TemplateDefinition`

Required fields:

- `template_id`
- `template_version`
- `name`
- `domain`
- `description`
- `schema`
- `field_groups`
- `validation_rules`
- `conversation_config`
- `supported_artifacts`
- `renderer_config`

Design notes:

- store templates as versioned JSON documents in Postgres
- support explicit field paths such as `applicant.full_name`
- keep validation and rendering declarative-only in v1; reserve code hooks for later

### `TemplateField`

Required fields:

- `path`
- `label`
- `type`
- `required`
- `repeated`
- `enum_options`
- `default_question`
- `clarification_question`
- `help_text`
- `sensitivity`
- `validation_refs`
- `render_targets`

### `CaseFile`

Required fields:

- `case_id`
- `template_id`
- `template_version`
- `status`
- `created_by`
- `current_schema_state`
- `review_status`
- `approved_at`
- `metadata`

Recommended states:

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

### `Evidence`

Required fields:

- `evidence_id`
- `case_id`
- `source_type`
- `source_subtype`
- `storage_uri`
- `raw_text`
- `parsed_payload`
- `metadata`
- `source_refs`
- `created_by`

Supported MVP source types:

- `user_text`
- `chat_answer`
- `pdf_upload`
- `image_upload`

### `FieldCandidate`

Required fields:

- `candidate_id`
- `case_id`
- `field_path`
- `candidate_value`
- `confidence`
- `source_evidence_ids`
- `source_refs`
- `extractor_type`
- `rationale`
- `created_at`

### `FieldState`

Required fields:

- `field_path`
- `resolved_value`
- `status`
- `confidence`
- `candidate_ids`
- `source_evidence_ids`
- `last_updated_by`
- `last_updated_at`

Recommended statuses:

- `missing`
- `proposed`
- `confirmed`
- `conflicted`
- `invalid`
- `waived`

### `ValidationIssue`

Required fields:

- `issue_id`
- `case_id`
- `field_path`
- `severity`
- `rule_id`
- `message`
- `suggested_fix`
- `blocking`

### `Artifact`

Required fields:

- `artifact_id`
- `case_id`
- `artifact_type`
- `status`
- `storage_uri`
- `renderer_version`
- `metadata`

## Implementation Principles

### 1. Evidence-first writes

Conversation answers, uploads, and pasted text should become evidence records before they influence field state.

### 2. Resolver-owned truth

No extractor or LLM call should directly mutate approved schema values.

### 3. Deterministic validation gate

Validation logic should be explicit and testable. LLM feedback may suggest issues but should not be the approval gate.

### 4. Full provenance

Every resolved field should be traceable to one or more evidence objects and the mechanism that chose it.

### 5. Template-driven behavior

Questioning, rendering, and validation should derive from template metadata, not hardcoded flows.

## Backend Implementation Plan

### Phase 0. Repo and foundation

Deliverables:

- initialize `backend/`, `frontend/`, `wikis/`, `.env.example`, `docker-compose.yml`, and `Makefile`
- configure FastAPI project with settings, health endpoint, and test harness
- configure Postgres, Redis, Minio, and Qdrant in Docker Compose
- add structured logging and request IDs
- define migration strategy

Suggested output:

- runnable local stack
- passing smoke test for backend startup

### Phase 1. Template and case foundations

Deliverables:

- implement `TemplateDefinition`, `TemplateField`, `CaseFile`, `FieldState`, and `Artifact` models
- create template registry CRUD API
- seed one MVP template
- implement case creation API from template selection
- persist empty field states for the selected template

Suggested backend modules:

- `app/templates/models.py`
- `app/templates/service.py`
- `app/cases/models.py`
- `app/cases/service.py`
- `app/api/routes/templates.py`
- `app/api/routes/cases.py`

Exit criteria:

- create a case against one template
- fetch schema and empty state from API

### Phase 2. Intake and evidence ingestion

Deliverables:

- upload API for PDFs and images
- text intake API for user notes and freeform pasted content
- Minio storage integration
- evidence persistence in Postgres
- asynchronous job trigger for extraction

Suggested backend modules:

- `app/intake/models.py`
- `app/intake/service.py`
- `app/storage/minio.py`
- `app/jobs/queue.py`
- `app/api/routes/intake.py`

Exit criteria:

- uploads stored successfully
- evidence records created with metadata and storage URI

### Phase 3. Extraction pipeline

Deliverables:

- OCR adapter for images and scanned PDFs
- parser for digital text PDFs
- chunking pipeline for extracted text
- LLM extraction interface returning `FieldCandidate[]`
- extraction job status tracking

Suggested implementation split:

- `app/extraction/parsers/`
- `app/extraction/ocr/`
- `app/extraction/prompts/`
- `app/extraction/service.py`
- `app/extraction/contracts.py`

Exit criteria:

- a new upload triggers extraction
- resulting candidates are stored with evidence attribution

### Phase 4. Resolution engine

Deliverables:

- candidate merge rules
- conflict detection
- field status assignment
- schema-state snapshot generation
- audit entries for resolver decisions

Resolver rules for MVP:

- pick highest-confidence candidate above threshold when unambiguous
- mark as `conflicted` when multiple candidates disagree materially
- keep `missing` if no candidate passes threshold
- preserve all rejected candidates for review

Exit criteria:

- case schema state updates automatically after extraction
- unresolved and conflicted fields are queryable through API

### Phase 5. Conversation orchestration

Deliverables:

- endpoint for conversation turns
- next-question selection service
- prioritization logic for unresolved fields
- answer-to-evidence pipeline
- SSE progress events for streaming assistant responses

Question selection priority for MVP:

1. blocking required missing fields
2. conflicted fields
3. low-confidence required fields
4. optional fields if needed by selected artifact

Exit criteria:

- the system asks one relevant next question based on current state
- user answers update evidence and trigger re-resolution

### Phase 6. Validation and review

Deliverables:

- field-level validators
- cross-field validators
- blocking vs non-blocking issue classification
- review API returning field states, evidence, and validation issues
- user edit and confirm endpoints

Validation categories:

- type and format
- requiredness
- enum membership
- cross-field consistency
- template-specific business rules

Exit criteria:

- user can inspect and edit resolved values
- approval is blocked until blocking issues are cleared

### Phase 7. Artifact generation

Deliverables:

- artifact generation job API
- first renderer implementation
- artifact persistence and download endpoint
- renderer audit metadata

Recommended MVP renderer:

- true fillable PDF mapping driven by declarative field-to-PDF bindings

Possible phase 7b:

- add a generated summary PDF as a secondary artifact once fillable PDF mapping is stable

Exit criteria:

- approved case generates a downloadable PDF artifact

## Frontend Implementation Plan

### Primary user flows

- choose template and create case
- upload files or add notes
- watch extraction progress
- chat with the system to fill gaps
- review and edit resolved data
- generate and download artifact

### Recommended frontend areas

- `template selection`
- `case workspace shell`
- `evidence panel`
- `chat panel`
- `schema review panel`
- `artifact generation panel`

### Frontend phases

#### Phase A. Application shell

- Vite app setup
- routing
- auth placeholder or local single-user mode
- API client and typed contracts

#### Phase B. Case workspace

- template picker
- case creation flow
- field-state viewer grouped by field groups

#### Phase C. Intake experience

- upload UI
- freeform notes input
- processing progress and status indicators

#### Phase D. Conversational completion

- chat UI
- streamed responses
- suggested explanation for why the system is asking

#### Phase E. Review and artifact generation

- editable schema review table or cards
- validation issue surfacing
- approval action
- generate artifact action

## API Surface Recommendation

Suggested MVP endpoints:

- `POST /templates`
- `GET /templates`
- `GET /templates/{template_id}`
- `POST /cases`
- `GET /cases/{case_id}`
- `GET /cases/{case_id}/schema-state`
- `POST /cases/{case_id}/evidence/text`
- `POST /cases/{case_id}/evidence/upload`
- `GET /cases/{case_id}/evidence`
- `POST /cases/{case_id}/extract`
- `GET /cases/{case_id}/jobs`
- `POST /cases/{case_id}/conversation/turns`
- `GET /cases/{case_id}/conversation/next-question`
- `GET /cases/{case_id}/validation`
- `POST /cases/{case_id}/fields/{field_path}/confirm`
- `POST /cases/{case_id}/fields/{field_path}/edit`
- `POST /cases/{case_id}/approve`
- `POST /cases/{case_id}/artifacts`
- `GET /cases/{case_id}/artifacts`

## Background Jobs

Async jobs should be used for:

- OCR
- PDF parsing
- candidate extraction
- re-resolution after large evidence changes
- artifact generation

Job status model:

- `queued`
- `running`
- `completed`
- `failed`

Every job should store:

- type
- case ID
- triggering event
- error summary
- started and finished timestamps

## Persistence Plan

### Postgres

Store:

- templates and versions
- cases
- field states
- field candidates
- evidence metadata
- conversation turns
- validation issues
- job records
- artifact metadata
- audit logs

### Minio

Store:

- raw uploads
- OCR text outputs
- parsed intermediate payloads when large
- generated artifacts

### Redis

Store:

- worker queue state
- transient orchestration state
- SSE fan-out support if needed

### Qdrant

Defer until phase 2 of the product unless evidence retrieval becomes necessary early.

Use cases later:

- semantic search across uploaded evidence
- retrieval-assisted answer explanation
- similar case pattern assistance

## Testing Strategy

### Backend

- unit tests for template parsing, validation, and resolver logic
- integration tests for case lifecycle and evidence ingestion
- contract tests for extraction result parsing
- artifact smoke tests

### Frontend

- component tests for review and chat flows
- end-to-end tests for one complete case flow
- build and type-check in CI

### Critical test targets

- required field resolution
- conflict detection
- cross-field validation
- re-asking avoidance in conversation flow
- artifact generation from approved data only

## Delivery Milestones

### Milestone 1. Foundation

- local stack boots
- one template can be created and loaded
- one case can be created

### Milestone 2. Intake to draft

- user uploads evidence
- extraction generates candidates
- resolver creates initial draft state

### Milestone 3. Draft to approval

- conversation fills missing data
- validation blocks bad submissions
- review UI supports manual correction

### Milestone 4. Approval to artifact

- approved case generates downloadable PDF
- audit trail shows where important values came from

## Non-Goals For V1

- user-authored dynamic template builder
- multi-tenant access control
- automatic third-party submission
- many artifact types at launch
- complex workflow automation beyond one case lifecycle

## Recommended First Template

Use a real fillable-form-style template with:

- 15 to 40 fields
- a mix of text, enum, date, and address types
- checkbox, radio, and select-style inputs
- nested parent-child field relationships
- conditional sections driven by parent answers
- moderate validation needs
- a directly mappable fillable PDF output

Avoid choosing a template whose first version depends on:

- signatures
- complex tabular line items
- many repeated nested sections
- external API lookups as a hard requirement

Good examples of structure to exercise in the first template:

- applicant details with nested address fields
- employment or dependent sections controlled by yes or no parent answers
- identity fields that must be validated across multiple evidence sources

## Immediate Build Order

Build in this exact order unless a dependency changes:

1. backend scaffold and infrastructure
2. canonical data contracts
3. template registry
4. case creation and schema-state persistence
5. evidence intake and storage
6. extraction job pipeline
7. resolution engine
8. conversation orchestrator
9. validation engine
10. review UI
11. artifact generation

## Open Questions

These should be answered before or during Phase 1:

1. Which specific real-world fillable form should be the first MVP template?
2. What exact PDF field-mapping strategy should we use for the first artifact renderer and library selection?
3. How should declarative conditional logic be expressed in templates for parent-child sections?
4. How should confidence and evidence be displayed in the review UI so users can verify quickly without overload?

## Resolved Product Decisions

- The first template should model a true form-filling workflow, including varied field types and parent-child relationships.
- The first artifact target should be direct fillable PDF mapping, not a summary-first PDF approach.
- Template behavior should remain declarative-only in v1.
- Conversational follow-up questions should live in the in-app chat only for v1.
- The review experience should expose both confidence and supporting evidence.

## Recommended Next Step

Start implementation by defining the canonical backend contracts for:

- `TemplateDefinition`
- `TemplateField`
- `CaseFile`
- `Evidence`
- `FieldCandidate`
- `FieldState`

Once these are stable, scaffold the backend and build the case lifecycle around them before adding extraction and chat behavior.
