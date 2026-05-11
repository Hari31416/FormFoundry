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
   Copy the example environment file and fill in your details (especially LLM API keys).

   ```bash
   cp .env.example .env
   ```

3. **Start Infrastructure**:
   Use the Makefile to spin up the required Docker containers.

   ```bash
   make up
   ```

4. **Setup Backend**:
   Install dependencies and synchronize the virtual environment.

   ```bash
   make backend-setup
   ```

5. **Setup Frontend**:
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
- **Service Health**: `make health` (Checks backend `/health` endpoint)

## Common Troubleshooting

- **Database Connection**: Ensure the `.env` file has the correct `POSTGRES_PASSWORD` and matches the one in `docker-compose.yml`.
- **LLM Errors**: Verify your `LLM_API_KEY` and `LLM_MODEL` settings.
- **Frontend Build**: If you encounter issues with Vite, try clearing `frontend/node_modules` and re-running `make frontend-setup`.
