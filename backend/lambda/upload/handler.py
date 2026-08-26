"""
Common Ground - Upload Lambda
Path: backend/lambda/upload/handler.py

POST /papers/upload
Request body:  { "filename": "some_paper.pdf" }
Response:      { "upload_url": "https://...", "s3_key": "papers/uuid/some_paper.pdf" }
"""

import json
import os
import uuid

import boto3
from shared.response import _response

s3 = boto3.client("s3")

BUCKET_NAME = os.environ["BUCKET_NAME"]
UPLOAD_URL_EXPIRY_SECONDS = 300  # 5 minutes is plenty for a direct PUT


def handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        filename = body.get("filename")

        if not filename or not filename.lower().endswith(".pdf"):
            return _response(400, {"error": "filename is required and must be a .pdf"})

        # Sanitize filename to prevent path traversal
        import os
        safe_filename = os.path.basename(filename)
        if ".." in safe_filename or "/" in safe_filename or "\\" in safe_filename:
            return _response(400, {"error": "Invalid filename"})

        s3_key = f"papers/{uuid.uuid4()}/{safe_filename}"

        upload_url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": BUCKET_NAME,
                "Key": s3_key,
                "ContentType": "application/pdf",
            },
            ExpiresIn=UPLOAD_URL_EXPIRY_SECONDS,
        )

        return _response(200, {"upload_url": upload_url, "s3_key": s3_key})

    except Exception as e:
        print(f"Upload handler error: {e}")
        return _response(500, {"error": "Internal server error"})
