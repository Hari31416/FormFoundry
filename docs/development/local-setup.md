# Local Setup

This guide will help you get a local development environment up and running for FormFoundry.

## Prerequisites

Ensure you have the following installed on your system:

- **Docker & Docker Compose**: For running infrastructure services.
- **Python 3.12**: For the backend.
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

3. **Configure language providers**:
   Translation, language detection, and speech use `indic-language-utils`. The root
   `.indic-language-utils.toml` selects the defaults:

   ```toml
   [routes]
   translation = ["googletrans"]
   text_language_detection = ["fasttext"]
   text_to_speech = ["edge_tts"]
   speech_to_text = []
   ```

   These defaults need no API keys. Google Translate and Microsoft Edge TTS are
   unofficial network adapters. FastText runs locally and downloads its model on
   first detection. Backend setup installs the required extras and uses Python 3.12.

   Set a route to `[]` to disable it. A comma-separated `ILU_ROUTE_TRANSLATION`,
   `ILU_ROUTE_TEXT_LANGUAGE_DETECTION`, `ILU_ROUTE_TEXT_TO_SPEECH`, or
   `ILU_ROUTE_SPEECH_TO_TEXT` environment variable overrides its TOML route.
   An explicitly empty override disables the capability. The old
   `LANGUAGE_DETECTION_SERVICE_PROVIDER`, `LANGUAGE_TRANSLATION_SERVICE_PROVIDER`,
   `TTS_SERVICE_PROVIDER`, and `STT_SERVICE_PROVIDER` variables are no longer used.

   For Bhashini or Sarvam, change the routes to `bhashini` or `sarvam`, configure
   endpoints and model/service IDs in the TOML provider sections, and supply
   `BHASHINI_API_KEY` or `SARVAM_API_KEY` in the root `.env`. See the commented
   provider and Edge voice examples in the TOML. Process environment values take
   precedence over `.env`. `ILU_CONFIG_FILE` selects an alternative TOML file.

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
  - Double-check external API keys (`BHASHINI_API_KEY` or `SARVAM_API_KEY` for cloud providers) if provider translations are failing.
  - Review backend logs (`make logs-backend`) to check for `LanguageManager` initialization warnings or connection failures.
- **Frontend Build**: If you encounter issues with Vite or translation loaders, try clearing `frontend/node_modules` and re-running `make frontend-setup`.
