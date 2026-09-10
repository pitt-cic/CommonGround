"""
Common Ground - Refine Enqueue Lambda
Path: backend/lambda/refine_enqueue/handler.py

POST /papers/summarize/{job_id}/refine
Validates request, marks status refining, enqueues to SummarizeQueue.
Returns 202 immediately; SummarizeWorkerFn processes the job.
"""

import json
import os

import boto3
from botocore.exceptions import ClientError
from shared.response import _response

sqs_client = boto3.client("sqs")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

SUMMARIZE_QUEUE_URL = os.environ["SUMMARIZE_QUEUE_URL"]


def handler(event, context):
    try:
        job_id = (event.get("pathParameters") or {}).get("job_id")
        body = json.loads(event.get("body") or "{}")
        user_message = body.get("message")

        if not job_id:
            return _response(400, {"error": "job_id is required"})
        if not user_message:
            return _response(400, {"error": "message is required"})

        try:
            item = table.get_item(Key={"job_id": job_id}).get("Item")
        except ClientError as e:
            return _response(502, {"error": "Could not read job", "detail": str(e)})
        if not item:
            return _response(404, {"error": "Job not found", "job_id": job_id})

        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression="SET job_status = :s",
            ExpressionAttributeValues={":s": "refining"},
        )

        sqs_client.send_message(
            QueueUrl=SUMMARIZE_QUEUE_URL,
            MessageBody=json.dumps({
                "job_type": "refine",
                "job_id": job_id,
                "message": user_message,
            }),
        )

        print(f"Enqueued refine job {job_id}")
        return _response(202, {"job_id": job_id, "status": "refining"})

    except Exception as e:
        print(f"Refine enqueue handler error: {e}")
        return _response(500, {"error": "Internal server error"})
