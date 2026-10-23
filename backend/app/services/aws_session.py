"""AWS session construction shared by live data services."""
import os

import boto3

from app.config import get_settings


def aws_session():
    """Build a boto3 session from the configured profile or default chain.

    Some hosts inject ``AWS_PROFILE=`` (an empty string). Botocore treats that
    as a profile named ``""`` and raises ProfileNotFound before it ever reaches
    the environment credentials. Drop the empty value so the normal provider
    chain (including task/instance roles and env keys) can work.
    """
    settings = get_settings()
    profile = (settings.aws_profile or "").strip()
    if profile:
        return boto3.Session(profile_name=profile)
    if os.environ.get("AWS_PROFILE") == "":
        os.environ.pop("AWS_PROFILE", None)
    return boto3.Session()
