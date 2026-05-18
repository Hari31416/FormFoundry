# Frontend Architecture

The FormFoundry frontend is a modern React application built with TypeScript, Vite, and `react-i18next` for internationalization. It is designed to provide an accessible, multi-view "workspace" experience for managing complex form-filling and structured intake tasks.

## Tech Stack

- **React 18**: UI framework.
- **TypeScript**: Ensuring strict type safety across components.
- **Vite**: Ultra-fast build tool and dev server.
- **react-i18next**: High-performance local i18n translation engine.
- **shadcn/ui & Tailwind CSS**: Theme-aware UI component library and styling.
- **Lucide React**: Premium iconography.
- **Fetch API**: Centralized client wrappers in `src/lib/api.ts` (leveraging Axios).

## Core Concepts

### 1. Dual-Workspace Experience

To support both rapid, user-friendly data gathering and comprehensive professional auditing, the main interface allows toggling between two layout modes:

- **Simplified Chat View (`SimplifiedChatView.tsx`)**:
  - A guided, conversation-first view tailored for mobile-first or citizen intake.
  - Combines chat messages, strategist reasoning, speech output (TTS), inline field confirmations, and PDF generated download summaries in a single scrollable panel.
- **Detailed Workspace View (`DetailedWorkspaceView.tsx`)**:
  - A heavy-duty three-panel layout.
  - Features an **Evidence Panel** (viewing raw text, PDFs, and uploading files), a **Field Panel** (detailed list of fields, confidence levels, and active suggestions), and a **Chat Interface** side-by-side.

### 2. State Management

FormFoundry favors a hybrid state management approach:

- **Server State**: The source of truth is always the backend. Data is fetched on navigation using **React Query** (`@tanstack/react-query`) and invalidated/re-fetched following mutations (e.g. submitting a turn, confirming a field).
- **Local State**: Component-level state is used for layout toggles (Detailed vs. Simplified), draft edit boxes, text-to-speech playing states, and modals.
- **Hooks**: Custom hooks encapsulate complex SSE streaming flows, translation configs, and speech players.

### 3. API Layer & Type Safety

All backend communication is centralized in `src/lib/api.ts`. TypeScript interfaces are strictly defined for every backend schema (cases, template fields, evidence, validation issues, language settings, and translation endpoints) to ensure end-to-end type safety.

## Component Organization

To prevent monolithic page bloat, the workspace has been refactored into modular sub-components under `src/components/case/`:

- **`LanguageSelector.tsx`**: An elegant header dropdown menu with a Globe icon and active locale checkmarks. Handles manual locale changes and triggers backend preferences updates.
- **`DetailedWorkspaceView.tsx`**: Renders the multi-pane professional review grid.
- **`SimplifiedChatView.tsx`**: Renders the guide-centric, mobile-optimized questionnaire flow.
- **`FieldRow.tsx`**: Manages inline field values, confidence metrics, and quick confirmation/rejection action buttons.
- **`DropdownMenuComponent.tsx`**: Manages artifact template download formats.

## Frontend Internationalization (i18n)

Frontend localization is implemented via `react-i18next` and maintained under `src/locales/`:

- `en.json`: Key-value map for all English UI elements, prompts, and tooltips.
- `hi.json`: Fully localized Hindi translation map.

### 1. Locale Persistence & Caching

The application reads the initial language from browser `localStorage` under `i18nextLng`, defaulting to `en`. Any manual language change updates both the state and `localStorage` dynamically.

### 2. Preference Syncing

When a user launches a case workspace or updates their language in the header selector, the frontend triggers a `PUT /cases/{id}/language` request to save the preferred locale under the case's backend metadata.

- Outgoing follow-up questions from the assistant are dynamically translated on the backend to match this metadata.
- When typing answers in regional languages, the backend dynamically detects the language, updates the metadata preference, and automatically translates user input to English, ensuring real-time bidirectional syncing.
