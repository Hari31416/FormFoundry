from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from urllib.parse import quote_plus, unquote

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    project_name: str = "FormFoundry"
    environment: str = "local"
    api_prefix: str = "/api/v1"
    database_url_override: str | None = Field(default=None, alias="DATABASE_URL")
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_port: int = 5173
    frontend_allowed_hosts: str = "localhost,127.0.0.1"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "formfoundry"
    postgres_user: str = "formfoundry"
    postgres_password: str = "formfoundry"

    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = "redis"

    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "formfoundry"
    minio_secret_key: str = "formfoundry123"
    minio_secure: bool = False
    minio_bucket: str = "formfoundry-assets"

    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_api_key: str = "qdrant-local-key"

    storage_backend: str = "local"
    local_storage_path: Path = Field(default=Path("../.storage"))
    template_config_dir: Path = Field(default=Path("app/templates/configs"))
    auto_run_jobs: bool = True
    resolution_threshold: float = 0.78
    low_confidence_threshold: float = 0.6

    llm_enabled: bool = False
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str = "gpt-4.1-mini"
    llm_timeout_seconds: float = 30.0
    llm_temperature: float = 0.1

    @property
    def decoded_postgres_password(self) -> str:
        return unquote(self.postgres_password)

    @property
    def decoded_redis_password(self) -> str:
        return unquote(self.redis_password)

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        password = quote_plus(self.decoded_postgres_password)
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def sync_database_url(self) -> str:
        if self.database_url_override:
            if self.database_url_override.startswith("sqlite+aiosqlite"):
                return self.database_url_override.replace(
                    "sqlite+aiosqlite", "sqlite", 1
                )
            if self.database_url_override.startswith("postgresql+asyncpg"):
                return self.database_url_override.replace(
                    "postgresql+asyncpg", "postgresql", 1
                )
            return self.database_url_override
        password = quote_plus(self.decoded_postgres_password)
        return (
            f"postgresql://{self.postgres_user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        return (
            f"redis://:{self.decoded_redis_password}@{self.redis_host}:"
            f"{self.redis_port}/{self.redis_db}"
        )

    @property
    def allowed_hosts(self) -> list[str]:
        return [
            host.strip()
            for host in self.frontend_allowed_hosts.split(",")
            if host.strip()
        ]

    @property
    def resolved_template_config_dir(self) -> Path:
        candidate = self.template_config_dir
        if candidate.is_absolute():
            return candidate
        return Path(__file__).resolve().parents[2] / candidate

    @property
    def llm_is_configured(self) -> bool:
        return bool(
            self.llm_enabled
            and self.llm_model
            and (self.llm_api_key or self.llm_base_url)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
