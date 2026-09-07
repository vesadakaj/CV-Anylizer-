import os
from datetime import date

import anthropic
from pydantic import BaseModel

MODEL = "claude-opus-5"

SYSTEM_PROMPT = (
    "You extract structured job posting information from job description text. "
    "Only use information that is explicitly present in the text. "
    "Never invent or guess missing requirements - leave a field empty (null, "
    "empty string, or empty list) if it isn't in the text.\n\n"
    "Use these section-heading conventions when mapping the posting's text "
    "into fields:\n"
    "- \"What You'll Be Doing\", \"What You Will Be Doing\", or "
    "\"Responsibilities\" -> responsibilities.\n"
    "- \"What We're Looking For\" or \"Requirements\" may contain required "
    "qualifications and required skills - split individual skill names into "
    "the skills list and keep other qualification statements in "
    "required_qualifications.\n"
    "- \"Required Qualifications\" -> required_qualifications.\n"
    "- \"Preferred Qualifications\", \"Nice to Have\", or \"In Addition, They "
    "May Have\" -> preferred_qualifications.\n\n"
    "Keep required_qualifications and preferred_qualifications strictly "
    "separate - never duplicate an item into both lists. Preserve each "
    "responsibility and qualification as its own list item rather than "
    "merging multiple statements into one."
)


class JobSkillItem(BaseModel):
    name: str
    is_required: bool = True


class JobInfo(BaseModel):
    title: str
    company_name: str | None = None
    location: str | None = None
    department: str | None = None
    employment_type: str | None = None
    posting_date: date | None = None
    required_education: str | None = None
    required_experience_years: float | None = None
    experience_description: str | None = None
    skills: list[JobSkillItem] = []
    responsibilities: list[str] = []
    required_qualifications: list[str] = []
    preferred_qualifications: list[str] = []


class JobExtractionError(Exception):
    pass


def extract_job_info(job_description: str) -> JobInfo:
    api_key = os.getenv("LLM_API_KEY")
    if not api_key:
        raise JobExtractionError(
            "LLM_API_KEY is not configured. Set it in the backend .env file."
        )

    client = anthropic.Anthropic(api_key=api_key)

    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": job_description}],
            output_format=JobInfo,
        )
    except anthropic.APIError as exc:
        raise JobExtractionError(
            f"Could not extract job information: {exc}"
        ) from exc

    return response.parsed_output
