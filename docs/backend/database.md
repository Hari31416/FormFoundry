# Database

FormFoundry uses PostgreSQL as its primary durable data store.

## Engine & Session Management

- **Engine**: Created using `sqlalchemy.ext.asyncio.create_async_engine`.
- **Session Factory**: Managed by `async_sessionmaker`.
- **Concurrency**: `pool_pre_ping=True` is used to handle stale connections.

## Migrations (Alembic)

Database schema changes are managed via Alembic.

- **Configuration**: `backend/alembic.ini`.
- **Versions**: Stored in `backend/alembic/versions/`.
- **Workflow**:

  ```bash
  cd backend
  uv run alembic revision --autogenerate -m "description"
  uv run alembic upgrade head
  ```

## Schema Strategy

- **Relational Metadata**: Core entities use traditional columns (String, Integer, DateTime).
- **Flexible Payloads**: The `JSON` type is used for:
  - `TemplateDefinitionRecord.schema`
  - `CaseFileRecord.current_schema_state`
  - `FieldCandidateRecord.metadata`
  - `ResolutionAuditRecord.changes`

This hybrid approach allows the system to remain generalized and handle new template types without database schema migrations for every new form field.

## Relationships

Relationships are defined using SQLAlchemy's `relationship()` and `ForeignKey`.

- **Cascading Deletes**: Most child records (FieldStates, Candidates, Evidence) use `ondelete="CASCADE"` to ensure cleanup when a Case is deleted.
- **Indexes**: Strategic indexes are placed on `case_id`, `template_id`, and `field_path` to ensure fast retrieval during complex resolution cycles.
