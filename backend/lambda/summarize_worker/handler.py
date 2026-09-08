"""
Common Ground - Summarize Worker Lambda
Path: backend/lambda/summarize_worker/handler.py

Triggered by SQS SummarizeQueue. Processes one summary job per invocation.
Returns batchItemFailures for reportBatchItemFailures=true support.
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
from shared.pricing import compute_cost
from shared.verify import verify_citation
from prompts import (
    AUDIENCE_PROMPTS,
    CITATION_SYSTEM_PROMPT,
    OUTPUT_FORMAT_PROMPTS,
    build_custom_audience_prompt,
)


class SummaryCitation(BaseModel):
    statistic: str = Field(description="The statistic or number as it appears in the content (e.g., '31%', '48,912 patients')")
    verbatim_quote: str = Field(description="The exact sentence(s) from the paper containing this statistic. Copy character-for-character, max 400 chars.")
    section: str = Field(description="Paper section where the quote appears: 'Abstract', 'Introduction', 'Background', 'Methods', 'Materials and Methods', 'Results', 'Findings', 'Discussion', 'Conclusion', 'Limitations', 'Table N', 'Figure N', or 'Appendix'.")


class SummaryWithCitations(BaseModel):
    content: str = Field(description="The summary/blog post/press release text. Do NOT include citation markers or references in this text.")
    citations: list[SummaryCitation] = Field(max_length=20, description="List of citations for each statistic mentioned in the content")


s3 = boto3.client("s3")
sqs_client = boto3.client("sqs")
bedrock_client = boto3.client("bedrock-runtime")
bedrock_provider = BedrockProvider(bedrock_client=bedrock_client)

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

BUCKET_NAME = os.environ["BUCKET_NAME"]
INFOGRAPHIC_QUEUE_URL = os.environ.get("INFOGRAPHIC_QUEUE_URL")
BEDROCK_MODEL_ID = os.environ["BEDROCK_MODEL_ID"]
PRICING_KEY = "sonnet-4-6"
CHUNK_THRESHOLD_PAGES = 50
MIN_EXTRACTED_CHARS = 5000


_LIGATURE_MAP = {
    ord('ﬁ'): 'fi',
    ord('ﬂ'): 'fl',
    ord('ﬀ'): 'ff',
    ord('ﬃ'): 'ffi',
    ord('ﬄ'): 'ffl',
    ord('\xad'):   None,
    ord('\xa0'):   ' ',
}


def _clean_extracted_text(raw: str) -> str:
    text = ftfy.fix_text(raw)
    text = text.translate(_LIGATURE_MAP)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", text)
    text = re.sub(r"([a-z])-\n([a-z])", r"\1\2", text)
    text = re.sub(r"(\w)-\n(\w)", r"\1-\2", text)
    text = re.sub(r"[^\S\n]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    return text.strip()


def _build_format_instruction(audience, output_format, custom_audience_details=None):
    if audience == "custom_audience" and custom_audience_details:
        audience_context = build_custom_audience_prompt(custom_audience_details)
    else:
        audience_context = AUDIENCE_PROMPTS[audience]
    current_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    return OUTPUT_FORMAT_PROMPTS[output_format].format(
        audience_prompt=audience_context,
        current_date=current_date,
    )


def _build_summary_agent(model_id, format_instruction):
    system_prompt = CITATION_SYSTEM_PROMPT + "\n\n" + format_instruction
    bedrock_model = BedrockConverseModel(model_id, provider=bedrock_provider)
    return Agent(
        model=bedrock_model,
        output_type=SummaryWithCitations,
        model_settings=ModelSettings(max_tokens=8192, temperature=0.7),
        system_prompt=system_prompt,
        retries=2,
    )


def _extract_result(result):
    input_tokens = (result.usage.input_tokens or 0) if result.usage else 0
    output_tokens = (result.usage.output_tokens or 0) if result.usage else 0
    content = result.output.content
    citations = [c.model_dump() for c in result.output.citations]
    return content, citations, input_tokens, output_tokens


def _summarize_single_shot_text(extracted_text, audience, output_format, model_id, custom_audience_details=None):
    format_instruction = _build_format_instruction(audience, output_format, custom_audience_details)
    agent = _build_summary_agent(model_id, format_instruction)
    result = agent.run_sync(extracted_text)
    return _extract_result(result)


def _summarize_single_shot_pdf(pdf_bytes, audience, output_format, model_id, custom_audience_details=None):
    format_instruction = _build_format_instruction(audience, output_format, custom_audience_details)
    agent = _build_summary_agent(model_id, format_instruction)
    result = agent.run_sync(BinaryContent(data=pdf_bytes, media_type="application/pdf"))
    return _extract_result(result)


def _summarize_chunked(pdf_bytes, audience, output_format, model_id, custom_audience_details=None):
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    total_pages = len(doc)
    midpoint = total_pages // 2

    def _half_bytes(start, end):
        sub = pymupdf.open()
        sub.insert_pdf(doc, from_page=start, to_page=end - 1)
        return sub.tobytes()

    first_half, citations1, in1, out1 = _summarize_single_shot_pdf(_half_bytes(0, midpoint), audience, output_format, model_id, custom_audience_details)
    second_half, citations2, in2, out2 = _summarize_single_shot_pdf(_half_bytes(midpoint, total_pages), audience, output_format, model_id, custom_audience_details)

    format_instruction = _build_format_instruction(audience, output_format, custom_audience_details)
    merge_prompt = (
        f"{format_instruction}\n\n"
        "Below are two parts of the same paper that need to be merged. "
        "Combine them into a single coherent piece, removing redundancy and "
        "restoring the connections between sections.\n\n"
        f"FIRST HALF:\n{first_half}\n\nSECOND HALF:\n{second_half}"
    )

    agent = _build_summary_agent(model_id, format_instruction)
    result = agent.run_sync(merge_prompt)
    content, merged_citations, input_tokens, output_tokens = _extract_result(result)

    all_citations = merged_citations + citations1 + citations2
    seen = set()
    unique_citations = []
    for c in all_citations:
        if c["statistic"] not in seen:
            seen.add(c["statistic"])
            unique_citations.append(c)
    return content, unique_citations, in1 + in2 + input_tokens, out1 + out2 + output_tokens


def _process_job(message):
    """Process a single summarize job from an SQS message body."""
    job_id = message.get("job_id")
    s3_key = message.get("s3_key")
    audience = message.get("audience")
    custom_audience_details = message.get("custom_audience_details")
    output_format = message.get("output_format", "summary")
    model_id = BEDROCK_MODEL_ID
    bucket_name = message.get("bucket_name", BUCKET_NAME)
    infographic_template = message.get("infographic_template")

    valid_audiences = list(AUDIENCE_PROMPTS.keys()) + ["custom_audience"]
    if audience not in valid_audiences:
        raise ValueError(f"Invalid audience: {audience}")
    if output_format not in OUTPUT_FORMAT_PROMPTS:
        raise ValueError(f"Invalid output_format: {output_format}")

    try:
        pdf_bytes = s3.get_object(Bucket=bucket_name, Key=s3_key)["Body"].read()
    except s3.exceptions.NoSuchKey:
        raise ValueError(f"s3_key not found: {s3_key}")

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    actual_pages = len(doc)

    early_infographic_fired = False
    early_extracted_s3_key = None

    if actual_pages > CHUNK_THRESHOLD_PAGES:
        path = "chunked"
        input_mode = "pdf_block"
        extracted_chars = 0
        content, summary_citations, input_tokens, output_tokens = _summarize_chunked(
            pdf_bytes, audience, output_format, model_id, custom_audience_details
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
                    if infographic_template and INFOGRAPHIC_QUEUE_URL:
                        table.update_item(
                            Key={"job_id": job_id},
                            UpdateExpression="SET #s = :s",
                            ExpressionAttributeNames={"#s": f"infographic_{infographic_template}_status"},
                            ExpressionAttributeValues={":s": "processing"},
                        )
                        sqs_client.send_message(
                            QueueUrl=INFOGRAPHIC_QUEUE_URL,
                            MessageBody=json.dumps({
                                "job_id": job_id,
                                "template_id": infographic_template,
                                "regenerate": False,
                            }),
                        )
                        early_infographic_fired = True
                        print(f"[INFO] Infographic enqueued in parallel for job {job_id}, template {infographic_template}")
                except Exception as early_err:
                    print(f"[WARN] Early extract/infographic trigger failed for job {job_id}: {early_err}")

            content, summary_citations, input_tokens, output_tokens = _summarize_single_shot_text(
                extracted_text, audience, output_format, model_id, custom_audience_details
            )
        else:
            path = "single_shot"
            input_mode = "pdf_block"
            content, summary_citations, input_tokens, output_tokens = _summarize_single_shot_pdf(
                pdf_bytes, audience, output_format, model_id, custom_audience_details
            )

    cost = compute_cost(PRICING_KEY, input_tokens, output_tokens)

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

        if summary_citations:
            paper_text_for_verify = None
            if path == "single_shot" and input_mode == "text" and extracted_chars >= MIN_EXTRACTED_CHARS:
                paper_text_for_verify = extracted_text

            if paper_text_for_verify:
                for citation in summary_citations:
                    result = verify_citation(
                        citation.get("verbatim_quote", ""),
                        paper_text_for_verify,
                    )
                    citation["verified"] = result.verified

            dynamo_update += ", summary_citations = :citations"
            dynamo_values[":citations"] = summary_citations

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

        if not early_infographic_fired:
            try:
                job_item = table.get_item(Key={"job_id": job_id}).get("Item", {})
                late_infographic_template = job_item.get("infographic_template")
                if late_infographic_template and INFOGRAPHIC_QUEUE_URL:
                    table.update_item(
                        Key={"job_id": job_id},
                        UpdateExpression="SET #status = :s",
                        ExpressionAttributeNames={"#status": f"infographic_{late_infographic_template}_status"},
                        ExpressionAttributeValues={":s": "processing"},
                    )
                    sqs_client.send_message(
                        QueueUrl=INFOGRAPHIC_QUEUE_URL,
                        MessageBody=json.dumps({
                            "job_id": job_id,
                            "template_id": late_infographic_template,
                            "regenerate": False,
                        }),
                    )
            except Exception as infographic_err:
                late_tmpl = locals().get("late_infographic_template")
                if late_tmpl:
                    try:
                        table.update_item(
                            Key={"job_id": job_id},
                            UpdateExpression="SET #status = :s, #err = :e",
                            ExpressionAttributeNames={
                                "#status": f"infographic_{late_tmpl}_status",
                                "#err": f"infographic_{late_tmpl}_error",
                            },
                            ExpressionAttributeValues={":s": "failed", ":e": str(infographic_err)},
                        )
                    except Exception:
                        pass

    print(f"[INFO] Completed summary job {job_id}")


REFINE_SYSTEM_INSTRUCTION = (
    "You are refining a summary of a research paper. The user's instruction should be applied to modify the EXISTING content.\n\n"
    "CRITICAL RULES:\n"
    "- NEVER ask questions, seek clarification, or explain what you're doing.\n"
    "- NEVER respond conversationally — your output IS the revised content, nothing else.\n"
    "- Interpret ALL user input as instructions to modify the existing summary.\n"
    "- If the user mentions an interest, hobby, or topic (e.g. 'interested in roblox'), use analogies and references from that topic to explain the research findings.\n"
    "- If the user mentions a tone or style, apply it to the content.\n"
    "- Keep the same structure and EXACTLY the same length unless explicitly asked to change it.\n"
    "- Just output the revised content. No preamble, no explanation, no questions."
)

REFINE_FORMAT_CONSTRAINTS = {
    "summary": "Keep the output as a comprehensive summary. Aim for 350-450 words unless asked to change it.",
    "blog_post": "Keep the output as an engaging blog post (600-800 words) with conversational tone, short paragraphs, and subheadings.",
    "press_release": "Keep the output as a properly structured press release with FOR IMMEDIATE RELEASE header, headline, lead paragraph, body, boilerplate, and media contact section.",
    "linkedin_post": "Keep the output as a LinkedIn post (150-250 words) with professional tone, line breaks for readability, and relevant hashtags at the end. Do NOT use emojis. If using bullet points, use 2-3 maximum.",
    "x_post": "STRICT REQUIREMENT: The output MUST be 280 characters or fewer. This is a hard limit for X/Twitter posts. Count carefully.",
}


def _process_refine_job(message):
    """Process a refine job from an SQS message body."""
    from pydantic_ai import Agent as _Agent
    from pydantic_ai.models.bedrock import BedrockConverseModel as _BedrockConverseModel
    from pydantic_ai.settings import ModelSettings as _ModelSettings

    job_id = message.get("job_id")
    user_message = message.get("message")

    if not job_id or not user_message:
        raise ValueError("Missing job_id or message in refine payload")

    item = table.get_item(Key={"job_id": job_id}).get("Item")
    if not item:
        raise ValueError(f"Job not found: {job_id}")

    messages = item.get("messages", [])
    edited_output = item.get("edited_output")

    extracted_text = None
    pdf_bytes = None
    extracted_text_key = item.get("extracted_text_key")
    if extracted_text_key and BUCKET_NAME:
        try:
            obj = s3.get_object(Bucket=BUCKET_NAME, Key=extracted_text_key)
            extracted_text = obj["Body"].read().decode("utf-8")
        except Exception:
            pass

    if not extracted_text and BUCKET_NAME:
        paper_s3_key = item.get("s3_key")
        if paper_s3_key:
            try:
                obj = s3.get_object(Bucket=BUCKET_NAME, Key=paper_s3_key)
                pdf_bytes = obj["Body"].read()
            except Exception:
                pass

    if edited_output and len(messages) > 0:
        for i in range(len(messages) - 1, -1, -1):
            if messages[i]["role"] == "assistant":
                messages[i] = {"role": "assistant", "content": edited_output}
                break

    output_format = item.get("output_format", "summary")
    instructions = REFINE_SYSTEM_INSTRUCTION
    if output_format in REFINE_FORMAT_CONSTRAINTS:
        instructions += "\n\n" + REFINE_FORMAT_CONSTRAINTS[output_format]

    bedrock_model = _BedrockConverseModel(BEDROCK_MODEL_ID, provider=bedrock_provider)
    agent = _Agent(
        model=bedrock_model,
        instructions=instructions,
        model_settings=_ModelSettings(max_tokens=8192, temperature=0.7),
    )

    messages.append({"role": "user", "content": user_message})
    conversation_context = "\n\n".join([
        f"{'Assistant' if m['role'] == 'assistant' else 'User'}: {m['content']}"
        for m in messages[:-1]
    ])

    if extracted_text:
        paper_context = f"<paper_text>\n{extracted_text}\n</paper_text>\n\n"
        run_input = f"{paper_context}{conversation_context}\n\nUser: {user_message}" if conversation_context else f"{paper_context}{user_message}"
    elif pdf_bytes:
        text_part = f"{conversation_context}\n\nUser: {user_message}" if conversation_context else user_message
        run_input = [BinaryContent(data=pdf_bytes, media_type="application/pdf"), text_part]
    else:
        run_input = f"{conversation_context}\n\nUser: {user_message}" if conversation_context else user_message

    result = agent.run_sync(run_input)
    reply = result.output
    usage = result.usage
    input_tokens = (usage.input_tokens or 0) if usage else 0
    output_tokens = (usage.output_tokens or 0) if usage else 0

    cost = compute_cost(PRICING_KEY, input_tokens, output_tokens)
    now = datetime.now(timezone.utc).isoformat()

    messages.append({"role": "assistant", "content": reply})

    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression="""SET
            job_status = :job_status,
            current_output = :current_output,
            messages = :messages,
            cost_entries = list_append(if_not_exists(cost_entries, :empty_list), :new_entry),
            total_cost = if_not_exists(total_cost, :zero) + :cost
            REMOVE edited_output
        """,
        ExpressionAttributeValues={
            ":job_status": "completed",
            ":current_output": reply,
            ":messages": messages,
            ":new_entry": [{
                "type": "refine",
                "model": BEDROCK_MODEL_ID,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost": Decimal(str(cost)),
                "prompt": user_message,
                "at": now,
            }],
            ":empty_list": [],
            ":cost": Decimal(str(cost)),
            ":zero": Decimal("0"),
        },
    )
    print(f"[INFO] Completed refine job {job_id}")


def handler(event, context):
    batch_item_failures = []
    for record in event.get("Records", []):
        message_id = record.get("messageId", "unknown")
        job_id = "unknown"
        try:
            message = json.loads(record["body"])
            job_id = message.get("job_id", "unknown")
            job_type = message.get("job_type", "generate_summary")
            if job_type == "refine":
                _process_refine_job(message)
            else:
                _process_job(message)
        except Exception as e:
            print(f"[ERROR] Failed to process SQS record {message_id} (job_id={job_id}): {e}")
            if job_id and job_id != "unknown":
                try:
                    table.update_item(
                        Key={"job_id": job_id},
                        UpdateExpression="SET job_status = :s, job_error = :e",
                        ExpressionAttributeValues={":s": "failed", ":e": str(e)},
                    )
                except Exception as dynamo_err:
                    print(f"[ERROR] Failed to write failure status for job {job_id}: {dynamo_err}")
            batch_item_failures.append({"itemIdentifier": message_id})
    return {"batchItemFailures": batch_item_failures}
