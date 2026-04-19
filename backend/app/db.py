from __future__ import annotations

from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings
from app.models.base import Base


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(settings.database_url, future=True, pool_pre_ping=True)


@lru_cache
def get_session_maker() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), autoflush=False, expire_on_commit=False)


async def init_db() -> None:
    # Import all models to ensure they are registered with Base.metadata
    from app.cases.models import (  # noqa: F401
        ArtifactRecord,
        CaseFileRecord,
        FieldStateRecord,
    )
    from app.conversation.models import ConversationTurnRecord  # noqa: F401
    from app.extraction.models import FieldCandidateRecord  # noqa: F401
    from app.intake.models import EvidenceRecord  # noqa: F401
    from app.jobs.models import JobRecord  # noqa: F401
    from app.resolution.models import ResolutionAuditRecord  # noqa: F401
    from app.templates.models import TemplateDefinitionRecord  # noqa: F401
    from app.validation.models import ValidationIssueRecord  # noqa: F401

    async with get_engine().begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_maker()() as session:
        yield session


async def dispose_engine() -> None:
    if get_engine.cache_info().currsize:
        await get_engine().dispose()
    get_engine.cache_clear()
    get_session_maker.cache_clear()
