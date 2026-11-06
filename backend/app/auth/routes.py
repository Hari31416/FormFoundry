from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.auth.models import SchemaAccessRecord, UserRecord
from app.auth.service import (
    DUMMY_HASH,
    Admin,
    CurrentUser,
    DBSession,
    expired,
    hash_password,
    issue_token,
    verify_password,
)
from app.templates.models import TemplateDefinitionRecord

router = APIRouter(prefix="/auth", tags=["authentication"])


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    role: Literal["admin", "user"]
    disabled: bool
    expires_at: datetime | None


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=80, pattern=r"^[A-Za-z0-9_.@-]+$")
    password: str = Field(min_length=12, max_length=256)
    role: Literal["admin", "user"] = "user"


class UserUpdate(BaseModel):
    disabled: bool
    expires_at: datetime | None = None

    @field_validator("expires_at")
    @classmethod
    def timezone_required(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.utcoffset() is None:
            raise ValueError("Expiry must include a timezone")
        return value


class SchemaAccessUpdate(BaseModel):
    template_ids: list[str] = Field(max_length=1000)


@router.post("/token")
async def login(
    session: DBSession, form: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> dict[str, str]:
    user = await session.scalar(
        select(UserRecord).where(UserRecord.username == form.username.lower())
    )
    valid = await verify_password(
        form.password[:256], user.password_hash if user else DUMMY_HASH
    )
    if (
        not valid
        or len(form.password) > 256
        or user is None
        or user.disabled
        or expired(user.expires_at)
    ):
        raise HTTPException(
            401,
            "Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {"access_token": issue_token(user), "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def me(user: CurrentUser) -> UserRecord:
    return user


@router.get("/users", response_model=list[UserResponse])
async def list_users(session: DBSession, admin: Admin):
    return (
        await session.scalars(select(UserRecord).order_by(UserRecord.username))
    ).all()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    payload: UserCreate, session: DBSession, admin: Admin
) -> UserRecord:
    user = UserRecord(
        username=payload.username.lower(),
        password_hash=await hash_password(payload.password),
        role=payload.role,
    )
    session.add(user)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Username already exists") from None
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str, payload: UserUpdate, session: DBSession, admin: Admin
) -> UserRecord:
    user = await session.get(UserRecord, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    # Admin accounts remain active. This also prevents concurrent last-admin removal.
    if user.role == "admin" and (payload.disabled or payload.expires_at is not None):
        raise HTTPException(409, "Administrator accounts cannot be disabled or expired")
    user.disabled, user.expires_at = payload.disabled, payload.expires_at
    await session.commit()
    return user


@router.get("/users/{user_id}/schemas", response_model=list[str])
async def get_access(user_id: str, session: DBSession, admin: Admin):
    if await session.get(UserRecord, user_id) is None:
        raise HTTPException(404, "User not found")
    return (
        await session.scalars(
            select(SchemaAccessRecord.template_id).where(
                SchemaAccessRecord.user_id == user_id
            )
        )
    ).all()


@router.put("/users/{user_id}/schemas", response_model=list[str])
async def set_access(
    user_id: str, payload: SchemaAccessUpdate, session: DBSession, admin: Admin
) -> list[str]:
    user = await session.scalar(
        select(UserRecord).where(UserRecord.id == user_id).with_for_update()
    )
    if user is None:
        raise HTTPException(404, "User not found")
    ids = sorted(set(payload.template_ids))
    available = set(
        (
            await session.scalars(
                select(TemplateDefinitionRecord.template_id).where(
                    TemplateDefinitionRecord.template_id.in_(ids)
                )
            )
        ).all()
    )
    if set(ids) != available:
        raise HTTPException(422, "Unknown schema")
    await session.execute(
        delete(SchemaAccessRecord).where(SchemaAccessRecord.user_id == user_id)
    )
    session.add_all(SchemaAccessRecord(user_id=user_id, template_id=tid) for tid in ids)
    await session.commit()
    return ids
