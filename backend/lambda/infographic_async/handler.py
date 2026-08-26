import json
import os
import traceback
import xml.etree.ElementTree as ET
from decimal import Decimal
from typing import Union

import boto3
from shared.pricing import compute_cost
from botocore.exceptions import ClientError
from pydantic import ValidationError
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider
from pydantic_ai.settings import ModelSettings

from render import render
from schemas import (
    SYSTEM_PROMPT,
    TEMPLATE_REGISTRY,
    NotApplicable,
)
from shared.verify import verify_all_citations
from shared.response import _response

s3 = boto3.client("s3")
bedrock_client = boto3.client("bedrock-runtime")
bedrock_provider = BedrockProvider(bedrock_client=bedrock_client)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

BUCKET_NAME = os.environ["BUCKET_NAME"]
BEDROCK_MODEL_ID = os.environ["BEDROCK_MODEL_ID"]
PRICING_KEY = "sonnet-4-6"

TEMPLATE_ALIASES = {
    "template-1": "stat_grid",
    "template-2": "method_steps",
    "template-3": "key_findings",
}
VALID_TEMPLATES = set(TEMPLATE_REGISTRY) | set(TEMPLATE_ALIASES)

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,POST",
}



def _build_agent(output_type, guidance, audience=None, custom_audience_details=None):
    audience_note = ""
    if audience == "custom_audience" and custom_audience_details:
        audience_note = f"AUDIENCE: {custom_audience_details}. Match vocabulary and tone exactly to this audience."
    elif audience:
        audience_note = f"AUDIENCE: {audience.replace('_', ' ')}. Tailor vocabulary and complexity to suit this audience."

    system = SYSTEM_PROMPT
    if audience_note:
        system = system.rstrip() + f"\n\n{audience_note}"
    system += "\n\n" + guidance

    return Agent(
        model=BedrockConverseModel(BEDROCK_MODEL_ID, provider=bedrock_provider),
        output_type=output_type,
        model_settings=ModelSettings(max_tokens=1500, temperature=0.0),
        system_prompt=system,
        retries=2,
    )


def _set_infographic_status(job_id, template_id, status, reason=None):
    """Write infographic_{template_id}_status to DynamoDB. Optionally store reason for not_applicable."""
    status_attr = f"infographic_{template_id}_status"
    if reason:
        reason_attr = f"infographic_{template_id}_reason"
        try:
            table.update_item(
                Key={"job_id": job_id},
                UpdateExpression="SET #s = :s, #r = :r",
                ConditionExpression="attribute_exists(job_id)",
                ExpressionAttributeNames={"#s": status_attr, "#r": reason_attr},
                ExpressionAttributeValues={":s": status, ":r": reason},
            )
        except ClientError:
            pass
    else:
        try:
            table.update_item(
                Key={"job_id": job_id},
                UpdateExpression="SET #s = :s",
                ConditionExpression="attribute_exists(job_id)",
                ExpressionAttributeNames={"#s": status_attr},
                ExpressionAttributeValues={":s": status},
            )
        except ClientError:
            pass


def handler(event, context):
    # Support both API Gateway (pathParameters + body) and direct async invocation
    if "pathParameters" in event:
        job_id = (event.get("pathParameters") or {}).get("job_id")
        try:
            body = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return _response(400, {"error": "Request body is not valid JSON"})
        requested = body.get("template_id")
        regenerate = body.get("regenerate", False)
        async_mode = False
    else:
        # Direct invocation from gen_infographic handler
        job_id = event.get("job_id")
        requested = event.get("template_id")
        regenerate = event.get("regenerate", False)
        async_mode = True

    if not job_id:
        return _response(400, {"error": "Missing job_id"})

    if requested not in VALID_TEMPLATES:
        return _response(400, {"error": "Invalid template_id", "valid": sorted(TEMPLATE_REGISTRY)})
    template_id = TEMPLATE_ALIASES.get(requested, requested)

    try:
        job = table.get_item(Key={"job_id": job_id}, ConsistentRead=True).get("Item")
    except ClientError as e:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(502, {"error": "Could not read job", "detail": str(e)})

    if not job:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(404, {"error": "Job not found"})
    # Allow generation if extracted text is already available (parallel path),
    # otherwise require the summarize job to be fully completed.
    if not job.get("extracted_text_key") and job.get("job_status") != "completed":
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(409, {"error": "Job is not completed yet"})

    # Prefer raw extracted text; fall back to summary.
    paper_text = None
    extracted_key = job.get("extracted_text_key")
    if extracted_key:
        try:
            obj = s3.get_object(Bucket=BUCKET_NAME, Key=extracted_key)
            paper_text = obj["Body"].read().decode("utf-8")
        except ClientError:
            pass
    if not paper_text:
        paper_text = job.get("edited_output") or job.get("current_output")
    if not paper_text:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(422, {"error": "No content available for this job"})

    s3_key = f"infographics/{job_id}/{template_id}.svg"

    # Serve cached artifact unless regenerate requested
    if not regenerate:
        try:
            cached = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)
            svg_content = cached["Body"].read().decode("utf-8")
            if async_mode:
                _set_infographic_status(job_id, template_id, "completed")
            return _response(200, {
                "job_id": job_id,
                "template_id": template_id,
                "svg_content": svg_content,
                "s3_key": s3_key,
                "cached": True,
            })
        except ClientError as e:
            if e.response["Error"]["Code"] not in ("NoSuchKey", "404"):
                if async_mode:
                    _set_infographic_status(job_id, template_id, "failed")
                return _response(502, {"error": "S3 read failed", "detail": str(e)})

    audience = job.get("audience")
    custom_audience_details = job.get("custom_audience_details")

    content_type = TEMPLATE_REGISTRY[template_id]
    if template_id in ("pull_quote", "comparison"):
        output_type = Union[content_type, NotApplicable]
    else:
        output_type = content_type

    total_input_tokens = 0
    total_output_tokens = 0

    agent = _build_agent(output_type, content_type.guidance(), audience, custom_audience_details)

    try:
        result = agent.run_sync(paper_text)
        total_input_tokens += getattr(result.usage, "input_tokens", 0) or 0
        total_output_tokens += getattr(result.usage, "output_tokens", 0) or 0
    except ValidationError as e:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(422, {
            "error": "Model output did not fit the template",
            "template_id": template_id,
            "detail": e.errors(include_url=False),
        })
    except UnexpectedModelBehavior as e:
        cause = e.__cause__
        validation_details = None
        if isinstance(cause, ValidationError):
            validation_details = cause.errors(include_url=False)
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(502, {
            "error": "Model call failed",
            "detail": str(e),
            "validation_errors": validation_details,
        })
    except ClientError as e:
        code = e.response["Error"]["Code"]
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        status = 429 if code in ("ThrottlingException", "TooManyRequestsException") else 502
        return _response(status, {"error": "Bedrock error", "code": code})
    except Exception as e:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(502, {"error": "Agent call failed", "detail": str(e)})

    if isinstance(result.output, NotApplicable):
        if async_mode:
            _set_infographic_status(job_id, template_id, "not_applicable", reason=result.output.reason)
        return _response(422, {
            "error": "template_not_applicable",
            "template_id": template_id,
            "reason": result.output.reason,
        })

    # Verify citations against source paper
    content_dict = result.output.model_dump()
    content_dict, verification_failures = verify_all_citations(content_dict, paper_text, template_id)

    # Determine verification status
    if not verification_failures:
        verification_status = "found"
    else:
        verification_status = "not_found"

    try:
        svg_content = render(template_id, content_dict)
        ET.fromstring(svg_content)
    except Exception as e:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(500, {
            "error": "Render failed",
            "template_id": template_id,
            "detail": str(e),
        })

    # Store SVG and content JSON in S3
    content_key = f"infographics/{job_id}/{template_id}.json"
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
            Key=content_key,
            Body=json.dumps(content_dict).encode("utf-8"),
            ContentType="application/json",
        )
    except ClientError as e:
        if async_mode:
            _set_infographic_status(job_id, template_id, "failed")
        return _response(502, {"error": "S3 write failed", "detail": str(e)})

    cost = compute_cost(PRICING_KEY, total_input_tokens, total_output_tokens)

    keys = dict(job.get("infographic_keys") or {})
    keys[template_id] = s3_key

    # Store verification status and failures in DynamoDB
    verification_attr = f"infographic_{template_id}_verification"
    failures_attr = f"infographic_{template_id}_failures"

    try:
        update_expr = (
            "SET infographic_keys = :keys, "
            "cost_entries = list_append(if_not_exists(cost_entries, :empty), :ce), "
            "total_cost = if_not_exists(total_cost, :zero) + :cost, "
            "#verif = :verif_status"
        )
        expr_values = {
            ":keys": keys,
            ":ce": [{
                "type": "infographic_generation",
                "model": BEDROCK_MODEL_ID,
                "template_id": template_id,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "cost": Decimal(str(cost)),
            }],
            ":empty": [],
            ":zero": Decimal("0"),
            ":cost": Decimal(str(cost)),
            ":verif_status": verification_status,
        }
        expr_names = {"#verif": verification_attr}

        if verification_failures:
            update_expr += ", #failures = :failures"
            expr_values[":failures"] = verification_failures
            expr_names["#failures"] = failures_attr

        table.update_item(
            Key={"job_id": job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names,
        )
    except ClientError:
        pass

    _set_infographic_status(job_id, template_id, "completed")

    return _response(200, {
        "job_id": job_id,
        "template_id": template_id,
        "svg_content": svg_content,
        "s3_key": s3_key,
        "cached": False,
        "cost": {"input_tokens": total_input_tokens, "output_tokens": total_output_tokens, "cost": cost},
        "verification_status": verification_status,
        "verification_failures": verification_failures if verification_failures else None,
    })
