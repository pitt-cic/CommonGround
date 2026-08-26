"""
Common Ground - Refine Lambda
Path: backend/lambda/refine/handler.py

POST /papers/summarize/{job_id}/refine
Request body: { "message": "make it shorter" }
Response: { "job_id": "...", "status": "completed", "current_output": "...", "messages": [...] }
"""

import json
import os
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from pydantic_ai.messages import BinaryContent
from pydantic_ai import Agent
from pydantic_ai.models.bedrock import BedrockConverseModel
from pydantic_ai.providers.bedrock import BedrockProvider
from pydantic_ai.settings import ModelSettings
from shared.pricing import compute_cost

s3 = boto3.client("s3")
bedrock_client = boto3.client("bedrock-runtime")
bedrock_provider = BedrockProvider(bedrock_client=bedrock_client)

dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ.get("BUCKET_NAME")
BEDROCK_MODEL_ID = os.environ["BEDROCK_MODEL_ID"]
PRICING_KEY = "sonnet-4-6"
table = dynamodb.Table(TABLE_NAME)

SYSTEM_INSTRUCTION = (
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

FORMAT_CONSTRAINTS = {
    "summary": "Keep the output as a comprehensive summary. Aim for 350-450 words unless asked to change it.",
    "blog_post": "Keep the output as an engaging blog post (600-800 words) with conversational tone, short paragraphs, and subheadings.",
    "press_release": "Keep the output as a properly structured press release with FOR IMMEDIATE RELEASE header, headline, lead paragraph, body, boilerplate, and media contact section.",
    "linkedin_post": "Keep the output as a LinkedIn post (150-250 words) with professional tone, line breaks for readability, and relevant hashtags at the end. Do NOT use emojis. If using bullet points, use 2-3 maximum.",
    "x_post": "STRICT REQUIREMENT: The output MUST be 280 characters or fewer. This is a hard limit for X/Twitter posts. Count carefully.",
}


def handler(event, context):
    try:
        job_id = event.get("pathParameters", {}).get("job_id")
        body = json.loads(event.get("body") or "{}")
        user_message = body.get("message")

        if not job_id:
            return response(400, {"error": "job_id is required"})
        if not user_message:
            return response(400, {"error": "message is required"})

        item = table.get_item(Key={"job_id": job_id}).get("Item")
        if not item:
            return response(404, {"error": "Job not found", "job_id": job_id})

        messages = item.get("messages", [])
        edited_output = item.get("edited_output")

        # Fetch the original extracted paper text if available
        extracted_text = None
        pdf_bytes = None
        extracted_text_key = item.get("extracted_text_key")
        if extracted_text_key and BUCKET_NAME:
            try:
                obj = s3.get_object(Bucket=BUCKET_NAME, Key=extracted_text_key)
                extracted_text = obj["Body"].read().decode("utf-8")
            except Exception:
                pass

        # Fallback: fetch original PDF for image-heavy or large papers
        if not extracted_text and BUCKET_NAME:
            paper_s3_key = item.get("s3_key")
            if paper_s3_key:
                try:
                    obj = s3.get_object(Bucket=BUCKET_NAME, Key=paper_s3_key)
                    pdf_bytes = obj["Body"].read()
                except Exception:
                    pass

        # If user manually edited, use that as the latest assistant response
        if edited_output and len(messages) > 0:
            # Replace the last assistant message with edited content
            for i in range(len(messages) - 1, -1, -1):
                if messages[i]["role"] == "assistant":
                    messages[i] = {"role": "assistant", "content": edited_output}
                    break

        model_id = BEDROCK_MODEL_ID

        # Use the same max tokens as the original output format
        output_format = item.get("output_format", "summary")
        max_tokens = 8192

        # Add format-specific constraints to instructions
        instructions = SYSTEM_INSTRUCTION
        if output_format in FORMAT_CONSTRAINTS:
            instructions = instructions + "\n\n" + FORMAT_CONSTRAINTS[output_format]

        bedrock_model = BedrockConverseModel(model_id, provider=bedrock_provider)
        model_settings = ModelSettings(max_tokens=max_tokens, temperature=0.7)
        agent = Agent(
            model=bedrock_model,
            instructions=instructions,
            model_settings=model_settings
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
        cost_entry = {
            "type": "refine",
            "model": model_id,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost": Decimal(str(cost)),
            "prompt": user_message,
            "at": now,
        }

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
                ":new_entry": [cost_entry],
                ":empty_list": [],
                ":cost": Decimal(str(cost)),
                ":zero": Decimal("0"),
            },
        )

        return response(200, {
            "job_id": job_id,
            "status": "completed",
            "current_output": reply,
            "messages": messages,
            "model": model_id,
        })

    except Exception as e:
        return response(500, {"error": "Internal server error"})


def response(status_code, body_dict):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body_dict),
    }
