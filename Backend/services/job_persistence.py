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
