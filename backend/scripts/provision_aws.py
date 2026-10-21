"""ONCE AWS infrastructure provisioning (idempotent, least-priv runtime identity).

Creates only the resources ONCE actually uses:
  - DynamoDB tables ONCE_Skills (PK skillId, GSI owner-index)
                     and ONCE_Sessions (PK sessionId, GSI skill-learner-index), on-demand billing;
  - S3 evidence bucket: private (all four public-access blocks on), default SSE-S3
    encryption, bucket-owner-enforced ACLs.

Safe to re-run: every step checks-before-creates or is update-if-different.
Run with the *admin* profile (one-time setup, e.g. the `aws login` session):

    cd backend && AWS_PROFILE=once uv run python scripts/provision_aws.py

The application/runtime itself never needs these admin privileges — it runs as
the scoped IAM user described in AWS_SETUP.md (rw only on these two tables and
the evidence objects).
"""
import json
import os
import sys

import boto3
from botocore.exceptions import ClientError

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import get_settings  # noqa: E402


def main() -> int:
    s = get_settings()
    session = boto3.Session(profile_name=s.aws_profile) if s.aws_profile else boto3.Session()
    region = s.aws_region
    created: list[str] = []

    # -- DynamoDB tables ------------------------------------------------------
    ddb = session.resource("dynamodb", region_name=region)
    client = ddb.meta.client

    def table_exists(name: str) -> bool:
        try:
            client.describe_table(TableName=name)
            return True
        except ClientError:
            return False

    specs = [
        (
            s.dynamodb_skills_table,
            [{"AttributeName": "skillId", "KeyType": "HASH"}],
            [{"AttributeName": "skillId", "AttributeType": "S"}],
            ("owner-index", [{"AttributeName": "ownerId", "KeyType": "HASH"}],
             [{"AttributeName": "ownerId", "AttributeType": "S"}]),
        ),
        (
            s.dynamodb_sessions_table,
            [{"AttributeName": "sessionId", "KeyType": "HASH"}],
            [{"AttributeName": "sessionId", "AttributeType": "S"}],
            ("skill-learner-index", [{"AttributeName": "skillLearner", "KeyType": "HASH"}],
             [{"AttributeName": "skillLearner", "AttributeType": "S"}]),
        ),
    ]

    for name, keys, attrs, (gsi_name, gsi_keys, gsi_attrs) in specs:
        if table_exists(name):
            print(f"[exists] table={name}")
        else:
            client.create_table(
                TableName=name,
                KeySchema=keys,
                AttributeDefinitions=[*attrs, *gsi_attrs],
                BillingMode="PAY_PER_REQUEST",
                GlobalSecondaryIndexes=[{
                    "IndexName": gsi_name,
                    "KeySchema": gsi_keys,
                    "Projection": {"ProjectionType": "ALL"},
                }],
            )
            client.get_waiter("table_exists").wait(
                TableName=name, WaiterConfig={"Delay": 2, "MaxAttempts": 30}
            )
            created.append(f"table:{name}")
            print(f"[created] table={name} gsis={[gsi_name]} billing=PAY_PER_REQUEST")

    # -- S3 evidence bucket ---------------------------------------------------
    s3 = session.client("s3", region_name=region)
    bucket = s.s3_evidence_bucket
    if not bucket:
        print("[skip] S3_EVIDENCE_BUCKET not configured")
    else:
        try:
            s3.head_bucket(Bucket=bucket)
            print(f"[exists] bucket={bucket}")
        except (ClientError, ValueError):
            params: dict = {"Bucket": bucket}
            if region != "us-east-1":
                params["CreateBucketConfiguration"] = {"LocationConstraint": region}
            s3.create_bucket(**params)
            created.append(f"bucket:{bucket}")
            print(f"[created] bucket={bucket}")

        s3.put_public_access_block(
            Bucket=bucket,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": True,
                "IgnorePublicAcls": True,
                "BlockPublicPolicy": True,
                "RestrictPublicBuckets": True,
            },
        )
        s3.put_bucket_encryption(
            Bucket=bucket,
            ServerSideEncryptionConfiguration={"Rules": [
                {"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}
            ]},
        )
        s3.put_bucket_ownership_controls(
            Bucket=bucket,
            OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
        )
        print(f"[secured] bucket={bucket} public_access=blocked encryption=SSE-S3 ownership=enabled")

    print("\nSummary:", json.dumps({"created": created}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
