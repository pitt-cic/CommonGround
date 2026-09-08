"""
Common Ground - Polish Enqueue Lambda
Path: backend/lambda/polish_enqueue/handler.py

POST /papers/summarize/{job_id}/infographic/polish
Validates request, marks status polishing, enqueues to InfographicQueue.
Returns 202 immediately; InfographicWorkerFn processes the job.
"""

import json
import os
import time

import boto3
from botocore.exceptions import ClientError
from shared.response import _response

sqs_client = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

INFOGRAPHIC_QUEUE_URL = os.environ["INFOGRAPHIC_QUEUE_URL"]

VALID_TEMPLATES = {
    "stat_grid", "key_findings", "pull_quote", "comparison", "method_steps",
}


def handler(event, context):
    job_id = (event.get("pathParameters") or {}).get("job_id")
    if not job_id:
        return _response(400, {"error": "Missing job_id"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Request body is not valid JSON"})

    template_id = body.get("template_id")
    user_prompt = body.get("prompt", "").strip()

    if not template_id:
        return _response(400, {"error": "template_id is required"})
    if not user_prompt:
        return _response(400, {"error": "prompt is required"})
    if len(user_prompt) > 500:
        return _response(400, {"error": "prompt must be 500 characters or less"})
    if template_id not in VALID_TEMPLATES:
        return _response(400, {"error": "Invalid template_id", "valid": sorted(VALID_TEMPLATES)})

    status_attr = f"infographic_{template_id}_status"
    try:
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #attr = :s, #ttl = :t",
            ConditionExpression="attribute_exists(job_id)",
            ExpressionAttributeNames={"#attr": status_attr, "#ttl": "ttl"},
            ExpressionAttributeValues={":s": "polishing", ":t": int(time.time()) + 30 * 86400},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _response(404, {"error": "Job not found"})
        return _response(502, {"error": "Could not update job", "detail": str(e)})

    try:
        sqs_client.send_message(
            QueueUrl=INFOGRAPHIC_QUEUE_URL,
            MessageBody=json.dumps({
                "job_type": "polish",
                "job_id": job_id,
                "template_id": template_id,
                "prompt": user_prompt,
            }),
        )
    except ClientError as e:
        return _response(502, {"error": "Could not enqueue polish job", "detail": str(e)})

    print(f"Enqueued polish job {job_id} template {template_id}")
    return _response(202, {
        "job_id": job_id,
        "template_id": template_id,
        "status": "polishing",
    })
