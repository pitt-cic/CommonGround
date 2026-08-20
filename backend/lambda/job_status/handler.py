"""
Common Ground - Job Status Lambda

GET /papers/summarize/{job_id}
Response: { "job_status": "processing" | "completed" | "failed", "summary": "...", ... }
"""

import json
import os
from decimal import Decimal

import boto3
from botocore.client import Config

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

BUCKET_NAME = os.environ.get("BUCKET_NAME")
s3 = boto3.client("s3", config=Config(signature_version="s3v4"))


def _add_infographic_urls(item):
    """Convert infographic_keys S3 paths to presigned URLs."""
    if not BUCKET_NAME:
        return item

    infographic_keys = item.get("infographic_keys")
    if not infographic_keys or not isinstance(infographic_keys, dict):
        return item

    urls = {}
    for template_id, s3_key in infographic_keys.items():
        try:
            urls[template_id] = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": BUCKET_NAME, "Key": s3_key},
                ExpiresIn=1800,  # 30 minutes
            )
        except Exception:
            pass

    if urls:
        item["infographic_urls"] = urls

    return item


def handler(event, context):
    try:
        job_id = event.get("pathParameters", {}).get("job_id")

        if not job_id:
            return _response(400, {"error": "job_id is required"})

        response = table.get_item(Key={"job_id": job_id})
        item = response.get("Item")

        if not item:
            return _response(404, {"error": "Job not found", "job_id": job_id})

        item = _add_infographic_urls(item)

        return _response(200, item)

    except Exception as e:
        print(f"Job status handler error: {e}")
        return _response(500, {"error": "Internal server error"})


def _response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body_dict, default=lambda o: float(o) if isinstance(o, Decimal) else str(o)),
    }
