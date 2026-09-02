import os

import anthropic
from pydantic import BaseModel

MODEL = "claude-opus-5"

SYSTEM_PROMPT = (
    "You extract structured job posting information from job description text. "
    "Only use information that is explicitly present in the text. "
    "Never invent or guess missing requirements - leave a field empty (null, "
    "empty string, or empty list) if it isn't in the text."
)


class JobSkillItem(BaseModel):
    name: str
    is_required: bool = True


class JobInfo(BaseModel):
    title: str
    company_name: str | None = None
    required_education: str | None = None
    required_experience_years: float | None = None
    experience_description: str | None = None
    skills: list[JobSkillItem] = []


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
