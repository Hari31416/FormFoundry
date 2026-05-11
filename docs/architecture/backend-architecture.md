# Backend Architecture

The FormFoundry backend is a FastAPI application structured around the **Service Layer** pattern. It prioritizes type safety, clear separation of concerns, and efficient data extraction.

## Core Design Patterns

### 1. Service Layer

All business logic resides in service modules (e.g., `app/templates/service.py`, `app/cases/service.py`). Routes act as thin wrappers around these services, handling request validation and response formatting.

### 2. Feature-Based Organization

The application is organized by features rather than layers. Each folder in `app/` (e.g., `templates`, `cases`, `extraction`) contains its own models, services, and schemas.

### 3. Dependency Injection

FastAPI's dependency injection system is used extensively, primarily for:

- Database sessions (`get_db_session`)
- Configuration access (`get_settings`)
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
- **`app.validation`**: Schema and logic validation engine.
- **`app.artifacts`**: Final document generation.

## AI Orchestration

FormFoundry uses `litellm` to maintain provider-agnosticism. The extraction process involves:

1. **Vision OCR**: Rasterizing PDFs and processing images to extract raw text.
2. **Chunking**: Breaking down large documents into manageable text blocks.
3. **LLM Extraction**: Sending blocks to the LLM with structured prompts to identify field candidates.
4. **Attribution**: Mapping extracted data back to the original evidence source.
