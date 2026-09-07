import json
from datetime import date

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.job import Job
from models.job_skill import JobSkill
from models.skill import Skill
from services.job_extraction import JobInfo


class JobPersistenceError(Exception):
    pass


def _get_or_create_skill(db: Session, name: str) -> Skill:
    skill = (
        db.query(Skill)
        .filter(func.lower(Skill.name) == name.strip().lower())
        .first()
    )
    if skill is None:
        skill = Skill(name=name.strip())
        db.add(skill)
        db.flush()

    return skill


def _encode_list(items: list[str] | None) -> str | None:
    """JSON-encode a list of free-text items for storage in a UnicodeText
    column. Blank items are dropped; an empty result is stored as NULL."""
    if not items:
        return None
    cleaned = [item.strip() for item in items if item and item.strip()]
    if not cleaned:
        return None
    return json.dumps(cleaned)


def decode_list(raw: str | None) -> list[str]:
    """Inverse of `_encode_list`. Tolerant of malformed/legacy data - never
    raises, since this is informational text never used by matching."""
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if not isinstance(data, list):
        return []
    return [str(item) for item in data]


def save_job(db: Session, job_info: JobInfo, description: str) -> Job:
    try:
        job = Job(
            title=job_info.title,
            company_name=job_info.company_name,
            description=description,
            required_education=job_info.required_education,
            required_experience_years=job_info.required_experience_years,
            experience_description=job_info.experience_description,
        )
        db.add(job)
        db.flush()

        for skill in job_info.skills:
            if not skill.name.strip():
                continue
            skill_row = _get_or_create_skill(db, skill.name)
            db.add(
                JobSkill(
                    job_id=job.id,
                    skill_id=skill_row.id,
                    is_required=skill.is_required,
                )
            )

        db.commit()
        db.refresh(job)
    except SQLAlchemyError as exc:
        db.rollback()
        raise JobPersistenceError(f"Could not save job data: {exc}") from exc

    return job


def create_manual_job(
    db: Session,
    *,
    title: str,
    company_name: str,
    required_experience_years: float,
    required_education: str | None,
    posting_date: date | None,
    skill_names: list[str],
    location: str | None = None,
    department: str | None = None,
    employment_type: str | None = None,
    description: str | None = None,
    responsibilities: list[str] | None = None,
    required_qualifications: list[str] | None = None,
    preferred_qualifications: list[str] | None = None,
) -> Job:
    """Persist a job from user-reviewed structured data - no NLP/LLM call.
    Used both for fully manual entry and for saving an AI-extracted preview
    after the user has reviewed and corrected it. Every skill passed here is
    stored as required. Rolls back atomically on failure."""
    try:
        job = Job(
            title=title,
            company_name=company_name,
            location=location,
            department=department,
            employment_type=employment_type,
            description=description,
            responsibilities=_encode_list(responsibilities),
            required_qualifications=_encode_list(required_qualifications),
            preferred_qualifications=_encode_list(preferred_qualifications),
            required_education=required_education,
            required_experience_years=required_experience_years,
            posting_date=posting_date,
        )
        db.add(job)
        db.flush()

        for name in skill_names:
            skill_row = _get_or_create_skill(db, name)
            db.add(
                JobSkill(
                    job_id=job.id,
                    skill_id=skill_row.id,
                    is_required=True,
                )
            )

        db.commit()
        db.refresh(job)
    except SQLAlchemyError as exc:
        db.rollback()
        raise JobPersistenceError(f"Could not save job data: {exc}") from exc

    return job
