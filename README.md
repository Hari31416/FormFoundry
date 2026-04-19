# FormFoundry

FormFoundry is a generalized form-filling and artifact-generation platform. It ingests uploads, notes, and conversational answers, resolves them into a validated case schema, and generates exportable artifacts such as filled PDFs.

## Stack

- Backend: FastAPI, Pydantic settings, SQLAlchemy, Alembic, pytest, `uv`
- Frontend: React, TypeScript, Vite, `pnpm`
- Infra: Docker Compose, Postgres, Redis, Minio, Qdrant

## Current status

Phase 0 foundation is in place:

- backend scaffold with health checks, request IDs, structured logging, and tests
- frontend shell initialized under the FormFoundry brand
- Docker Compose for local infra
- Makefile for lifecycle commands
- Alembic scaffold for migrations
- pre-commit hooks for formatting and repo hygiene

## Quick start

1. Copy `.env.example` to `.env`.
2. Start infrastructure with `make up`.
3. Install backend dependencies with `make backend-setup`.
4. Install frontend dependencies with `make frontend-setup`.
5. Run the backend with `make backend-start`.
6. Run the frontend with `make frontend-start`.

## Development

- Backend tests: `cd backend && uv run pytest -q`
- Frontend build: `cd frontend && pnpm build`
- Install pre-commit hooks: `cd backend && uv run pre-commit install -c ../.pre-commit-config.yaml`

## Documentation

- Implementation notes: [wikis/formfoundry-overview.md](/Users/hari/Desktop/sandbox/generic-form-filler/wikis/formfoundry-overview.md)
- Product plan: [plans/001-form-filling-system-plan.md](/Users/hari/Desktop/sandbox/generic-form-filler/plans/001-form-filling-system-plan.md)
- Implementation roadmap: [plans/002-form-filling-system-implementation-plan.md](/Users/hari/Desktop/sandbox/generic-form-filler/plans/002-form-filling-system-implementation-plan.md)
