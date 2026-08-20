"""
Prompt templates and configuration for summarization.
"""

AUDIENCE_PROMPTS = {
    "general_public": (
        "Audience: general public, no medical/scientific background. "
        "Avoid technical jargon as much as possible and convert it into simple terms that is easy to understand. "
        "Define every technical term or abbreviation in plain words the first time it appears. "
        "Focus on what was studied, what was found, and real-world relevance."
    ),
    "clinicians": (
        "Audience: practicing clinicians (doctors, nurses, healthcare providers). "
        "Use simple medical terminology with brief explanations but AVOID heavy statistical jargon — no regression coefficients, "
        "confidence intervals, aRRs, or p-values. Present findings as practical clinical takeaways. "
        "Focus on: what the study found, why it matters for patient care, and actionable next steps."
    ),
    "academic_health_researchers": (
        "Audience: health researchers outside clinical medicine (e.g. epidemiology, health "
        "policy, biostatistics). Leave general research/statistical terminology undefined — "
        "assume research literacy. Briefly define clinical or disease-specific terms and "
        "abbreviations on first use, since clinical training can't be assumed. "
        "Focus on methodology, findings, and how this fits into the broader research landscape."
    ),
}

OUTPUT_FORMAT_PROMPTS = {
    "summary": (
        "Provide a comprehensive summary of this research paper. Aim for 350-450 words. "
        "Output ONLY the summary text — no title, label, or heading. "
        "{audience_prompt}"
    ),
    "blog_post": (
        "Write an engaging blog post about this research paper (600-800 words). Start with a compelling hook, "
        "break down the key findings in an accessible narrative style, and end with takeaways. "
        "Use conversational tone, short paragraphs, and subheadings. "
        "Output ONLY the blog post text — no title prefix or label before the content. "
        "{audience_prompt}"
    ),
    "press_release": (
        "Write a press release about this research paper. Output PLAIN TEXT ONLY — no markdown. "
        "Structure it EXACTLY as follows:\n\n"
        "FOR IMMEDIATE RELEASE\n\n"
        "[Headline: state the key finding within 15 words]\n\n"
        "[CITY, STATE] — {current_date}\n\n"
        "Use a real city/state from the paper's author affiliations (e.g., the corresponding author's institution). "
        "Do not invent a location. Use the exact date shown above.\n\n"
        "[Lead paragraph: the single most important finding in 2-3 sentences]\n\n"
        "[Body paragraph 1: expand on the findings, include methodology highlights]\n\n"
        "[Body paragraph 2: must include at least one supporting direct quotation (under 20 words, in quotation marks) "
        "attributed to 'the authors' or 'the study's authors'. Only the paper's own written text may be quoted or referenced, "
        "never attribute to an individual by name unless directly quoting their own written words.]\n\n"
        "[Boilerplate: one paragraph about the institution(s) involved, using only facts from the paper]\n\n"
        "Media Contact:\n\n Name:\n Title:\n Organization:\n Email:\n Phone:\n\n"
        "Leave all contact fields blank for the user to fill in. Do not invent contact information. "
        "Use third person throughout. Output ONLY the press release — no preamble, labels, or markdown. "
        "{audience_prompt}"
    ),
    "linkedin_post": (
        "Write a LinkedIn post about this research paper. Keep it professional yet engaging, "
        "with a strong opening line, 2-3 key insights in the middle, and a thought-provoking "
        "closing question or call-to-action. Aim for 150-250 words. Use line breaks for readability. "
        "Do NOT use emojis. If using bullet points, use 2-3 maximum. "
        "Output ONLY the post text — no title, label, or heading like 'LinkedIn Post:' before the content. "
        "Include a few relevant hashtags at the end. "
        "{audience_prompt}"
    ),
    "x_post": (
        "Write a single X (Twitter) post about this research paper. "
        "Lead with the most surprising or impactful finding. You may use 1-2 relevant hashtags at the end. "
        "STRICT REQUIREMENT: the entire output must be 280 characters or fewer. "
        "Output ONLY the tweet text — no label, no 'Tweet:', no preamble. "
        "{audience_prompt}"
    ),
}

def build_custom_audience_prompt(details: str) -> str:
    """Build a tailored audience prompt from custom audience details."""
    return (
        f"TARGET AUDIENCE PROFILE: {details}\n\n"
        "CRITICAL INSTRUCTIONS:\n"
        "1. VOCABULARY LEVEL IS PARAMOUNT: Match your word choices EXACTLY to what this person would understand. "
        "2. If they're a young child, use only simple everyday words they would know as if you are explaining/talking to them.\n"
        "3. NEVER use technical, medical, or scientific jargon unless this person is a medical professional. Replace ALL complex terms with simple everyday words.\n"
        "4. Use analogies and comparisons from THEIR specific interests or professions (games they play, shows they watch, activities they do).\n"
        "5. Match sentence length and complexity to their age/education level. Short, simple sentences for younger audiences.\n"
        "6. If explaining numbers or statistics, translate them into relatable comparisons they'd understand.\n"
        "7. The tone should feel like someone they trust is talking directly to them in language they use every day.\n"
        "8. When in doubt, simpler is ALWAYS better. A confused reader learns nothing.\n"
        "9. Unless specified, output the summary only in English, and do not translate into any other language.\n"
    )