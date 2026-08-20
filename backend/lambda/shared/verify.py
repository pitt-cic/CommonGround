"""
Citation verification utilities.

Verifies that extracted quotes actually exist in the source paper.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass
class VerificationResult:
    """Result of verifying a single citation."""

    verified: bool
    reason: str


def _normalize_text(text: str) -> str:
    """Normalize text for comparison: whitespace, dashes, quotes, etc."""
    text = re.sub(r"\s+", " ", text).strip()
    # Remove spaces before punctuation (e.g., "CUP ," -> "CUP,")
    text = re.sub(r"\s+([,.:;])", r"\1", text)
    # Remove line-break hyphens (e.g., "hos-pitals" -> "hospitals")
    # Only remove hyphen after a letter (not number) followed by lowercase letter
    text = re.sub(r"([a-z])-\s*([a-z])", r"\1\2", text)
    # Normalize dashes (en-dash, em-dash, etc.) to hyphen
    text = re.sub(r"[–—−‐‑‒―]", "-", text)
    # Remove spaces around dashes (e.g., "2.25- 3.78" -> "2.25-3.78")
    text = re.sub(r"\s*-\s*", "-", text)
    # Normalize quotes
    text = re.sub(r"[''`]", "'", text)
    text = re.sub(r"[""„]", '"', text)
    # Normalize ellipsis
    text = text.replace("…", "...")
    return text.lower()


def verify_citation(
    verbatim_quote: str,
    paper_text: str,
) -> VerificationResult:
    """
    Verify a citation by checking if the quote exists in the paper.

    Args:
        verbatim_quote: The claimed verbatim quote from the paper
        paper_text: Full extracted text from the paper

    Returns:
        VerificationResult with verified status and reason
    """
    if not verbatim_quote or not paper_text:
        return VerificationResult(verified=False, reason="Missing quote or paper text")

    normalized_quote = _normalize_text(verbatim_quote)
    normalized_paper = _normalize_text(paper_text)

    # Split on ellipsis — model may join non-adjacent passages with "..."
    # Each segment must individually appear in the paper
    segments = [s.strip() for s in normalized_quote.split("...") if s.strip()]
    if not segments:
        return VerificationResult(verified=False, reason="Empty quote after normalization")

    found = True
    for seg in segments:
        check = seg[:80]
        if check not in normalized_paper:
            found = False
            break

    return VerificationResult(
        verified=found,
        reason="Found" if found else "Quote not found in paper",
    )


def verify_all_citations(
    content: dict,
    paper_text: str,
    template_id: str,
) -> tuple[dict, list[dict]]:
    """
    Verify all citations in an infographic content dict.

    Args:
        content: The infographic content with citations
        paper_text: Full extracted text from the paper
        template_id: Template type for knowing where to find citations

    Returns:
        Tuple of (updated content with verified flags, list of failures)
    """
    failures = []

    if template_id == "stat_grid":
        for i, stat in enumerate(content.get("stats", [])):
            citation = stat.get("citation", {})
            result = verify_citation(
                citation.get("verbatim_quote", ""),
                paper_text,
            )
            citation["verified"] = result.verified
            if not result.verified:
                failures.append({
                    "type": "stat",
                    "index": i,
                    "value": stat.get("value"),
                    "reason": result.reason,
                })

    elif template_id == "key_findings":
        for i, finding in enumerate(content.get("findings", [])):
            citation = finding.get("citation", {})
            result = verify_citation(
                citation.get("verbatim_quote", ""),
                paper_text,
            )
            citation["verified"] = result.verified
            if not result.verified:
                failures.append({
                    "type": "finding",
                    "index": i,
                    "title": finding.get("title"),
                    "reason": result.reason,
                })

    elif template_id == "comparison":
        for field in ["left", "right", "delta"]:
            value = content.get(f"{field}_value", "")
            citation = content.get(f"{field}_citation", {})
            if citation:
                result = verify_citation(
                    citation.get("verbatim_quote", ""),
                    paper_text,
                )
                citation["verified"] = result.verified
                if not result.verified:
                    failures.append({
                        "type": f"{field}_value",
                        "value": value,
                        "reason": result.reason,
                    })

    elif template_id == "pull_quote":
        quote = content.get("quote", "")
        result = verify_citation(
            quote,
            paper_text,
        )
        content["quote_verified"] = result.verified
        if not result.verified:
            failures.append({
                "type": "quote",
                "reason": result.reason,
            })

    elif template_id == "method_steps":
        for i, step in enumerate(content.get("steps", [])):
            citation = step.get("citation")
            if citation:
                result = verify_citation(
                    citation.get("verbatim_quote", ""),
                    paper_text,
                )
                citation["verified"] = result.verified
                if not result.verified:
                    failures.append({
                        "type": "step",
                        "index": i,
                        "title": step.get("title"),
                        "reason": result.reason,
                    })

    return content, failures
