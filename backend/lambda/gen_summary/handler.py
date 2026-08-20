"""
Common Ground - Async Summarize Trigger Lambda
Path: backend/lambda/gen_summary/handler.py

POST /papers/summarize
Request body:  { "s3_key": "papers/uuid/some_paper.pdf", "audience": "general_public" | "clinicians" | "academic_health_researchers", "model": "sonnet-4-6" }
Response:      { "job_id": "uuid" }

The actual summary will be written to s3://bucket/summaries/{job_id}.json when ready.
"""

import json
import os
import time
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

lambda_client = boto3.client("lambda")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

DAILY_SUMMARIZE_LIMIT = 25


def _check_and_increment_daily_limit(user_sub: str) -> bool:
    """Atomically increments today's counter for user_sub. Returns False if over limit."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    rate_key = f"ratelimit#{user_sub}#{today}"
    try:
        table.update_item(
            Key={"job_id": rate_key},
            UpdateExpression="ADD #count :one SET #ttl = if_not_exists(#ttl, :ttl)",
            ConditionExpression="attribute_not_exists(#count) OR #count < :limit",
            ExpressionAttributeNames={"#count": "count", "#ttl": "ttl"},
            ExpressionAttributeValues={
                ":one": 1,
                ":ttl": int(time.time()) + 2 * 86400,
                ":limit": DAILY_SUMMARIZE_LIMIT,
            },
        )
        return True
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return False
        return True  # fail open on unexpected errors

SUMMARIZE_FUNCTION = os.environ["SUMMARIZE_FUNCTION_NAME"]
GENERATE_INFOGRAPHIC_FUNCTION = os.environ.get("GENERATE_INFOGRAPHIC_FUNCTION_NAME")
BUCKET_NAME = os.environ["BUCKET_NAME"]

VALID_AUDIENCES = ["general_public", "clinicians", "academic_health_researchers", "custom_audience"]
VALID_OUTPUT_FORMATS = ["summary", "press_release", "blog_post", "linkedin_post", "x_post"]
VALID_MODELS = ["sonnet-4-6"]
VALID_INFOGRAPHIC_TEMPLATES = ["stat_grid", "key_findings", "method_steps", "pull_quote", "comparison"]


def handler(event, context):
    try:
        # Support both API Gateway (body) and direct invocation formats
        if "body" in event:
            body = json.loads(event.get("body") or "{}")
        else:
            body = event

        s3_key = body.get("s3_key")
        audience = body.get("audience")
        custom_audience_details = body.get("custom_audience_details")  # Optional custom audience info
        output_format = body.get("output_format", "summary")  # Default to summary
        model = body.get("model", "sonnet-4-6")  # Default to sonnet-4-6
        infographic_template = body.get("infographic_template")  # Optional infographic template

        if not s3_key:
            return _response(400, {"error": "s3_key is required"})
        if audience not in VALID_AUDIENCES:
            return _response(
                400,
                {"error": f"audience must be one of {VALID_AUDIENCES}"},
            )

        # If custom_audience is selected, require custom_audience_details
        if audience == "custom_audience" and not custom_audience_details:
            return _response(
                400,
                {"error": "custom_audience_details is required when audience is 'custom_audience'"},
            )
        if output_format not in VALID_OUTPUT_FORMATS:
            return _response(
                400,
                {"error": f"output_format must be one of {VALID_OUTPUT_FORMATS}"},
            )

        # Validate model selection
        if model not in VALID_MODELS:
            return _response(400, {"error": f"Invalid model: {model}. Must be one of: {VALID_MODELS}"})

        # Validate infographic template if provided
        if infographic_template and infographic_template not in VALID_INFOGRAPHIC_TEMPLATES:
            return _response(400, {"error": f"Invalid infographic_template: {infographic_template}. Must be one of: {VALID_INFOGRAPHIC_TEMPLATES}"})

        # Get caller identity from Cognito authorizer
        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        user_email = claims.get("email")
        user_sub = claims.get("sub")

        # Per-user daily rate limit (API Gateway path only)
        if user_sub and "requestContext" in event:
            if not _check_and_increment_daily_limit(user_sub):
                return _response(429, {"error": f"Daily limit of {DAILY_SUMMARIZE_LIMIT} generations reached. Try again tomorrow."})

        # Generate a job ID
        job_id = str(uuid.uuid4())

        # Write a pending marker to DynamoDB so job status endpoint can distinguish
        # between non-existent and in-progress jobs
        item = {
            "job_id": job_id,
            "job_status": "processing",
            "audience": audience,
            "output_format": output_format,
            "claude_model": model,
            "s3_key": s3_key,
            "messages": [],
            "ttl": int(time.time()) + 30 * 86400,
        }
        if user_email:
            item["user_email"] = user_email
        if custom_audience_details:
            item["custom_audience_details"] = custom_audience_details
        if infographic_template:
            item["infographic_template"] = infographic_template
            item[f"infographic_{infographic_template}_status"] = "pending"

        table.put_item(Item=item)

        # Invoke the summarize Lambda asynchronously
        payload = {
            "job_id": job_id,
            "s3_key": s3_key,
            "audience": audience,
            "output_format": output_format,
            "model": model,
            "bucket_name": BUCKET_NAME,
        }
        if custom_audience_details:
            payload["custom_audience_details"] = custom_audience_details
        if infographic_template:
            payload["infographic_template"] = infographic_template

        lambda_client.invoke(
            FunctionName=SUMMARIZE_FUNCTION,
            InvocationType="Event",  # Async invocation
            Payload=json.dumps(payload),
        )

        print(f"Async summarize job triggered: job_id={job_id}, model={model}")

        return _response(202, {"job_id": job_id, "status": "processing", "model": model})

    except Exception as e:
        print(f"Async summarize handler error: {e}")
        return _response(500, {"error": "Internal server error"})


def _response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body_dict),
    }
