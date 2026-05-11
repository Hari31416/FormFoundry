# Models

FormFoundry uses SQLAlchemy as its Object-Relational Mapper (ORM). Models are organized within their respective feature modules (e.g., `app/cases/models.py`) and inherit from a common `Base` class.

## Base Class

The base class is defined in `app/models/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass
```

## Common Patterns

### 1. Unified Model and Schema Files

In this project, ORM models (SQLAlchemy) and data schemas (Pydantic) are often kept in the same `models.py` file within each feature module to keep related definitions together.

### 2. Modern SQLAlchemy Mapping

The project uses the `Mapped` and `mapped_column` syntax introduced in SQLAlchemy 2.0 for better type checking.

### 3. UUID Primary Keys

Most major entities (Cases, Artifacts, Evidence) use UUIDs (stored as strings) for primary keys to facilitate distributed generation and security.

### 4. JSON Columns

SQLAlchemy's `JSON` type is used extensively for storing flexible data, such as:

- Dynamic schema states
- Configuration objects
- Metadata dictionaries

## Key Model Examples

### `CaseFileRecord` (`app/cases/models.py`)

Represents the core instance of a form-filling process.

- `case_id`: Primary key (UUID).
- `status`: Current stage of the case (DRAFT, EXTRACTING, etc.).
- `current_schema_state`: The resolved JSON data for the case.

### `TemplateDefinitionRecord` (`app/templates/models.py`)

Stores the declarative definition of a form.

- `template_id` & `template_version`: Composite key (unique together).
- `schema`: JSON list of `TemplateField` definitions.

### `EvidenceRecord` (`app/intake/models.py`)

Represents a source of data (file, note, chat answer).

- `storage_uri`: Location in Minio or local storage.
- `extraction_status`: Tracks if the evidence has been processed by the AI.
