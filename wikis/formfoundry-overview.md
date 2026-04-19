# FormFoundry

FormFoundry is a generalized form-filling and artifact-generation platform. It turns uploaded documents, freeform notes, and conversational answers into a validated case schema and exportable artifacts.

## Foundation decisions

- FastAPI is the backend API and SSE surface.
- Postgres is the durable source of truth.
- Minio stores evidence and generated artifacts.
- Redis is reserved for job orchestration and transient state.
- Qdrant is provisioned but deferred until retrieval becomes necessary.
- Template behavior remains declarative-only in v1.

## Phase 0 deliverables

- backend scaffold with typed settings, health route, request IDs, and structured logging
- Docker Compose for Postgres, Redis, Minio, and Qdrant
- frontend shell initialized under the FormFoundry brand
- Makefile for infra and local process lifecycle
- Alembic scaffold to anchor the migration workflow

## Phase 1 additions

- seeded MVP template: `household-assistance-intake`
- template registry API with version-aware fetches
- case creation API that persists empty field state for every template field
- schema-state endpoint that returns both nested data and field-group metadata

## Phase 2 additions

- evidence model for uploaded files and freeform notes
- pluggable storage adapter with local filesystem and Minio support
- extraction job queue records created at intake time
