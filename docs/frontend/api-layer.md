# API Layer

The frontend communicates with the backend exclusively through a centralized API layer located in `src/lib/api.ts`.

## Technology Choice

FormFoundry uses **Axios** for HTTP requests due to its robust feature set, including:

- Automatic JSON transformation.
- Interceptors for request/response handling.
- Better error handling for non-2xx status codes.

## Implementation Details

### API Instance

A pre-configured Axios instance is exported for use throughout the application.

```typescript
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export const api = axios.create({
  baseURL: API_BASE_URL,
});
```

### TypeScript Integration

Every API function is fully typed. Interfaces for all backend models (Cases, Templates, Evidence, etc.) are maintained within `api.ts` to ensure end-to-end type safety.

```typescript
export interface CaseFile {
  case_id: string;
  status: CaseStatus;
  // ...
}

export const getCases = () =>
  api.get<CaseFile[]>("/cases").then((res) => res.data);
```

## Key API Modules

- **Case Management**: Functions for listing, creating, and fetching detailed case information.
- **Evidence Ingestion**: Helpers for submitting text notes and uploading files (using `FormData`).
- **Field Interactions**: Endpoints for editing, confirming, or rejecting field values.
- **Conversation**: Logic for fetching the next AI-generated question and submitting user answers.
- **Artifacts**: Support for triggering generation and downloading final documents.

## Real-time Updates (SSE)

While standard requests use Axios, real-time question streaming uses the native **EventSource** API (managed via custom hooks in `src/hooks/`). This allows the backend to "push" the current assistant question to the frontend as it is being processed.

## Error Handling

API errors are handled gracefully within the components. The application typically displays a toast notification or an inline error message when a request fails, often leveraging the structured error details returned by FastAPI.
