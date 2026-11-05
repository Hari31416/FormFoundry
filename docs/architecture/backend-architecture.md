# Backend Architecture

The FormFoundry backend is a FastAPI application structured around the **Service Layer** pattern. It prioritizes type safety, clear separation of concerns, pluggable third-party services, and efficient data extraction.

## Core Design Patterns

### 1. Service Layer

All business logic resides in service modules (e.g., `app/templates/service.py`, `app/cases/service.py`, `app/languages/manager.py`). Routes act as thin wrappers around these services, handling request validation and response formatting.

### 2. Feature-Based Organization

The application is organized by features rather than layers. Each folder in `app/` (e.g., `templates`, `cases`, `extraction`, `languages`) contains its own models, services, and schemas.

### 3. Dependency Injection

FastAPI's dependency injection system is used extensively, primarily for:

- Database sessions (`get_db_session`)
- Configuration access (`get_settings`)
- Service singletons (e.g., `get_language_manager`)
- Mocking during tests

## Module Breakdown

- **`app.core`**: Cross-cutting concerns like configuration, logging, and request tracing.
- **`app.api`**: Central routing and endpoint definitions.
- **`app.templates`**: Management of the dynamic, version-aware database template registry supporting no-code intake creation directly from the UI.
- **`app.cases`**: Orchestration of the form-filling lifecycle.
- **`app.intake`**: Ingestion of evidence from various sources.
- **`app.extraction`**: AI-driven data extraction and OCR logic.
- **`app.resolution`**: Conflict resolution and field state management.
- **`app.conversation`**: Interactive chat experience for missing data.
- **`app.languages`**: Pluggable language detection, translation, speech services, and caching.
- **`app.validation`**: Schema and logic validation engine.
- **`app.artifacts`**: Professional document generation. Replaces static forms with a ReportLab Platypus page layout compiler that dynamically constructs structured case reports featuring clean tables with alternating row shading, grouped sections, and shaded card wells for long textual fields and repeated arrays.

## AI Orchestration

FormFoundry uses `litellm` to maintain provider-agnosticism. The extraction process involves:

1. **Vision OCR**: Rasterizing PDFs and processing images to extract raw text.
2. **Chunking**: Breaking down large documents into manageable text blocks.
3. **LLM Extraction**: Sending blocks to the LLM with structured prompts to identify field candidates.
4. **Attribution**: Mapping extracted data back to the original evidence source.

## Language and speech

`LanguageManager` uses the public `indic-language-utils` clients for translation,
language detection, TTS, and optional STT. Provider routes, model IDs, and voice
mappings live in the root `.indic-language-utils.toml`. Credentials load from the
root `.env`, with process environment values taking precedence.

Defaults are Google Translate, local FastText detection, and Microsoft Edge TTS.
STT is disabled by default. The first language request opens async clients once;
application shutdown closes them. Partial initialization closes any clients that
were opened before a failure. No custom provider HTTP adapters remain.

The library normalizes language inputs to canonical tags such as `hi-IN`.
Detection returns bare ISO codes such as `hi` for conversation metadata and UI
selectors. Disabled or failed detection returns `en`. Translation failures remain
visible to the caller; conversation localization helpers log them and retain the
original text. Empty or failed translations never enter the Redis cache.

Redis stores successful translations under SHA-256 keys containing normalized
source and destination tags, with a 24-hour TTL. Cache connection failures do not
block provider calls. The library's own cache is disabled to avoid duplicate
translation caches.

TTS returns the library's audio bytes and audio format. The endpoint uses the
matching content type and `application/octet-stream` if the format is unknown.
STT accepts bytes with their actual audio format and sampling rate. It does not
fetch URLs, load file paths, or resample audio.
