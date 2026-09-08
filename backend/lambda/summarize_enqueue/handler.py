"""
Common Ground - Summarize Enqueue Lambda
Path: backend/lambda/summarize_enqueue/handler.py

POST /papers/summarize
Validates request, creates DynamoDB entry, enqueues to SQS.
Returns 202 immediately; SummarizeWorkerFn processes the job.
"""

import json
import os
import time
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from shared.response import _response

sqs_client = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

SUMMARIZE_QUEUE_URL = os.environ["SUMMARIZE_QUEUE_URL"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
DAILY_SUMMARIZE_LIMIT = 25

VALID_AUDIENCES = ["general_public", "clinicians", "academic_health_researchers", "custom_audience"]
VALID_OUTPUT_FORMATS = ["summary", "press_release", "blog_post", "linkedin_post", "x_post"]
VALID_INFOGRAPHIC_TEMPLATES = ["stat_grid", "key_findings", "method_steps", "pull_quote", "comparison"]


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


def handler(event, context):
    try:
        if "body" in event:
            body = json.loads(event.get("body") or "{}")
        else:
            body = event

        s3_key = body.get("s3_key")
        audience = body.get("audience")
        custom_audience_details = body.get("custom_audience_details")
        output_format = body.get("output_format", "summary")
        model = os.environ["BEDROCK_MODEL_ID"]
        infographic_template = body.get("infographic_template")

        if not s3_key:
            return _response(400, {"error": "s3_key is required"})
        if audience not in VALID_AUDIENCES:
            return _response(400, {"error": f"audience must be one of {VALID_AUDIENCES}"})
        if audience == "custom_audience" and not custom_audience_details:
            return _response(400, {"error": "custom_audience_details is required when audience is 'custom_audience'"})
        if output_format not in VALID_OUTPUT_FORMATS:
            return _response(400, {"error": f"output_format must be one of {VALID_OUTPUT_FORMATS}"})
        if infographic_template and infographic_template not in VALID_INFOGRAPHIC_TEMPLATES:
            return _response(400, {"error": f"Invalid infographic_template: {infographic_template}. Must be one of: {VALID_INFOGRAPHIC_TEMPLATES}"})

        claims = event.get("requestContext", {}).get("authorizer", {}).get("claims", {})
        user_email = claims.get("email")
        user_sub = claims.get("sub")

        if user_sub and "requestContext" in event:
            if not _check_and_increment_daily_limit(user_sub):
                return _response(429, {"error": f"Daily limit of {DAILY_SUMMARIZE_LIMIT} generations reached. Try again tomorrow."})

        job_id = str(uuid.uuid4())

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

        payload = {
            "job_type": "generate_summary",
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

        sqs_client.send_message(
            QueueUrl=SUMMARIZE_QUEUE_URL,
            MessageBody=json.dumps(payload),
        )

        print(f"Enqueued summary job {job_id}")
        return _response(202, {"job_id": job_id, "status": "processing", "model": model})

    except Exception as e:
        print(f"Summarize enqueue handler error: {e}")
        return _response(500, {"error": "Internal server error"})
