"""
Bedrock output schemas for CommonGround infographics.

Every limit here is a real constraint, not a hint. Pydantic AI validates the
model's structured output against these and re-prompts on violation, which is
the only reliable way to enforce a character budget -- asking nicely in the
prompt does not work.

Limits are derived from the slot geometry in templates/*.svg (font size x
available width x permitted line count) with roughly 8% headroom, so the
renderer's shrink-to-fit path is an emergency brake rather than the norm.
"""

from __future__ import annotations

from typing import Union  # noqa: F401 — Union re-exported for handler

from pydantic import BaseModel, Field


# ---------------------------------------------------------------- citations


class SourceCitation(BaseModel):
    """Citation linking content to its source in the paper."""

    verbatim_quote: str = Field(
        description="EXACT text copied from the paper. Do NOT paraphrase or rephrase. "
        "Copy character-for-character including punctuation, numbers (use digits not words), "
        "and formatting. Use ... to truncate if needed. Max 400 characters."
    )
    section: str = Field(
        description="Paper section where the quote appears: 'Abstract', 'Introduction', 'Background', "
        "'Methods', 'Materials and Methods', 'Results', 'Findings', 'Discussion', 'Conclusion', "
        "'Limitations', 'Table N', 'Figure N', or 'Appendix'."
    )


class _Base(BaseModel):
    eyebrow: str = Field(
        description="Topic or venue tag, 2-5 words. Rendered in caps. Max 42 characters."
        "e.g. 'PaTH Network - Pragmatic Trials'"
    )
    footer: str = Field(
        description="Compact citation on one line: first author et al., journal "
        "abbreviation, year, DOI. e.g. 'Hamm et al., JAMIA 2026, doi:10.1093/jamia/ocaf182'"
    )

    @classmethod
    def guidance(cls) -> str:
        return cls.__doc__ or ""


# ---------------------------------------------------------------- stat_grid


class Stat(BaseModel):
    value: str = Field(
        description="The number itself, pre-formatted. e.g. '31%', '48,912', "
        "'$2.4M', '0.94', '12'. No trailing words. Max 12 characters."
    )
    label: str = Field(description="What the number is. 2-4 words, rendered in caps. Max 35 characters.")
    detail: str = Field(
        description="One clause of context: population, interval, CI, or comparator. Max 150 characters."
    )
    citation: SourceCitation = Field(
        description="Source citation with the exact quote from the paper containing this statistic."
    )


class StatGridContent(_Base):
    """Pick exactly four numbers a non-specialist would repeat out loud.
    Vary their kind -- an effect size, a sample size, a scope figure (sites,
    years, records), and an outcome or cost figure -- so the card does not read
    as four flavours of the same statistic. Never compute or estimate a number
    the paper does not state.
    """

    headline: str = Field(description="The finding as a sentence fragment, no period. Max 110 characters.")
    deck: str = Field(description="One sentence naming design, population, and result. Max 220 characters.")
    stats: list[Stat] = Field(min_length=4, max_length=4)


# ------------------------------------------------------------- key_findings


class Finding(BaseModel):
    title: str = Field(description="Claim as a short assertion. Sentence case, no period. Max 70 characters.")
    body: str = Field(
        description="1-2 sentences of support, with the number if there is one. Max 220 characters."
    )
    citation: SourceCitation = Field(
        description="Source citation with the exact quote supporting this finding."
    )


class KeyFindingsContent(_Base):
    """Order findings by how much a stakeholder would care, not by where they
    appear in the paper. Each finding must stand alone -- no 'as noted above'.
    Prefer four findings; use three when the paper genuinely has three.
    """

    headline: str = Field(description="Umbrella claim, no period. Max 80 characters.")
    deck: str = Field(description="One short line of framing. Max 100 characters.")
    findings: list[Finding] = Field(min_length=3, max_length=4)


# --------------------------------------------------------------- pull_quote


class PullQuoteContent(_Base):
    """Select the single most compelling sentence the authors wrote — the one
    that best captures why this research matters. Prefer a sentence from the
    Discussion or Conclusion that states a bold claim, a surprising finding, or
    a call to action. It should stand alone and make a reader want to learn more.
    Avoid dry methodology descriptions, hedged language ('may suggest', 'could
    potentially'), and results restated as plain numbers. Trim with an ellipsis
    rather than paraphrasing; never put words in an author's mouth. If no
    sentence in the paper works as a standalone quote, do not force this template.
    """

    source_title: str = Field(description="Paper title, truncated at a word boundary. Max 100 characters.")
    quote: str = Field(
        description="Verbatim sentence(s). Do not include quote marks. Max 240 characters."
    )
    speaker: str = Field(description="Attributed author, e.g. 'Dr Kathleen McTigue'. Max 46 characters.")
    affiliation: str = Field(description="Institution and role. Max 96 characters.")
    context: str = Field(
        description="Why this quote matters or its significance, e.g. 'Highlights the need for "
        "standardized obesity care protocols'. Do NOT describe where in the paper it appears. Max 84 characters."
    )
    quote_section: str = Field(
        description="Paper section where the quote appears: 'Abstract', 'Introduction', 'Background', "
        "'Methods', 'Materials and Methods', 'Results', 'Findings', 'Discussion', 'Conclusion', "
        "'Limitations', or 'Appendix'."
    )


# --------------------------------------------------------------- comparison


class ComparisonContent(_Base):
    """Use only for a genuine two-state contrast the paper reports: control vs
    intervention, baseline vs follow-up, standard of care vs new protocol. Do
    not manufacture a comparison from two unrelated figures. The two values
    must share units and be directly comparable, and delta_value must be the
    change the paper actually reports -- do not subtract the two yourself.
    """

    headline: str = Field(description="What changed, no period. Max 62 characters.")
    deck: str = Field(description="One short line naming the population. Max 74 characters.")

    left_label: str = Field(description="e.g. 'Control', 'Baseline'. Caps. Max 20 characters.")
    left_value: str = Field(description="Max 9 characters.")
    left_caption: str = Field(description="Units or measure. Caps. Max 30 characters.")
    left_detail: str = Field(description="2-3 sentences describing this arm. Max 210 characters.")

    right_label: str = Field(description="e.g. 'Intervention', 'At 12 months'. Caps. Max 20 characters.")
    right_value: str = Field(description="Max 9 characters.")
    right_caption: str = Field(description="Units or measure. Caps. Max 30 characters.")
    right_detail: str = Field(description="2-3 sentences describing this arm. Max 210 characters.")

    delta_label: str = Field(description="e.g. 'Adjusted relative reduction'. Caps. Max 34 characters.")
    delta_value: str = Field(description="e.g. '-31%', '2.4x', '+18.6 pts'. Max 14 characters.")
    delta_note: str = Field(description="Significance or interval, e.g. '95% CI 24-38%, p<0.001'. Max 50 characters.")

    left_citation: SourceCitation = Field(
        description="Source citation with the exact quote containing left_value."
    )
    right_citation: SourceCitation = Field(
        description="Source citation with the exact quote containing right_value."
    )
    delta_citation: SourceCitation = Field(
        description="Source citation with the exact quote containing delta_value."
    )


# ------------------------------------------------------------- method_steps


class Step(BaseModel):
    title: str = Field(description="The stage, as a verb phrase. e.g. 'Cohort assembly'. Max 70 characters.")
    body: str = Field(description="1-2 sentences: what was done, to whom, with what tool. Max 220 characters.")
    citation: SourceCitation | None = Field(
        default=None,
        description="Source citation if this step contains a specific number (sample size, date, etc.). "
        "Omit if the step has no citable statistic."
    )


class MethodStepsContent(_Base):
    """Describe the study as a reader would need to reproduce its shape, not
    its statistics: how the cohort was assembled, what was administered or
    measured, over what interval, and how the outcome was determined. Four
    steps is usually right. Include sample sizes and dates where the paper
    gives them.
    """

    headline: str = Field(description="How the study worked, no period. Max 80 characters.")
    deck: str = Field(description="Design in a phrase, e.g. 'Retrospective cohort, 2019-2024'. Max 100 characters.")
    steps: list[Step] = Field(min_length=3, max_length=5)


class NotApplicable(BaseModel):
    reason: str = Field(
        description="One sentence: why this template doesn't fit this paper."
    )


TEMPLATE_REGISTRY = {
    "stat_grid": StatGridContent,
    "key_findings": KeyFindingsContent,
    "pull_quote": PullQuoteContent,
    "comparison": ComparisonContent,
    "method_steps": MethodStepsContent,
}


SYSTEM_PROMPT = """You turn a research paper into content for a single \
infographic card. You are filling fixed slots in a designed layout.

STRICT CHARACTER LIMITS - validation will fail if exceeded:
- headline: max 110 characters
- deck: max 220 characters
- value: max 12 characters
- label: max 35 characters
- detail/body: max 150-220 characters (check each field)
- verbatim_quote: max 400 characters

Rules:
- Length discipline matters more than completeness. Cut words to fit limits.
- Every number must appear verbatim in the source. Never derive or round.
- Write for an informed non-specialist. Expand acronyms only if space permits.
- Sentence case throughout. No markdown, emoji, or smart quotes.

Citation verbatim_quote rules:
- COPY EXACTLY from the paper, character-for-character.
- Do NOT paraphrase or rephrase. Do NOT spell out numbers (use "19" not "nineteen").
- Use ellipsis (...) to truncate long quotes while keeping text exact.
"""


