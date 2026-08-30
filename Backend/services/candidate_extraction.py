import os

import anthropic
from pydantic import BaseModel

MODEL = "claude-opus-5"

SYSTEM_PROMPT = (
    "You extract structured candidate information from CV/resume text. "
    "Only use information that is explicitly present in the text. "
    "Never invent or guess missing details - leave a field empty (null, "
    "empty string, or empty list) if it isn't in the text."
)


class EducationItem(BaseModel):
    institution: str
    degree: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    description: str | None = None


class WorkExperienceItem(BaseModel):
    company_name: str
    position_title: str
    description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    is_current: bool = False


class ProjectItem(BaseModel):
    name: str
    description: str | None = None
    technologies: str | None = None
    project_url: str | None = None


class SkillItem(BaseModel):
    name: str
    proficiency_level: str | None = None
    years_experience: float | None = None


class LanguageItem(BaseModel):
    name: str
    level: str | None = None


class CandidateInfo(BaseModel):
    full_name: str
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    education: list[EducationItem] = []
    work_experience: list[WorkExperienceItem] = []
    projects: list[ProjectItem] = []
    skills: list[SkillItem] = []
    languages: list[LanguageItem] = []


class CandidateExtractionError(Exception):
    pass


def extract_candidate_info(cv_text: str) -> CandidateInfo:
    client = anthropic.Anthropic(api_key=os.getenv("LLM_API_KEY"))

    try:
        response = client.messages.parse(
            model=MODEL,
            max_tokens=4096,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": cv_text}],
            output_format=CandidateInfo,
        )
    except anthropic.APIError as exc:
        raise CandidateExtractionError(
            f"Could not extract candidate information: {exc}"
        ) from exc

    return response.parsed_output
