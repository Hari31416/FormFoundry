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
- **`app.templates`**: Management of the declarative template registry.
- **`app.cases`**: Orchestration of the form-filling lifecycle.
- **`app.intake`**: Ingestion of evidence from various sources.
- **`app.extraction`**: AI-driven data extraction and OCR logic.
- **`app.resolution`**: Conflict resolution and field state management.
- **`app.conversation`**: Interactive chat experience for missing data.
- **`app.languages`**: Pluggable language detection, translation, speech services, and caching.
- **`app.validation`**: Schema and logic validation engine.
- **`app.artifacts`**: Final document generation.

## AI Orchestration

FormFoundry uses `litellm` to maintain provider-agnosticism. The extraction process involves:

1. **Vision OCR**: Rasterizing PDFs and processing images to extract raw text.
2. **Chunking**: Breaking down large documents into manageable text blocks.
3. **LLM Extraction**: Sending blocks to the LLM with structured prompts to identify field candidates.
4. **Attribution**: Mapping extracted data back to the original evidence source.

## Pluggable Multilingual & Speech Subsystem

FormFoundry features a robust and decoupled **Language & Speech Subsystem** designed to handle diverse language requirements. It supports bidirectional translation between regional languages (e.g., Hindi) and English so that downstream LLM and OCR services only process English data, assuring maximum compliance and model intelligence.

### 1. Provider Interfaces

The subsystem defines abstract base classes (ABCs) in `app/languages/base.py`:

- `BaseLanguageDetectionProvider`
- `BaseTranslationProvider`
- `BaseTTSProvider`
- `BaseSTTProvider`

This decoupling allows developers to register any translation service. Currently supported out-of-the-box:

- **Google Translate Provider**: Fast, reliable general translation API.
- **Bhashini Provider**: Specifically tailored for Indian regional languages, delivering state-of-the-art translation, detection, and Text-to-Speech (TTS) synthesis.
- **Langdetect Provider**: A local, zero-cost language detector used as a developer fallback.

### 2. High-Performance Translation Caching

To minimize billing costs and network latency when calling external translation APIs (like Google or Bhashini), a high-performance **caching layer** is built directly into the service orchestrator (`app/languages/cache.py`):

- Uses **Redis** as a key-value store.
- Generates collision-free **SHA-256 hashed keys** combining the source text, source language, and target language.
- Defaults to a **24-hour TTL (86,400s)**, ensuring highly active conversation steps are processed instantly with zero external provider cost.
- Automatically handles network errors or cache misses by falling back to the active provider.
