# Services

The service layer in FormFoundry contains all the core business logic. Services are located within their respective feature modules (e.g., `app/cases/service.py`, `app/languages/manager.py`).

## Service Characteristics

- **Stateless**: Services do not maintain internal state. All state is passed via arguments (e.g., `AsyncSession`) or fetched from the database/cache.
- **Asynchronous**: All I/O-bound operations use `async/await`.
- **Atomic Operations**: Services are responsible for ensuring that complex operations are executed within a single database transaction.

## Core Services

### Language Service (`app/languages/manager.py`)

A pluggable, centralized orchestrator that manages all regional language detection, translation, and text-to-speech (TTS) services.

- `detect_language`: Dynamically determines the language of raw user inputs (using Google, Bhashini, or `langdetect`).
- `translate`: Performs bidirectional translation between local languages (Hindi) and English. Automatically checks the Redis translation cache to avoid calling third-party API providers on identical strings.
- `text_to_speech`: Converts plain text into high-quality audio bytes (MP3) in a specific language using regional speech models (such as Bhashini), enabling clickable playback in the chat.
- `speech_to_text`: Transcribes spoken voice bytes into plain text for intake processing.

### Template Service (`app/templates/service.py`)

Manages the template registry.

- `ensure_seed_templates`: Loads templates from JSON on startup.
- `get_template_definition`: Retrieves specific versions of a template.

### Case Service (`app/cases/service.py`)

Orchestrates the lifecycle of a case.

- `create_case`: Initializes a new case from a template.
- `get_case_detail`: Aggregates case state and metadata for the UI.
- `update_case_language`: Updates the preferred language in metadata for incoming question localization.
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
