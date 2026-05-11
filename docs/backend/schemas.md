# Schemas

FormFoundry uses **Pydantic v2** for data validation, serialization, and API documentation (via OpenAPI).

## Schema Patterns

### 1. Naming Conventions

- **`Base`**: Shared fields between create and read schemas.
- **`Create`**: Fields required to create a new record.
- **`Response` / `Detail`**: Fields returned in API responses (often includes timestamps and IDs).

### 2. Configuration

Schemas typically use `model_config = ConfigDict(from_attributes=True)` to allow Pydantic to serialize SQLAlchemy ORM objects directly.

```python
class TemplateDefinition(TemplateDefinitionBase):
    model_config = ConfigDict(from_attributes=True)
    created_at: datetime
    updated_at: datetime
```

## Key Schema Examples

### `CaseDetail`

A comprehensive schema used for the workspace view, combining the case record, template details, and current field states.

### `SchemaStateResponse`

A optimized schema for the frontend to render the dynamic form, including:

- `current_schema_state`: The raw data.
- `field_states`: Metadata about each field (status, confidence).
- `field_groups`: Metadata for grouping fields in the UI.

### `TemplateField`

A highly nested schema defining a single field in a template, including:

- Validation rules (`validation_refs`)
- UI labels and help text
- Conversational questions for the chat interface

## Validation Logic

Pydantic's `@field_validator` and `@model_validator` are used for:

- Enforcing custom business rules.
- Normalizing input data.
- Ensuring consistency across related fields.
