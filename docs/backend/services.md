# Services

The service layer in FormFoundry contains all the core business logic. Services are located within their respective feature modules (e.g., `app/cases/service.py`).

## Service Characteristics

- **Stateless**: Services do not maintain internal state. All state is passed via arguments (e.g., `AsyncSession`) or fetched from the database.
- **Asynchronous**: All I/O-bound operations use `async/await`.
- **Atomic Operations**: Services are responsible for ensuring that complex operations (like creating a case and its initial field states) are executed within a single database transaction.

## Core Services

### Template Service (`app/templates/service.py`)

Manages the template registry.

- `ensure_seed_templates`: Loads templates from JSON on startup.
- `get_template_definition`: Retrieves specific versions of a template.

### Case Service (`app/cases/service.py`)

Orchestrates the lifecycle of a case.

- `create_case`: Initializes a new case from a template.
- `get_case_detail`: Aggregates case state and metadata for the UI.
- `transition_case_status`: Manages the state machine for cases.

### Extraction Service (`app/extraction/service.py`)

Handles the interaction with LLMs and OCR.

- `trigger_extraction_job`: Queues a new job for background processing.
- `process_evidence_chunk`: Logic for sending data to LiteLLM and parsing candidates.

### Resolution Service (`app/resolution/service.py`)

The "brain" that resolves candidates into field values.

- `resolve_field_state`: Logic for selecting the best candidate or flagging conflicts.
- `recalculate_schema_state`: Aggregates all resolved field states into the main case JSON.

## Pattern Example

```python
async def create_template(session: AsyncSession, payload: TemplateDefinitionCreate) -> TemplateDefinitionRecord:
    db_obj = TemplateDefinitionRecord(**payload.model_dump(exclude={"template_schema"}))
    db_obj.schema = [f.model_dump() for f in payload.template_schema]
    session.add(db_obj)
    await session.commit()
    await session.refresh(db_obj)
    return db_obj
```
