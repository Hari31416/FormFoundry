# Routing

The FormFoundry API is structured using nested FastAPI routers for modularity and clarity.

## Central Router

The main router is defined in `app/api/router.py`. It aggregates all feature-specific routers and applies global prefixes and tags.

| Prefix          | Router                | Tags           | Responsibility                  |
| :-------------- | :-------------------- | :------------- | :------------------------------ |
| `/health`       | `health_router`       | `health`       | System health checks            |
| `/templates`    | `templates_router`    | `templates`    | Template registry management    |
| `/cases`        | `cases_router`        | `cases`        | Case lifecycle and state        |
| `/intake`       | `intake_router`       | `intake`       | Evidence ingestion              |
| `/extraction`   | `extraction_router`   | `extraction`   | Job status and candidate review |
| `/conversation` | `conversation_router` | `conversation` | Interactive chat logic          |
| `/validation`   | `validation_router`   | `validation`   | Issue tracking                  |
| `/artifacts`    | `artifacts_router`    | `artifacts`    | Document generation             |

## Router Implementation Pattern

Every router follows a consistent pattern:

```python
router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]

@router.get("/{item_id}", response_model=ItemSchema)
async def get_item(item_id: str, session: DBSession) -> Item:
    item = await service.get_item(session, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item
```

- **Type Annotations**: Uses `Annotated` for dependencies to improve readability and IDE support.
- **Service Delegation**: Routes delegate business logic to the service layer.
- **Response Models**: All routes use Pydantic models for response serialization.
- **Error Handling**: Uses `fastapi.HTTPException` for standard error responses.

## Request Lifecycle

1. **Path/Query Validation**: FastAPI validates parameters against type hints.
2. **Body Validation**: Pydantic validates the request body against the schema.
3. **Dependency Resolution**: Injectors like `get_db_session` are executed.
4. **Endpoint Execution**: The route function is called.
5. **Response Serialization**: The return value is serialized to JSON using the `response_model`.
