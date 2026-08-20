"""
Edit infographic content directly (human-in-the-loop).

GET  /papers/summarize/{job_id}/infographic/content?template_id=stat_grid
     Returns the current content JSON for editing.

PUT  /papers/summarize/{job_id}/infographic/content
     Body: { "template_id": "stat_grid", "content": {...} }
     Validates, re-renders, and saves without AI.
"""

import json
import os
import traceback
import xml.etree.ElementTree as ET
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError
from pydantic import ValidationError

from render import render
from schemas import TEMPLATE_REGISTRY

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

BUCKET_NAME = os.environ["BUCKET_NAME"]

TEMPLATE_ALIASES = {
    "template-1": "stat_grid",
    "template-2": "method_steps",
    "template-3": "key_findings",
}

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,PUT",
    "Access-Control-Max-Age": "86400",
}


def _response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_dict),
    }


def _set_infographic_status(job_id, template_id, status):
    status_attr = f"infographic_{template_id}_status"
    try:
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #s = :s",
            ExpressionAttributeNames={"#s": status_attr},
            ExpressionAttributeValues={":s": status},
        )
    except ClientError:
        pass


def handler(event, context):
    http_method = event.get("httpMethod", "").upper()

    # Handle CORS preflight
    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": "",
        }

    job_id = (event.get("pathParameters") or {}).get("job_id")
    if not job_id:
        return _response(400, {"error": "Missing job_id"})

    if http_method == "GET":
        return handle_get(event, job_id)
    elif http_method == "PUT":
        return handle_put(event, job_id)
    else:
        return _response(405, {"error": f"Method {http_method} not allowed"})


def handle_get(event, job_id):
    """Fetch content JSON for a template."""
    query_params = event.get("queryStringParameters") or {}
    requested = query_params.get("template_id")

    if not requested:
        return _response(400, {"error": "template_id query parameter is required"})

    template_id = TEMPLATE_ALIASES.get(requested, requested)
    if template_id not in TEMPLATE_REGISTRY:
        return _response(400, {"error": "Invalid template_id", "valid": sorted(TEMPLATE_REGISTRY)})

    content_s3_key = f"infographics/{job_id}/{template_id}.json"
    try:
        content_obj = s3.get_object(Bucket=BUCKET_NAME, Key=content_s3_key)
        content = json.loads(content_obj["Body"].read().decode("utf-8"))
    except ClientError as e:
        if e.response["Error"]["Code"] in ("NoSuchKey", "404"):
            return _response(404, {
                "error": "No infographic content found",
                "hint": "Generate the infographic first",
            })
        return _response(502, {"error": "Could not read content from S3", "detail": str(e)})
    except json.JSONDecodeError:
        return _response(500, {"error": "Stored content is corrupted"})

    # Get verification status from DynamoDB
    verification_status = None
    verification_failures = None
    try:
        job = table.get_item(Key={"job_id": job_id}, ConsistentRead=True).get("Item", {})
        verification_status = job.get(f"infographic_{template_id}_verification")
        raw_failures = job.get(f"infographic_{template_id}_failures")
        if raw_failures:
            verification_failures = [
                {k: (int(v) if isinstance(v, Decimal) else v) for k, v in f.items()}
                for f in raw_failures
            ]
    except ClientError:
        pass

    # Get schema field info for the frontend
    content_type = TEMPLATE_REGISTRY[template_id]
    schema_info = {}
    for field_name, field_info in content_type.model_fields.items():
        field_type = field_info.annotation
        max_length = None
        if hasattr(field_type, "__metadata__"):
            for meta in field_type.__metadata__:
                if hasattr(meta, "max_length"):
                    max_length = meta.max_length
        schema_info[field_name] = {
            "description": field_info.description or "",
            "max_length": max_length,
        }

    response_body = {
        "job_id": job_id,
        "template_id": template_id,
        "content": content,
        "schema": schema_info,
    }

    if verification_status:
        response_body["verification_status"] = verification_status
    if verification_failures:
        response_body["verification_failures"] = verification_failures

    return _response(200, response_body)


def handle_put(event, job_id):
    """Validate and save edited content, re-render SVG."""
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Request body is not valid JSON"})

    requested = body.get("template_id")
    content = body.get("content")
    preview_only = body.get("preview", False)

    if not requested:
        return _response(400, {"error": "template_id is required"})
    if not content or not isinstance(content, dict):
        return _response(400, {"error": "content object is required"})

    template_id = TEMPLATE_ALIASES.get(requested, requested)
    if template_id not in TEMPLATE_REGISTRY:
        return _response(400, {"error": "Invalid template_id", "valid": sorted(TEMPLATE_REGISTRY)})

    content_type = TEMPLATE_REGISTRY[template_id]

    # Validate content against schema
    try:
        validated = content_type.model_validate(content)
        content_dict = validated.model_dump()
    except ValidationError as e:
        return _response(422, {
            "error": "Content validation failed",
            "detail": e.errors(include_url=False),
        })

    # Render SVG
    try:
        svg_content = render(template_id, content_dict)
        ET.fromstring(svg_content)
    except Exception as e:
        return _response(500, {
            "error": "Render failed",
            "detail": str(e),
        })

    # If preview only, return SVG without saving
    if preview_only:
        return _response(200, {
            "job_id": job_id,
            "template_id": template_id,
            "svg_content": svg_content,
            "preview": True,
        })

    # Save to S3
    s3_key = f"infographics/{job_id}/{template_id}.svg"
    content_s3_key = f"infographics/{job_id}/{template_id}.json"
    try:
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=svg_content.encode("utf-8"),
            ContentType="image/svg+xml",
            CacheControl="public, max-age=3600",
        )
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=content_s3_key,
            Body=json.dumps(content_dict).encode("utf-8"),
            ContentType="application/json",
        )
    except ClientError as e:
        return _response(502, {"error": "S3 write failed", "detail": str(e)})

    _set_infographic_status(job_id, template_id, "completed")

    return _response(200, {
        "job_id": job_id,
        "template_id": template_id,
        "svg_content": svg_content,
        "s3_key": s3_key,
    })
