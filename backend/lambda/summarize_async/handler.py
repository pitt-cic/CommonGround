"""
Common Ground - Summarize Lambda
Path: backend/lambda/summarize_async/handler.py

POST /papers/summarize
Request body:  { "s3_key": "papers/uuid/some_paper.pdf", "audience": "general_public" | "clinicians" | "academic_health_researchers", "model": "sonnet-4-6" }
Response:      { "audience": "general_public", "summary": "..." }
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from pydantic import BaseModel, Field
import pymupdf
import ftfy
from pydantic_ai import Agent
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider
from pydantic_ai.settings import ModelSettings
from pydantic_ai.messages import BinaryContent
from shared.pricing import PRICING, compute_cost
from shared.verify import verify_citation
from prompts import (
    AUDIENCE_PROMPTS,
    OUTPUT_FORMAT_PROMPTS,
    build_custom_audience_prompt,
)


class SummaryCitation(BaseModel):
    """A citation linking a statistic in the summary to its source."""
    statistic: str = Field(description="The statistic or number as it appears in the content (e.g., '31%', '48,912 patients')")
    verbatim_quote: str = Field(description="The exact sentence(s) from the paper containing this statistic. Copy character-for-character, max 400 chars.")
    section: str = Field(description="Paper section where the quote appears: 'Abstract', 'Introduction', 'Background', 'Methods', 'Materials and Methods', 'Results', 'Findings', 'Discussion', 'Conclusion', 'Limitations', 'Table N', 'Figure N', or 'Appendix'.")


class SummaryWithCitations(BaseModel):
    """Summary content with source citations for statistics."""
    content: str = Field(description="The summary/blog post/press release text. Do NOT include citation markers or references in this text.")
    citations: list[SummaryCitation] = Field(max_length=20, description="List of citations for each statistic mentioned in the content")

s3 = boto3.client("s3")
lambda_client = boto3.client("lambda")
bedrock_client = boto3.client("bedrock-runtime")
bedrock_provider = BedrockProvider(bedrock_client=bedrock_client)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

BUCKET_NAME = os.environ["BUCKET_NAME"]
GENERATE_INFOGRAPHIC_FUNCTION = os.environ.get("GENERATE_INFOGRAPHIC_FUNCTION_NAME")
DEFAULT_MODEL = "sonnet-4-6"
MODEL_IDS = {k: v["bedrock_id"] for k, v in PRICING.items()}
CHUNK_THRESHOLD_PAGES = 50
MIN_EXTRACTED_CHARS = 5000

CITATION_SYSTEM_PROMPT = """You are creating content from a research paper AND extracting source citations.

For every statistic or quantitative claim you include in the content, you MUST also provide a citation with:
1. The exact statistic as written in your content
2. The EXACT verbatim quote from the paper (copy character-for-character, max 400 chars)
3. Which section the quote comes from (Abstract, Results, Methods, Discussion, Conclusion, Table N, Figure N)

Rules:
- The content field should be clean text with NO citation markers or references
- Every number/percentage/statistic in your content needs a corresponding citation
- Copy quotes EXACTLY as they appear in the paper - do NOT paraphrase or rephrase
- If you can't find the exact quote for a statistic, don't include that statistic in the content

IMPORTANT: The content length limits specified in the format instructions apply ONLY to the content field.
The citations are separate and do not count toward the content length limit.
Keep content within the specified word/character limits for the output format.
"""


_LIGATURE_MAP = {
    ord('ﬁ'): 'fi',   # ﬁ ligature
    ord('ﬂ'): 'fl',   # ﬂ ligature
    ord('ﬀ'): 'ff',   # ﬀ ligature
    ord('ﬃ'): 'ffi',  # ﬃ ligature
    ord('ﬄ'): 'ffl',  # ﬄ ligature
    ord('\xad'):   None,   # soft hyphen → remove
    ord('\xa0'):   ' ',    # non-breaking space → regular space
}

def _clean_extracted_text(raw: str) -> str:
    """Fix mojibake, ligatures, control chars, hyphenated line-breaks, and whitespace."""
    text = ftfy.fix_text(raw)
    text = text.translate(_LIGATURE_MAP)
    # Remove non-printable control chars (keep \n, \t, \r)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)
    # Soft word-break hyphens (both sides lowercase): "treat-\nment" → "treatment"
    text = re.sub(r"([a-z])-\n([a-z])", r"\1\2", text)
    # Compound-word hyphens at line breaks (uppercase/digit on either side): keep hyphen
    # e.g. "SARS-\nCoV-2" → "SARS-CoV-2"  (without this, "SARSCoV-2" breaks citation matching)
    text = re.sub(r"(\w)-\n(\w)", r"\1-\2", text)
    # Normalize runs of spaces/tabs to a single space (preserves newlines)
    text = re.sub(r"[^\S\n]+", " ", text)
    # Collapse 3+ consecutive newlines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Strip trailing spaces on each line
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip()


def _summarize_single_shot_text(
    extracted_text: str, audience: str, output_format: str, model_id: str, job_id: str = None, custom_audience_details: str = None
) -> tuple:
    """Summarize using extracted text with structured output including citations."""

    if audience == "custom_audience" and custom_audience_details:
        audience_context = build_custom_audience_prompt(custom_audience_details)
    else:
        audience_context = AUDIENCE_PROMPTS[audience]

    current_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    format_instruction = OUTPUT_FORMAT_PROMPTS[output_format].format(
        audience_prompt=audience_context,
        current_date=current_date,
    )

    max_tokens = 8192
    bedrock_model_id = MODEL_IDS[model_id]

    bedrock_model = BedrockConverseModel(bedrock_model_id, provider=bedrock_provider)
    model_settings = ModelSettings(max_tokens=max_tokens, temperature=0.7)

    system_prompt = CITATION_SYSTEM_PROMPT + "\n\n" + format_instruction
    agent = Agent(
        model=bedrock_model,
        output_type=SummaryWithCitations,
        model_settings=model_settings,
        system_prompt=system_prompt,
        retries=2,
    )

    result = agent.run_sync(extracted_text)
    input_tokens = result.usage.input_tokens if result.usage else 0
    output_tokens = result.usage.output_tokens if result.usage else 0
    content = result.output.content
    citations = [c.model_dump() for c in result.output.citations]
    return content, citations, input_tokens or 0, output_tokens or 0


def _summarize_single_shot_pdf(
    pdf_bytes: bytes, audience: str, output_format: str, model_id: str, job_id: str = None, custom_audience_details: str = None
) -> tuple:
    """Summarize using PDF document block with structured output including citations."""

    if audience == "custom_audience" and custom_audience_details:
        audience_context = build_custom_audience_prompt(custom_audience_details)
    else:
        audience_context = AUDIENCE_PROMPTS[audience]

    current_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    format_instruction = OUTPUT_FORMAT_PROMPTS[output_format].format(
        audience_prompt=audience_context,
        current_date=current_date,
    )

    max_tokens = 8192
    bedrock_model_id = MODEL_IDS[model_id]

    bedrock_model = BedrockConverseModel(bedrock_model_id, provider=bedrock_provider)
    model_settings = ModelSettings(max_tokens=max_tokens, temperature=0.7)

    system_prompt = CITATION_SYSTEM_PROMPT + "\n\n" + format_instruction
    agent = Agent(
        model=bedrock_model,
        output_type=SummaryWithCitations,
        model_settings=model_settings,
        system_prompt=system_prompt,
        retries=2,
    )

    result = agent.run_sync(BinaryContent(data=pdf_bytes, media_type="application/pdf"))
    input_tokens = result.usage.input_tokens if result.usage else 0
    output_tokens = result.usage.output_tokens if result.usage else 0
    content = result.output.content
    citations = [c.model_dump() for c in result.output.citations]
    return content, citations, input_tokens or 0, output_tokens or 0


def _summarize_chunked(
    pdf_bytes: bytes, audience: str, output_format: str, model_id: str, job_id: str = None, custom_audience_details: str = None
) -> tuple:
    """Chunked path for large PDFs. Merges citations from both halves."""

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    midpoint = total_pages // 2

    def _half_bytes(start, end):
        sub = pymupdf.open()
        sub.insert_pdf(doc, from_page=start, to_page=end - 1)
        return sub.tobytes()

    first_half, citations1, in1, out1 = _summarize_single_shot_pdf(_half_bytes(0, midpoint), audience, output_format, model_id, job_id, custom_audience_details)
    second_half, citations2, in2, out2 = _summarize_single_shot_pdf(_half_bytes(midpoint, total_pages), audience, output_format, model_id, job_id, custom_audience_details)

    if audience == "custom_audience" and custom_audience_details:
        audience_context = build_custom_audience_prompt(custom_audience_details)
    else:
        audience_context = AUDIENCE_PROMPTS[audience]

    current_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    format_instruction = OUTPUT_FORMAT_PROMPTS[output_format].format(
        audience_prompt=audience_context,
        current_date=current_date,
    )

    merge_prompt = (
        f"{format_instruction}\n\n"
        "Below are two parts of the same paper that need to be merged. "
        "Combine them into a single coherent piece, removing redundancy and "
        "restoring the connections between sections.\n\n"
        f"FIRST HALF:\n{first_half}\n\nSECOND HALF:\n{second_half}"
    )

    max_tokens = 8192
    bedrock_model_id = MODEL_IDS[model_id]

    bedrock_model = BedrockConverseModel(bedrock_model_id, provider=bedrock_provider)
    model_settings = ModelSettings(max_tokens=max_tokens, temperature=0.7)

    system_prompt = CITATION_SYSTEM_PROMPT + "\n\n" + format_instruction
    agent = Agent(
        model=bedrock_model,
        output_type=SummaryWithCitations,
        model_settings=model_settings,
        system_prompt=system_prompt,
        retries=2,
    )

    result = agent.run_sync(merge_prompt)
    input_tokens = (result.usage.input_tokens or 0) if result.usage else 0
    output_tokens = (result.usage.output_tokens or 0) if result.usage else 0
    content = result.output.content
    # Merge all citations, preferring the merged result's citations
    merged_citations = [c.model_dump() for c in result.output.citations]
    # Also include citations from halves that might not be in merged result
    all_citations = merged_citations + citations1 + citations2
    # Dedupe by statistic
    seen = set()
    unique_citations = []
    for c in all_citations:
        if c["statistic"] not in seen:
            seen.add(c["statistic"])
            unique_citations.append(c)
    return content, unique_citations, in1 + in2 + input_tokens, out1 + out2 + output_tokens


def handler(event, context):
    job_id = None
    bucket_name = BUCKET_NAME
    t_start = time.monotonic()

    try:
        if "body" in event:
            body = json.loads(event.get("body") or "{}")
        else:
            body = event

        s3_key = body.get("s3_key")
        audience = body.get("audience")
        custom_audience_details = body.get("custom_audience_details")
        output_format = body.get("output_format", "summary")
        model_id = body.get("model", DEFAULT_MODEL)
        job_id = body.get("job_id")
        bucket_name = body.get("bucket_name", BUCKET_NAME)
        infographic_template = body.get("infographic_template")

        if not s3_key:
            return _response(400, {"error": "s3_key is required"})
        valid_audiences = list(AUDIENCE_PROMPTS.keys()) + ["custom_audience"]
        if audience not in valid_audiences:
            return _response(400, {"error": f"audience must be one of {valid_audiences}"})
        if output_format not in OUTPUT_FORMAT_PROMPTS:
            return _response(400, {"error": f"output_format must be one of {list(OUTPUT_FORMAT_PROMPTS.keys())}"})
        if model_id not in MODEL_IDS:
            return _response(400, {"error": f"Invalid model: {model_id}. Must be one of: {list(MODEL_IDS.keys())}"})

        try:
            pdf_bytes = s3.get_object(Bucket=bucket_name, Key=s3_key)["Body"].read()
        except s3.exceptions.NoSuchKey:
            return _response(404, {"error": "s3_key not found in bucket"})

        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        actual_pages = len(doc)

        early_infographic_fired = False
        early_extracted_s3_key = None

        if actual_pages > CHUNK_THRESHOLD_PAGES:
            path = "chunked"
            input_mode = "pdf_block"
            extracted_chars = 0
            content, summary_citations, input_tokens, output_tokens = _summarize_chunked(
                pdf_bytes, audience, output_format, model_id, job_id, custom_audience_details
            )
        else:
            raw_pages = []
            for page in doc:
                page_text = page.get_text()
                if page_text.strip():
                    raw_pages.append(page_text)
            extracted_text = _clean_extracted_text("\n\n".join(raw_pages))
            extracted_chars = len(extracted_text)

            if extracted_chars >= MIN_EXTRACTED_CHARS:
                path = "single_shot"
                input_mode = "text"

                # Early-save extracted text and kick off infographic in parallel with the LLM call
                if job_id:
                    try:
                        pdf_stem = re.sub(r"[^\w\-]", "_", s3_key.rsplit("/", 1)[-1].rsplit(".", 1)[0])[:60]
                        early_extracted_s3_key = f"papers/{job_id}/extracted_{pdf_stem}.txt"
                        s3.put_object(
                            Bucket=bucket_name,
                            Key=early_extracted_s3_key,
                            Body=extracted_text.encode("utf-8"),
                            ContentType="text/plain",
                        )
                        table.update_item(
                            Key={"job_id": job_id},
                            UpdateExpression="SET extracted_text_key = :k",
                            ExpressionAttributeValues={":k": early_extracted_s3_key},
                        )
                        if infographic_template and GENERATE_INFOGRAPHIC_FUNCTION:
                            table.update_item(
                                Key={"job_id": job_id},
                                UpdateExpression="SET #s = :s",
                                ExpressionAttributeNames={"#s": f"infographic_{infographic_template}_status"},
                                ExpressionAttributeValues={":s": "processing"},
                            )
                            lambda_client.invoke(
                                FunctionName=GENERATE_INFOGRAPHIC_FUNCTION,
                                InvocationType="Event",
                                Payload=json.dumps({
                                    "job_id": job_id,
                                    "template_id": infographic_template,
                                    "regenerate": False,
                                }),
                            )
                            early_infographic_fired = True
                            print(f"[INFO] Infographic fired in parallel for job {job_id}, template {infographic_template}")
                    except Exception as early_err:
                        print(f"[WARN] Early extract/infographic trigger failed for job {job_id}: {early_err}")

                content, summary_citations, input_tokens, output_tokens = _summarize_single_shot_text(
                    extracted_text, audience, output_format, model_id, job_id, custom_audience_details
                )
            else:
                path = "single_shot"
                input_mode = "pdf_block"
                content, summary_citations, input_tokens, output_tokens = _summarize_single_shot_pdf(
                    pdf_bytes, audience, output_format, model_id, job_id, custom_audience_details
                )

        cost = compute_cost(model_id, input_tokens, output_tokens)

        now = datetime.now(timezone.utc).isoformat()
        cost_entry = {
            "type": "generate",
            "model": model_id,
            "output_format": output_format,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": Decimal(str(cost)),
            "at": now,
        }

        if job_id:
            dynamo_update = ("""SET
                    job_status = :job_status,
                    current_output = :output,
                    claude_model = :claude_model,
                    messages = list_append(if_not_exists(messages, :empty_list), :new_msg),
                    cost_entries = list_append(if_not_exists(cost_entries, :empty_list), :entries),
                    total_cost = if_not_exists(total_cost, :zero) + :cost
                """)
            dynamo_values = {
                ":job_status": "completed",
                ":output": content,
                ":claude_model": model_id,
                ":new_msg": [{"role": "assistant", "content": content}],
                ":empty_list": [],
                ":entries": [cost_entry],
                ":zero": Decimal("0"),
                ":cost": Decimal(str(cost)),
            }

            # Verify and store summary citations
            if summary_citations:
                # Get paper text for verification
                paper_text_for_verify = None
                if path == "single_shot" and input_mode == "text" and extracted_chars >= MIN_EXTRACTED_CHARS:
                    paper_text_for_verify = extracted_text

                # Verify each citation if we have paper text
                if paper_text_for_verify:
                    for citation in summary_citations:
                        result = verify_citation(
                            citation.get("verbatim_quote", ""),
                            paper_text_for_verify,
                        )
                        citation["verified"] = result.verified

                dynamo_update += ", summary_citations = :citations"
                dynamo_values[":citations"] = summary_citations

            # Persist extracted text if not already done early (chunked/pdf_block paths)
            if path == "single_shot" and input_mode == "text" and extracted_chars >= MIN_EXTRACTED_CHARS:
                if not early_extracted_s3_key:
                    try:
                        pdf_stem = re.sub(r"[^\w\-]", "_", s3_key.rsplit("/", 1)[-1].rsplit(".", 1)[0])[:60]
                        extracted_s3_key = f"papers/{job_id}/extracted_{pdf_stem}.txt"
                        s3.put_object(
                            Bucket=bucket_name,
                            Key=extracted_s3_key,
                            Body=extracted_text.encode("utf-8"),
                            ContentType="text/plain",
                        )
                        dynamo_update += ", extracted_text_key = :extracted_text_key"
                        dynamo_values[":extracted_text_key"] = extracted_s3_key
                    except Exception as s3_err:
                        print(f"[WARN] Failed to persist extracted text for job {job_id}: {s3_err}")

            table.update_item(
                Key={"job_id": job_id},
                UpdateExpression=dynamo_update,
                ExpressionAttributeValues=dynamo_values,
            )

            # Fire infographic if not already triggered in parallel above
            if not early_infographic_fired:
                try:
                    job_item = table.get_item(Key={"job_id": job_id}).get("Item", {})
                    late_infographic_template = job_item.get("infographic_template")
                    if late_infographic_template and GENERATE_INFOGRAPHIC_FUNCTION:
                        table.update_item(
                            Key={"job_id": job_id},
                            UpdateExpression="SET #status = :s",
                            ExpressionAttributeNames={"#status": f"infographic_{late_infographic_template}_status"},
                            ExpressionAttributeValues={":s": "processing"},
                        )
                        lambda_client.invoke(
                            FunctionName=GENERATE_INFOGRAPHIC_FUNCTION,
                            InvocationType="Event",
                            Payload=json.dumps({
                                "job_id": job_id,
                                "template_id": late_infographic_template,
                                "regenerate": False,
                            }),
                        )
                except Exception as infographic_err:
                    if locals().get("late_infographic_template"):
                        try:
                            table.update_item(
                                Key={"job_id": job_id},
                                UpdateExpression="SET #status = :s, #err = :e",
                                ExpressionAttributeNames={
                                    "#status": f"infographic_{late_infographic_template}_status",
                                    "#err": f"infographic_{late_infographic_template}_error",
                                },
                                ExpressionAttributeValues={":s": "failed", ":e": str(infographic_err)},
                            )
                        except Exception:
                            pass

        return _response(200, {"audience": audience, "output_format": output_format, "model": model_id, "summary": content, "status": "completed"})

    except Exception as e:
        print(f"[ERROR] Summarize job {job_id} failed: {e}")
        if job_id:
            try:
                table.update_item(
                    Key={"job_id": job_id},
                    UpdateExpression="""SET
                        job_status = :job_status,
                        job_error = :job_error
                    """,
                    ExpressionAttributeValues={
                        ":job_status": "failed",
                        ":job_error": str(e)
                    },
                )
            except Exception as dynamo_err:
                print(f"[ERROR] Failed to write failure status for job {job_id}: {dynamo_err}")

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
