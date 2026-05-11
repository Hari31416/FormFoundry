# Docker Infrastructure

FormFoundry uses Docker Compose to manage its infrastructure dependencies. This ensures a consistent environment for all developers and simplifies deployment.

## Core Services

### 1. PostgreSQL (`db`)

- **Image**: `postgres:16-alpine`
- **Purpose**: Relational database for all application data.
- **Port**: `5432`
- **Volume**: Persisted in `storage/postgres_data`.

### 2. Redis (`redis`)

- **Image**: `redis:7-alpine`
- **Purpose**: Used for caching, transient state, and potentially background job queuing.
- **Port**: `6379`

### 3. Minio (`minio`)

- **Image**: `minio/minio`
- **Purpose**: S3-compatible object storage for evidence files and generated artifacts.
- **Console Port**: `9001` (Web UI for inspecting files)
- **API Port**: `9000`
- **Volume**: Persisted in `storage/minio_data`.

### 4. Qdrant (`qdrant`) (Optional)

- **Image**: `qdrant/qdrant`
- **Purpose**: Vector database for semantic search and retrieval logic.
- **Port**: `6333`
- **Volume**: Persisted in `storage/qdrant_data`.

## Management Commands

The `Makefile` provides shorthand commands for managing these containers:

- `make up`: Starts all infrastructure services in the background.
- `make down`: Stops all services.
- `make nuke`: Stops services and **deletes all volumes** (use with caution).
- `make ps`: Shows the current status of all containers.
- `make logs`: Tails logs from all containers.

## Configuration

All Docker services are configured via the `.env` file. Key variables include:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`
- `QDRANT_API_KEY` (if authentication is enabled)
