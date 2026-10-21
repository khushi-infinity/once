"""Private S3 evidence storage (live mode).

Uploads are consent-gated by the caller; objects go to a fully private bucket
(ACLs blocked, encryption enforced). Only object *references* ever enter skill
records — never raw bytes, never public URLs.
"""
import boto3
from botocore.exceptions import ClientError

from app.config import get_settings


def _client():
    settings = get_settings()
    session = (
        boto3.Session(profile_name=settings.aws_profile) if settings.aws_profile else boto3.Session()
    )
    return session.client("s3", region_name=settings.aws_region)


def upload_evidence(key: str, data: bytes, content_type: str = "image/jpeg") -> str:
    """Put one consented evidence object. Returns the object key (reference)."""
    settings = get_settings()
    if not settings.s3_evidence_bucket:
        raise RuntimeError("S3_EVIDENCE_BUCKET not configured")
    _client().put_object(
        Bucket=settings.s3_evidence_bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        ServerSideEncryption="AES256",
    )
    return key


def get_evidence(key: str) -> bytes:
    settings = get_settings()
    resp = _client().get_object(Bucket=settings.s3_evidence_bucket, Key=key)
    try:
        return resp["Body"].read()
    finally:
        resp["Body"].close()


def delete_evidence(key: str) -> None:
    settings = get_settings()
    _client().delete_object(Bucket=settings.s3_evidence_bucket, Key=key)


def object_exists(key: str) -> bool:
    settings = get_settings()
    try:
        _client().head_object(Bucket=settings.s3_evidence_bucket, Key=key)
        return True
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return False
        raise
