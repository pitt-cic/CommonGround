"""
Async trigger for infographic generation.

POST /papers/summarize/{job_id}/infographic
- Writes infographic_{template_id}_status = "processing" to DynamoDB
- Invokes GenerateInfographicFn asynchronously
- Returns 202 immediately

The worker updates DynamoDB with status/svg when done.
Frontend polls GET /papers/summarize/{job_id} and reads
infographic_{template_id}_status and infographic_{template_id}_svg.
"""

import json
import os
import time

import boto3
from botocore.exceptions import ClientError
from shared.response import _response

lambda_client = boto3.client("lambda")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

GENERATE_INFOGRAPHIC_FUNCTION_NAME = os.environ["GENERATE_INFOGRAPHIC_FUNCTION_NAME"]

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
}

VALID_TEMPLATES = {
    "stat_grid", "key_findings", "pull_quote", "comparison", "method_steps",
}

MAX_INFOGRAPHIC_GENERATIONS = 50



def handler(event, context):
    job_id = (event.get("pathParameters") or {}).get("job_id")
    if not job_id:
        return _response(400, {"error": "Missing job_id"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "Request body is not valid JSON"})

    template_id = body.get("template_id")
    if template_id not in VALID_TEMPLATES:
        return _response(400, {"error": "Invalid template_id", "valid": sorted(VALID_TEMPLATES)})

    # Check per-job infographic generation cap
    try:
        job = table.get_item(Key={"job_id": job_id}, ConsistentRead=True).get("Item")
    except ClientError as e:
        return _response(502, {"error": "Could not read job", "detail": str(e)})
    if not job:
        return _response(404, {"error": "Job not found"})
    cost_entries = job.get("cost_entries") or []
    infographic_count = sum(1 for e in cost_entries if e.get("type") == "infographic_generation")
    if infographic_count >= MAX_INFOGRAPHIC_GENERATIONS:
        return _response(429, {"error": f"Infographic generation limit of {MAX_INFOGRAPHIC_GENERATIONS} reached for this job."})

    # Mark as processing in DynamoDB (only if job exists)
    status_attr = f"infographic_{template_id}_status"
    try:
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET #attr = :s, #ttl = :t",
            ConditionExpression="attribute_exists(job_id)",
            ExpressionAttributeNames={"#attr": status_attr, "#ttl": "ttl"},
            ExpressionAttributeValues={":s": "processing", ":t": int(time.time()) + 30 * 86400},
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            return _response(404, {"error": "Job not found"})
        return _response(502, {"error": "Could not update job", "detail": str(e)})

    # Invoke the generate Lambda asynchronously, passing original event context
    payload = {
        "job_id": job_id,
        "template_id": template_id,
        "regenerate": body.get("regenerate", False),
    }

    try:
        lambda_client.invoke(
            FunctionName=GENERATE_INFOGRAPHIC_FUNCTION_NAME,
            InvocationType="Event",  # async
            Payload=json.dumps(payload),
        )
    except ClientError as e:
        return _response(502, {"error": "Could not invoke generate function", "detail": str(e)})

    return _response(202, {
        "job_id": job_id,
        "template_id": template_id,
        "status": "processing",
    })
