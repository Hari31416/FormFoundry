from __future__ import annotations

import io
from dataclasses import dataclass
from pathlib import Path

from minio import Minio

from app.core.config import Settings, get_settings


@dataclass(slots=True)
class StoredObject:
    storage_uri: str
    content_type: str
    size_bytes: int


class StorageService:
    async def store_bytes(
        self, *, object_key: str, payload: bytes, content_type: str
    ) -> StoredObject:
        raise NotImplementedError


class LocalStorageService(StorageService):
    def __init__(self, base_path: Path) -> None:
        self.base_path = base_path

    async def store_bytes(
        self, *, object_key: str, payload: bytes, content_type: str
    ) -> StoredObject:
        target = self.base_path / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        return StoredObject(
            storage_uri=f"local://{target.relative_to(self.base_path)}",
            content_type=content_type,
            size_bytes=len(payload),
        )


class MinioStorageService(StorageService):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        if not self.client.bucket_exists(settings.minio_bucket):
            self.client.make_bucket(settings.minio_bucket)

    async def store_bytes(
        self, *, object_key: str, payload: bytes, content_type: str
    ) -> StoredObject:
        self.client.put_object(
            bucket_name=self.settings.minio_bucket,
            object_name=object_key,
            data=io.BytesIO(payload),
            length=len(payload),
            content_type=content_type,
        )
        return StoredObject(
            storage_uri=f"s3://{self.settings.minio_bucket}/{object_key}",
            content_type=content_type,
            size_bytes=len(payload),
        )


def get_storage_service() -> StorageService:
    settings = get_settings()
    if settings.storage_backend == "minio":
        return MinioStorageService(settings)
    return LocalStorageService(settings.local_storage_path)
