"""
Common Ground - Save Edit Lambda
Path: backend/lambda/save_edit/handler.py

PUT /papers/summarize/{job_id}/edit
Request body: { "edited_output": "..." }
Response: { "job_id": "...", "status": "saved", "edited_output": "..." }
"""

import json
import os
from datetime import datetime, timezone

import boto3
from shared.response import _response

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])


def handler(event, context):
    try:
        job_id = event.get("pathParameters", {}).get("job_id")
        body = json.loads(event.get("body") or "{}")
        edited_output = body.get("edited_output")

        if not job_id:
            return _response(400, {"error": "job_id is required"})
        if not edited_output:
            return _response(400, {"error": "edited_output is required"})

        # Get caller's email from Cognito authorizer
        caller_email = event.get("requestContext", {}).get("authorizer", {}).get("claims", {}).get("email")
        if not caller_email:
            return _response(401, {"error": "Unauthorized: no email in token"})

        # Verify job exists and caller owns it
        item = table.get_item(Key={"job_id": job_id}).get("Item")
        if not item:
            return _response(404, {"error": "Job not found", "job_id": job_id})

        # Check authorization
        job_owner = item.get("user_email")
        if job_owner != caller_email:
            return _response(403, {"error": "Forbidden: you do not own this job", "job_id": job_id})

        # Update the job with edited output
        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET edited_output = :edited_output, edited_at = :edited_at",
            ExpressionAttributeValues={
                ":edited_output": edited_output,
                ":edited_at": datetime.now(timezone.utc).isoformat(),
            },
        )

        print(f"Edited output saved for job_id={job_id}")

        return _response(200, {
            "job_id": job_id,
            "status": "saved",
            "edited_output": edited_output,
        })

    except Exception as e:
        print(f"Save edit handler error: {e}")
        return _response(500, {"error": "Internal server error"})
