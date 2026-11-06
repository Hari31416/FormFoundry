from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from anyio import CapacityLimiter
from anyio.to_thread import run_sync
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import SchemaAccessRecord, UserRecord
from app.cases.models import CaseFileRecord
from app.core.config import get_settings
from app.db import get_db_session

hasher = PasswordHasher()
DUMMY_HASH = hasher.hash("unused-login-placeholder")
HASH_LIMITER = CapacityLimiter(4)
oauth2 = OAuth2PasswordBearer(tokenUrl=f"{get_settings().api_prefix}/auth/token")
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


def expired(value: datetime | None) -> bool:
    return value is not None and value.replace(
        tzinfo=value.tzinfo or UTC
    ) <= datetime.now(UTC)


async def hash_password(password: str) -> str:
    return await run_sync(hasher.hash, password, limiter=HASH_LIMITER)


async def verify_password(password: str, stored: str) -> bool:
    try:
        return await run_sync(hasher.verify, stored, password, limiter=HASH_LIMITER)
    except (VerificationError, InvalidHashError):
        return False


def issue_token(user: UserRecord) -> str:
    settings = get_settings()
    if settings.jwt_secret is None:
        raise RuntimeError("JWT_SECRET is required")
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": user.id,
            "iss": settings.jwt_issuer,
            "iat": now,
            "exp": now + timedelta(minutes=settings.jwt_lifetime_minutes),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


async def get_current_user(
    session: DBSession, token: Annotated[str, Depends(oauth2)]
) -> UserRecord:
    settings = get_settings()
    unauthorized = HTTPException(
        401, "Invalid or expired credentials", headers={"WWW-Authenticate": "Bearer"}
    )
    if settings.jwt_secret is None:
        raise unauthorized
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "iss", "iat", "exp"]},
        )
    except jwt.InvalidTokenError:
        raise unauthorized from None
    user = await session.get(UserRecord, payload["sub"])
    if user is None or user.disabled or expired(user.expires_at):
        raise unauthorized
    return user


CurrentUser = Annotated[UserRecord, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> UserRecord:
    if user.role != "admin":
        raise HTTPException(403, "Administrator access required")
    return user


Admin = Annotated[UserRecord, Depends(require_admin)]


async def require_schema_access(
    session: AsyncSession, user: UserRecord, template_id: str
) -> None:
    if (
        user.role != "admin"
        and await session.get(SchemaAccessRecord, (user.id, template_id)) is None
    ):
        raise HTTPException(404, "Schema not found")


async def authorize_resource(
    request: Request, session: DBSession, user: CurrentUser
) -> None:
    """Runs on every protected router, including nested case resource routes."""
    case_id = request.path_params.get("case_id")
    if case_id is not None:
        case = await session.get(CaseFileRecord, case_id)
        if case is None or case.created_by != user.id:
            raise HTTPException(404, "Case not found")
        await require_schema_access(session, user, case.template_id)
    template_id = request.path_params.get("template_id")
    if template_id is not None:
        await require_schema_access(session, user, template_id)
    if (
        request.url.path.startswith(f"{get_settings().api_prefix}/templates")
        and request.method != "GET"
    ):
        await require_admin(user)


async def bootstrap_admin(session: AsyncSession) -> None:
    settings = get_settings()
    if settings.jwt_secret is None:
        raise RuntimeError(
            "Set JWT_SECRET to at least 32 characters before starting the backend"
        )
    if await session.scalar(
        select(UserRecord.id).where(UserRecord.role == "admin").limit(1)
    ):
        return
    if (
        settings.bootstrap_admin_password is None
        or not settings.bootstrap_admin_username
    ):
        raise RuntimeError(
            "Set BOOTSTRAP_ADMIN_USERNAME and BOOTSTRAP_ADMIN_PASSWORD "
            "for the initial administrator"
        )
    password = settings.bootstrap_admin_password.get_secret_value()
    if not 12 <= len(password) <= 256:
        raise RuntimeError("Bootstrap password must contain 12 to 256 characters")
    session.add(
        UserRecord(
            username=settings.bootstrap_admin_username.lower(),
            password_hash=await hash_password(password),
            role="admin",
        )
    )
    await session.commit()
