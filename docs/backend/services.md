# Services

The service layer in FormFoundry contains all the core business logic. Services are located within their respective feature modules (e.g., `app/cases/service.py`, `app/languages/manager.py`).

## Service Characteristics

- **Stateless**: Services do not maintain internal state. All state is passed via arguments (e.g., `AsyncSession`) or fetched from the database/cache.
- **Asynchronous**: All I/O-bound operations use `async/await`.
- **Atomic Operations**: Services are responsible for ensuring that complex operations are executed within a single database transaction.

## Core Services

### Language Service (`app/languages/manager.py`)

A pluggable, centralized orchestrator that manages all regional language detection, translation, and text-to-speech (TTS) services.

- `detect_language`: Dynamically determines the language of raw user inputs (using Google, Bhashini, Sarvam, or `langdetect`).
- `translate`: Performs bidirectional translation between local languages (Hindi) and English. Automatically checks the Redis translation cache to avoid calling third-party API providers on identical strings.
- `text_to_speech`: Converts plain text into high-quality audio bytes (MP3) in a specific language using regional speech models (such as Bhashini or Sarvam), enabling clickable playback in the chat.
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

### Artifact Service (`app/artifacts/service.py`)

Handles dynamic compilation and exporting of approved case data into ready-to-use professional artifacts.

- `generate_pdf_artifact`: Compiles case data using a ReportLab Platypus dynamic layout compiler. Groups fields by template sections, maps short strings to alternating-shaded tables, and formats arrays/long text into padded card wells.
- `generate_json_artifact`: Serializes the final resolved case state into structured JSON, uploading it to Minio/S3.
- `list_artifacts`: Returns all generated artifacts associated with a case.
- `get_artifact_download_response`: Directs client downloads to S3 URLs or streams local files.

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

### Conversation calls and prompt context

An ordinary chat answer uses one extraction LLM call and one follow-up LLM call. When no fields remain to ask about, the follow-up call is skipped. Chat answers stay in one extraction unit even when longer than the document chunk size. Uploaded documents retain their per-chunk extraction flow.

The submitted answer is associated with the stored assistant question. The backend does not regenerate that question before interpreting the answer. Both extraction and question generation receive the latest 20 conversation turns, oldest first, with up to 2,000 characters per turn. Stored English translations are used where available. Extraction uses history to interpret the current evidence, rather than creating new candidates from old answers or assistant examples. The question prompt also includes current field statuses, values, and confidence, allowing it to acknowledge partial answers and request clarification.

The next question's English payload, displayed text, language, and state fingerprint are stored on its assistant turn. The fingerprint includes the template, current field/schema state, and latest user turn. Unchanged GET and SSE reads reuse that payload. Field changes and new user answers invalidate it. The frontend uses the question returned by answer submission directly. Existing language-provider translation remains separate; this change does not introduce another translation model.

A per-case async lock serializes question reads and answer submission within the backend process. Polling waits for an in-progress answer instead of generating a follow-up from intermediate state. Multiple backend worker processes would require coordination beyond this in-process lock.

All active LLM prompts live in `backend/app/prompts/*.jinja2`: extraction, conversation, and vision OCR, each with system and user templates. `render_prompt` uses one shared Jinja environment with strict undefined-variable checks. Incomplete dates must not acquire invented month/day components; the follow-up should request the missing detail.

### Evidence-backed provenance

Chat extraction candidates must cite a quote present in the current raw answer. History and assistant question text cannot supply that citation. The backend checks quotes before storing candidates, allowing case and whitespace normalization and the legacy `User answer:` prefix. Candidate rejection counts are logged as `skipped_unsupported_quote` without an extra model call.

The resolver repeats this validation for stored chat candidates and ignores unsupported sources. Proposed fields list only the qualifying evidence supporting the selected value. Conflicted fields retain sources for the competing qualifying candidates; unresolved fields do not label rejected guesses as supporting evidence. Confirmed values remain confirmed, with provenance restricted to matching validated candidates and matching manual edits. Original candidate and evidence records are retained for audit.

To repair an existing case without LLM calls, run `uv run python -m scripts.repair_case_provenance CASE_ID` from `backend/`. This re-resolves the case with the current validation rules and updates its field state and resolution audit.
