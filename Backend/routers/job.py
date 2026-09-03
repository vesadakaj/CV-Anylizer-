import logging
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models.job import Job
from models.job_skill import JobSkill
from models.skill import Skill
from services.job_extraction import JobExtractionError, extract_job_info
from services.job_persistence import JobPersistenceError, save_job
from services.matching import (
    JobNotFoundError,
    JobRankingResponse,
    MatchPersistenceError,
    get_job_candidate_matches,
    normalize_education_level,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class JobDescriptionRequest(BaseModel):
    description: str


class JobSkillSummary(BaseModel):
    name: str
    is_required: bool


class JobSummary(BaseModel):
    job_id: int
    title: str
    company_name: str | None
    required_experience_years: float | None
    required_education: str | None
    skills: list[JobSkillSummary]
    required_skills_count: int
    ready_to_match: bool
    created_at: datetime | None


class JobListResponse(BaseModel):
    jobs: list[JobSummary]


@router.post("/analyze")
async def analyze_job(
    payload: JobDescriptionRequest, db: Session = Depends(get_db)
):
    description = payload.description.strip()
    if not description:
        raise HTTPException(
            status_code=400, detail="Job description text is required."
        )

    try:
        job_info = extract_job_info(description)
    except JobExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        job = save_job(db, job_info, description=description)
    except JobPersistenceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "job_info": job_info,
        "job_id": job.id,
    }


@router.get("", response_model=JobListResponse)
def list_jobs(db: Session = Depends(get_db)):
    jobs = db.query(Job).order_by(Job.created_at.desc(), Job.id.desc()).all()

    skills_by_job: dict[int, list[JobSkillSummary]] = defaultdict(list)
    if jobs:
        job_ids = [job.id for job in jobs]
        skill_rows = (
            db.query(JobSkill.job_id, JobSkill.is_required, Skill.name)
            .join(Skill, Skill.id == JobSkill.skill_id)
            .filter(JobSkill.job_id.in_(job_ids))
            .all()
        )
        for row in skill_rows:
            skills_by_job[row.job_id].append(
                JobSkillSummary(name=row.name, is_required=row.is_required)
            )

    summaries: list[JobSummary] = []
    for job in jobs:
        skills = skills_by_job.get(job.id, [])
        required_skills_count = sum(1 for skill in skills if skill.is_required)
        has_valid_experience = (
            job.required_experience_years is not None
            and job.required_experience_years > 0
        )
        has_valid_education = normalize_education_level(job.required_education) is not None
        ready_to_match = (
            required_skills_count > 0 or has_valid_experience or has_valid_education
        )

        summaries.append(
            JobSummary(
                job_id=job.id,
                title=job.title,
                company_name=job.company_name,
                required_experience_years=job.required_experience_years,
                required_education=job.required_education,
                skills=skills,
                required_skills_count=required_skills_count,
                ready_to_match=ready_to_match,
                created_at=job.created_at,
            )
        )

    return JobListResponse(jobs=summaries)


@router.get("/{job_id}/matches", response_model=JobRankingResponse)
def rank_candidates_for_job(
    job_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    minimum_score: float | None = Query(None, ge=0, le=100),
    db: Session = Depends(get_db),
):
    try:
        return get_job_candidate_matches(
            db, job_id, limit=limit, offset=offset, minimum_score=minimum_score
        )
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MatchPersistenceError as exc:
        logger.error("Match persistence failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Could not save match results."
        ) from exc
