from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from pathlib import Path

from minio import Minio

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


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

    async def read_bytes(self, storage_uri: str) -> bytes:
        raise NotImplementedError

    async def get_download_url(self, storage_uri: str) -> str:
        raise NotImplementedError


class LocalStorageService(StorageService):
    def __init__(self, base_path: Path) -> None:
        self.base_path = base_path

    async def store_bytes(
        self, *, object_key: str, payload: bytes, content_type: str
    ) -> StoredObject:
        logger.info(
            "storage.local.store_bytes.started",
            extra={
                "object_key": object_key,
                "size_bytes": len(payload),
                "content_type": content_type,
            },
        )
        target = self.base_path / object_key
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        uri = f"local://{target.relative_to(self.base_path)}"
        logger.info(
            "storage.local.store_bytes.completed",
            extra={
                "object_key": object_key,
                "size_bytes": len(payload),
                "storage_uri": uri,
            },
        )
        return StoredObject(
            storage_uri=uri,
            content_type=content_type,
            size_bytes=len(payload),
        )

    async def get_download_url(self, storage_uri: str) -> str:
        logger.info(
            "storage.local.get_download_url", extra={"storage_uri": storage_uri}
        )
        return storage_uri

    async def read_bytes(self, storage_uri: str) -> bytes:
        logger.info(
            "storage.local.read_bytes.started", extra={"storage_uri": storage_uri}
        )
        if not storage_uri.startswith("local://"):
            logger.error(
                "storage.local.read_bytes.failed",
                extra={"storage_uri": storage_uri, "reason": "invalid_uri_scheme"},
            )
            raise FileNotFoundError(f"Unsupported local storage URI: {storage_uri}")
        relative_path = storage_uri.replace("local://", "", 1)
        payload = (self.base_path / relative_path).read_bytes()
        logger.info(
            "storage.local.read_bytes.completed",
            extra={"storage_uri": storage_uri, "size_bytes": len(payload)},
        )
        return payload


class S3StorageService(StorageService):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client = Minio(
            settings.s3_endpoint,
            access_key=settings.s3_access_key,
            secret_key=settings.s3_secret_key,
            secure=settings.s3_secure,
        )
        if not self.client.bucket_exists(settings.s3_bucket):
            logger.info(
                "storage.s3.create_bucket", extra={"bucket": settings.s3_bucket}
            )
            self.client.make_bucket(settings.s3_bucket)

    async def store_bytes(
        self, *, object_key: str, payload: bytes, content_type: str
    ) -> StoredObject:
        logger.info(
            "storage.s3.store_bytes.started",
            extra={
                "bucket": self.settings.s3_bucket,
                "object_key": object_key,
                "size_bytes": len(payload),
                "content_type": content_type,
            },
        )
        self.client.put_object(
            bucket_name=self.settings.s3_bucket,
            object_name=object_key,
            data=io.BytesIO(payload),
            length=len(payload),
            content_type=content_type,
        )
        uri = f"s3://{self.settings.s3_bucket}/{object_key}"
        logger.info(
            "storage.s3.store_bytes.completed",
            extra={
                "bucket": self.settings.s3_bucket,
                "object_key": object_key,
                "storage_uri": uri,
            },
        )
        return StoredObject(
            storage_uri=uri,
            content_type=content_type,
            size_bytes=len(payload),
        )

    async def get_download_url(self, storage_uri: str) -> str:
        logger.info(
            "storage.s3.get_download_url.started", extra={"storage_uri": storage_uri}
        )
        if not storage_uri.startswith("s3://"):
            return storage_uri

        path_part = storage_uri.replace("s3://", "")
        bucket, key = path_part.split("/", 1)
        url = self.client.presigned_get_object(
            bucket_name=bucket,
            object_name=key,
        )
        logger.info(
            "storage.s3.get_download_url.completed",
            extra={"storage_uri": storage_uri},
        )
        return url

    async def read_bytes(self, storage_uri: str) -> bytes:
        logger.info("storage.s3.read_bytes.started", extra={"storage_uri": storage_uri})
        if not storage_uri.startswith("s3://"):
            logger.error(
                "storage.s3.read_bytes.failed",
                extra={"storage_uri": storage_uri, "reason": "invalid_uri_scheme"},
            )
            raise FileNotFoundError(f"Unsupported s3 storage URI: {storage_uri}")

        path_part = storage_uri.replace("s3://", "", 1)
        bucket, key = path_part.split("/", 1)
        response = self.client.get_object(bucket_name=bucket, object_name=key)
        try:
            payload = response.read()
            logger.info(
                "storage.s3.read_bytes.completed",
                extra={"storage_uri": storage_uri, "size_bytes": len(payload)},
            )
            return payload
        finally:
            response.close()
            response.release_conn()


def get_storage_service() -> StorageService:
    settings = get_settings()
    if settings.storage_backend == "s3":
        return S3StorageService(settings)
    return LocalStorageService(settings.local_storage_path)
