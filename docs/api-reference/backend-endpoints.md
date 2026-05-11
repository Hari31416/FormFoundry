# Backend Endpoints

This is a summary of the key API endpoints available in the FormFoundry backend. For a full interactive reference, start the backend and visit `/docs`.

## Templates

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/templates` | List all available templates. |
| `POST` | `/api/v1/templates` | Create a new template definition. |
| `GET` | `/api/v1/templates/{id}` | Get a specific template by ID (with versioning). |

## Cases

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cases` | List all cases. |
| `POST` | `/api/v1/cases` | Create a new case from a template. |
| `GET` | `/api/v1/cases/{id}` | Get detailed case information. |
| `GET` | `/api/v1/cases/{id}/schema-state` | Get the current resolved schema and field states. |
| `POST` | `/api/v1/cases/{id}/approve` | Approve a case for artifact generation. |

## Intake & Evidence

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cases/{id}/evidence` | List all evidence records for a case. |
| `POST` | `/api/v1/cases/{id}/evidence/text` | Add a text note as evidence. |
| `POST` | `/api/v1/cases/{id}/evidence/upload` | Upload a file (PDF/Image) as evidence. |

## Extraction & Fields

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/cases/{id}/fields/{path}/edit` | Manually edit a field value. |
| `POST` | `/api/v1/cases/{id}/fields/{path}/confirm` | Confirm an AI-proposed field candidate. |
| `POST` | `/api/v1/cases/{id}/fields/{path}/reject` | Reject an AI-proposed candidate. |

## Conversation

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cases/{id}/conversation/next-question` | Get the next recommended question. |
| `POST` | `/api/v1/cases/{id}/conversation/turns` | Submit a user answer to a question. |

## Artifacts

| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/cases/{id}/artifacts` | List all generated artifacts for a case. |
| `POST` | `/api/v1/cases/{id}/artifacts` | Trigger generation of a new artifact. |
| `GET` | `/api/v1/cases/{id}/artifacts/{aid}/download` | Download a generated artifact file. |
