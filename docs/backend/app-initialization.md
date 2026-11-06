# Application Initialization

This document describes how the FormFoundry backend application is initialized and configured.

## Entry Point

The main entry point for the application is `app/main.py`. It uses the **App Factory** pattern to create the FastAPI instance.

```python
def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    application = FastAPI(title=settings.project_name, lifespan=lifespan)

    # Middleware registration
    application.add_middleware(RequestIdMiddleware)
    application.add_middleware(CORSMiddleware, ...)

    # Router inclusion
    application.include_router(api_router, prefix=settings.api_prefix)

    return application

app = create_app()
```

## Lifespan Events

The `lifespan` async context manager handles startup and shutdown logic:

- **Startup**:
  - Ensures the local storage directory exists.
  - Initializes the database connection and runs basic schema setup (`init_db`).
  - Bootstraps the administrator account. Templates remain in the database without filesystem synchronization.
- **Shutdown**:
  - Database connections are closed automatically by the context manager.

Example templates can be imported explicitly by running `uv run python seed_templates.py`
from `backend/`. This inserts missing versions only; it does not overwrite or delete
existing database templates. Restarting the app does not restore deleted templates.

## Middleware

FormFoundry uses several custom and built-in middlewares:

1. **`RequestIdMiddleware`**: Injects a unique `X-Request-ID` into every request and response, which is then captured in the structured logs.
2. **`CORSMiddleware`**: Configures Cross-Origin Resource Sharing based on the `FRONTEND_PORT` setting.
3. **`GZipMiddleware`** (Optional): Can be added for compressing large responses.

## Configuration Loading

Configuration is managed using **Pydantic Settings** in `app/core/config.py`.

- Settings are loaded from environment variables and the `.env` file.
- The `get_settings()` function is cached using `functools.lru_cache` to avoid redundant I/O.
- All sensitive information (database URLs, API keys) is typed and validated at startup.
