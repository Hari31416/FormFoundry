# FormFoundry

FormFoundry is a generalized form-filling and artifact-generation platform. It turns uploaded documents, freeform notes, and conversational answers into a validated case schema and exportable artifacts.

## Foundation decisions

- FastAPI is the backend API and SSE surface.
- Postgres is the durable source of truth.
- Minio stores evidence and generated artifacts.
- Redis is reserved for job orchestration and transient state.
- Qdrant is provisioned but deferred until retrieval becomes necessary.
- Template behavior remains declarative-only in v1.
- Template definitions are loaded from JSON config files so new formats can be added without code changes.
- `litellm` is the single LLM integration layer for extraction and grouped question phrasing.

## Phase 0 deliverables

- backend scaffold with typed settings, health route, request IDs, and structured logging
- Docker Compose for Postgres, Redis, Minio, and Qdrant
- frontend shell initialized under the FormFoundry brand
- Makefile for infra and local process lifecycle
- Alembic scaffold to anchor the migration workflow

## Phase 1 additions

- seeded MVP template: `fir-report-intake`
- template registry API with version-aware fetches
- case creation API that persists empty field state for every template field
- schema-state endpoint that returns both nested data and field-group metadata

## Phase 2 additions

- evidence model for uploaded files and freeform notes
- pluggable storage adapter with local filesystem and Minio support
- extraction job queue records created at intake time

## Phase 3 additions

- extraction job execution with status transitions
- text chunking for evidence processing
- LLM-only candidate generation with evidence attribution and case-level inspection APIs

## Phase 4 additions

- deterministic resolver updates field states from stored candidates
- automatic case status and nested schema-state regeneration
- audit records for each field-level resolution decision

## Phase 5 additions

- next-question selection driven by field state priority and template metadata
- grouped follow-up question generation for related unresolved fields
- conversation turns persisted separately from evidence records
- SSE endpoint for streaming the current assistant question

## Phase 6 additions

- validation issue persistence for requiredness, format, enum, and cross-field rules
- review endpoint that assembles case state, evidence, and validation issues
- edit, confirm, and approve flows guarded by blocking validations

## Phase 7 additions

- generated fillable PDF artifact from approved schema data
- artifact persistence and download surface
- renderer metadata captured with each artifact record

## April 20, 2026 updates

- structured backend logs now include contextual metadata under `context` for easier tracing in JSON logs
- extraction pipeline logs cover job lifecycle, evidence parsing, chunking, per-chunk LLM proposal generation, and failure paths
- LLM integration logs now capture call start/end, duration, prompt sizes, token usage (when available), and parse errors
- uploaded images now go through vision-model OCR before candidate extraction
- uploaded PDFs are rasterized page-by-page for vision OCR, and intake rejects PDFs over 10 pages
- OCR can use dedicated `VISION_MODEL`, `VISION_API_KEY`, and `VISION_BASE_URL` settings, falling back to `LLM_*` when omitted
- added reproducible FIR demo evidence PDF generator at `backend/scripts/generate_demo_pdfs.py`
- generated demo PDFs for MVP walkthroughs at:
  - `backend/assets/pdfs/demo/fir_demo_theft_bengaluru.pdf`
  - `backend/assets/pdfs/demo/fir_demo_cyber_fraud_mumbai.pdf`
  - `backend/assets/pdfs/demo/fir_demo_harassment_hyderabad.pdf`
- added `LIST /cases` endpoint in backend to support case history and filtering by template
- implemented "Intake Control Center" in frontend showing recent cases for each template to allow resuming previous work
