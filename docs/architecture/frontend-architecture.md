# Frontend Architecture

The FormFoundry frontend is a modern React application built with TypeScript and Vite. It is designed to provide a highly interactive "workspace" experience for managing complex form-filling tasks.

## Tech Stack

- **React 18**: UI framework.
- **TypeScript**: Ensuring type safety across the application.
- **Vite**: Build tool and dev server.
- **shadcn/ui & Tailwind CSS**: UI component library and styling.
- **Lucide React**: Iconography.
- **Fetch API**: For backend communication (centralized in `lib/api.ts`).

## Core Concepts

### 1. The Workspace Experience

Most of the application logic revolves around the `CaseWorkspace`, a unified view that combines:

- **Evidence Panel**: For viewing and managing uploaded documents.
- **Field Panel**: For reviewing and editing the current state of the form.
- **Chat Interface**: For interactive data gathering.

### 2. State Management

FormFoundry favors a hybrid state management approach:

- **Server State**: The source of truth for case data is always the backend. Data is fetched on navigation and refreshed after mutations.
- **Local State**: Component-level state is used for UI toggles, draft edits, and transient interactions.
- **Hooks**: Custom hooks (in `src/hooks/`) encapsulate shared logic, such as API interactions and SSE handling.

### 3. API Layer

Communication with the backend is centralized in `src/lib/api.ts`. This module provides typed wrappers for all backend endpoints, handling authentication headers and error parsing.

## Component Organization

- **`src/components/ui`**: Base UI components from shadcn/ui.
- **`src/components/case`**: Feature-specific components for the case workspace.
- **`src/pages`**: Main route entry points (`TemplateSelection`, `CaseWorkspace`).
- **`src/lib`**: Utilities, constants, and the API client.

## Data Flow (UI)

1. **User Action**: User clicks a button or types in a field.
2. **API Call**: The component calls a function in `lib/api.ts`.
3. **Optimistic UI (Optional)**: The UI may update immediately to reflect the change.
4. **Backend Sync**: On success, the application re-fetches the necessary data to ensure synchronization with the server.
