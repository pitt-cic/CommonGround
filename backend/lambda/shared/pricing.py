# Shared pricing information for Bedrock models. This is used to compute the cost of a request based on the number of input and output tokens.

PRICING = {
    "sonnet-4-6": {"input": 3.00, "output": 15.00, "bedrock_id": "us.anthropic.claude-sonnet-4-6"},
}
CROSS_REGION_MULTIPLIER = 1.10
PRICES_AS_OF = "2026-07"


def compute_cost(model_key: str, input_tokens: int, output_tokens: int) -> float:
    p = PRICING[model_key]
    raw = (input_tokens / 1_000_000 * p["input"]) + (output_tokens / 1_000_000 * p["output"])
    return round(raw * CROSS_REGION_MULTIPLIER, 4)
