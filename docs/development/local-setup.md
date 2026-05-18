# Local Setup

This guide will help you get a local development environment up and running for FormFoundry.

## Prerequisites

Ensure you have the following installed on your system:

- **Docker & Docker Compose**: For running infrastructure services.
- **Python 3.12+**: For the backend.
- **`uv`**: Fast Python package manager.
- **Node.js (LTS)**: For the frontend.
- **`pnpm`**: Fast Node package manager.

## Step-by-Step Installation

1. **Clone the Repository**:

   ```bash
   git clone <repository-url>
   cd generic-form-filler
   ```

2. **Configure Environment Variables**:
   Copy the example environment file and fill in your details (especially LLM API keys and your chosen Language Service Providers).

   ```bash
   cp .env.example .env
   ```

3. **Configure Pluggable Language Providers**:
   Open `.env` and adjust the variables to enable the multilingual and speech features.

   **Option A: Local Developer (Zero-Key Setup)**
   To iterate quickly without setting up external translation keys, utilize `langdetect` local fallback:

   ```bash
   LANGUAGE_DETECTION_SERVICE_PROVIDER=langdetect
   LANGUAGE_TRANSLATION_SERVICE_PROVIDER=None
   TTS_SERVICE_PROVIDER=None
   STT_SERVICE_PROVIDER=None
   ```

   **Option B: Google Cloud translation**
   To utilize Google Translation pipelines, set:

   ```bash
   LANGUAGE_DETECTION_SERVICE_PROVIDER=google
   LANGUAGE_TRANSLATION_SERVICE_PROVIDER=google
   TTS_SERVICE_PROVIDER=None
   STT_SERVICE_PROVIDER=None
   # Standard google credentials (ADC) or API key envs are required based on your GCP setup
   ```

   **Option C: Bhashini GovTech pipeline (State-of-the-Art Indian Language API)**
   To leverage Bhashini for Indian languages (Hindi, etc.) with Text-to-Speech playback:

   ```bash
   LANGUAGE_DETECTION_SERVICE_PROVIDER=bhashini
   LANGUAGE_TRANSLATION_SERVICE_PROVIDER=bhashini
   TTS_SERVICE_PROVIDER=bhashini
   STT_SERVICE_PROVIDER=None

   # Bhashini credentials
   BHASHINI_API_KEY=your-api-key-here
   BHASHINI_ENDPOINT_URL=https://dhruva-api.bhashini.gov.in/services/inference/pipeline
   BHASHINI_TRANSLATION_SERVICE_ID=ai4bharat/indictrans-v2-all-gpu--t4
   BHASHINI_LANG_DETECTION_SERVICE_ID=some-lang-detection-model-id  # Optional, falls back to standard pipelines
   ```

4. **Start Infrastructure**:
   Use the Makefile to spin up the required Docker containers (PostgreSQL, Minio, Redis, Qdrant).

   ```bash
   make up
   ```

5. **Setup Backend**:
   Install dependencies and synchronize the virtual environment.

   ```bash
   make backend-setup
   ```

6. **Setup Frontend**:
   Install Node dependencies.
   ```bash
   make frontend-setup
   ```

## Running the Application

You can start both services simultaneously or individually:

- **Start All**: `make start` (Infra + Backend + Frontend)
- **Backend Only**: `make backend-start`
- **Frontend Only**: `make frontend-start`

## Health Checks

Once running, you can verify the status of the services:

- **Infra Status**: `make ps`
- **Service Health**: `make health` (Checks backend `/health` and verifies db/redis/minio connection health)

## Common Troubleshooting

- **Database Connection**: Ensure the `.env` file has the correct `POSTGRES_PASSWORD` and matches the one in `docker-compose.yml`.
- **LLM Errors**: Verify your `LLM_API_KEY` and `LLM_MODEL` settings.
- **Translation Failures**:
  - Ensure **Redis** is running (`make ps`), as translation caching relies on an active Redis connection.
  - Double-check external API keys (`BHASHINI_API_KEY` or standard Google keys) if provider translations are failing.
  - Review backend logs (`make logs-backend`) to check for `LanguageManager` initialization warnings or connection failures.
- **Frontend Build**: If you encounter issues with Vite or translation loaders, try clearing `frontend/node_modules` and re-running `make frontend-setup`.
