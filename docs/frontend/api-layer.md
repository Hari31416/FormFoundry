# API Layer

The frontend communicates with the backend exclusively through a centralized API layer located in `src/lib/api.ts`.

## Technology Choice

FormFoundry uses **Axios** for HTTP requests due to its robust feature set, including:

- Automatic JSON transformation.
- Interceptors for request/response handling.
- Better error handling for non-2xx status codes.
- Native support for alternative response types (e.g. streaming binary audio files).

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

Every API function is fully typed. Interfaces for all backend models (Cases, Templates, Evidence, NextQuestion, ConversationTurn, etc.) are maintained within `api.ts` to ensure end-to-end type safety.

```typescript
export interface CaseFile {
  case_id: string;
  status: CaseStatus;
  metadata: Record<string, any>;
  // ...
}

export const getCases = () =>
  api.get<CaseFile[]>("/cases").then((res) => res.data);
```

## Key API Modules

- **Case Management**: Functions for listing, creating, and fetching detailed case details. Includes `updateCaseLanguage` which triggers case-level locale preference updates.
- **Evidence Ingestion**: Helpers for submitting text notes and uploading files (using `FormData`).
- **Field Interactions**: Endpoints for editing, confirming, or rejecting field values.
- **Conversation**: Logic for fetching the next localized follow-up question and submitting user answers.
- **Multilingual Support**: Centralized functions to handle translation and speech features:
  - `getLanguageConfig`: Fetches system configuration settings (`LanguageConfig`) specifying if translation, language detection, and TTS are active.
  - `detectLanguage`: Requests the backend to run AI detection on a snippet of text and return the ISO code (e.g. `hi`).
  - `textToSpeech`: Submits text to synthesize speech. Uses `{ responseType: 'blob' }` to load the returned raw MP3 bytes as a browser-compatible media asset.
- **Artifacts**: Support for triggering generation and downloading final documents.

## Real-time Updates (SSE)

While standard requests use Axios, real-time question streaming uses the native **EventSource** API (managed via custom hooks in `src/hooks/`). This allows the backend to "push" the current localized assistant question to the frontend as it is being processed.

## Error Handling

API errors are handled gracefully within the components. The application typically displays a toast notification or an inline error message when a request fails, often leveraging the structured error details returned by FastAPI.
