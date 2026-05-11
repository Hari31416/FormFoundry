# Dependency Injection

FormFoundry utilizes FastAPI's powerful dependency injection system to manage shared resources and cross-cutting concerns.

## Core Dependencies

### 1. Database Session (`get_db_session`)

The most common dependency, located in `app/db.py`. It provides a scoped SQLAlchemy `AsyncSession` for each request.

```python
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_maker()() as session:
        yield session
```

- **Scoped Lifecycle**: The session is opened when the request starts and closed automatically when the request finishes (or errors).
- **Transaction Management**: Services are expected to handle their own `session.commit()` calls unless part of a broader transaction.

### 2. Configuration (`get_settings`)

Provides access to the application's typed settings.

```python
from app.core.config import get_settings

@router.get("/config")
async def read_config(settings: Settings = Depends(get_settings)):
    return {"project": settings.project_name}
```

## Security Dependencies (Future)

While not currently implemented in v1, the DI system is prepared to handle:

- **`get_current_user`**: For authentication and session validation.
- **`check_permissions`**: For attribute-based access control.

## Testing with Overrides

FastAPI's DI system allows for easy mocking during tests using `app.dependency_overrides`.

```python
@pytest.fixture
def override_db(mock_session):
    app.dependency_overrides[get_db_session] = lambda: mock_session
    yield
    app.dependency_overrides.clear()
```

## Scoped vs Global Dependencies

- **Route Dependencies**: Defined at the endpoint or router level using `Depends()`.
- **Global Dependencies**: Defined when creating the `FastAPI` instance. FormFoundry uses global dependencies for things like request logging and instrumentation.
