# Frontend Documentation

The FormFoundry frontend is a reactive Single Page Application (SPA) designed to provide a premium, workspace-style interface for managing complex form-filling cases.

## Key Sections

- **[Project Structure](project-structure.md)**: Overview of the codebase organization.
- **[API Layer](api-layer.md)**: How the frontend communicates with the backend service.
- **[No-Code Platform](no-code-platform.md)**: Details on the custom dynamic template builder, dynamic case forms, and layouts.
- **[Design System](design-system.md)**: The "administrative dossier" visual language — tokens, type, and per-screen rules.

## Core Principles

- **Typed Everything**: Leveraging TypeScript to ensure data consistency from the API to the UI.
- **Component-First**: Building complex pages from small, reusable, and testable components.
- **Workspace Focus**: Centralizing all case-related actions (evidence, fields, chat) into a single, cohesive interface.

## Tech Stack Deep Dive

For more details on the tools we use, see the **[Architecture Overview](../architecture/overview.md)**.

## Case titles

Every case starts with a stable `Case #<short ID>` label. Titles live in case metadata as `title`, with `title_source` set to `pattern`, `ai`, or `manual`.

Schema authors can set an optional **Case title pattern** in the Architect's metadata tab. The API stores it in `conversation_config.title_pattern`, for example `{complainant.full_name} · {incident.category}`. Placeholders must reference scalar fields in that schema. Patterns wait for all referenced values and refresh when field resolution runs. Leave the pattern blank to use an AI title.

AI titles are generated after resolution captures at least two eligible fields, or one for a one-field schema. Generation uses up to 12 captured scalar fields marked with standard sensitivity, with bounded values and a 10-second timeout. A successful title is persisted once. Failure leaves the ID fallback in place and can retry on the next resolution. Reads never trigger AI calls, so existing cases receive titles when their fields are next resolved.

Use the pencil beside the workspace title to rename a case. `PUT /api/v1/cases/{case_id}/title` accepts a nonblank title of up to 160 characters. Renaming sets the source to `manual`, preserves other metadata, and prevents subsequent automatic changes.
