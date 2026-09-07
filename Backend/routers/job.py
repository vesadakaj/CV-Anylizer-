import logging
from collections import defaultdict
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models.candidate import Candidate
from models.job import Job
from models.job_skill import JobSkill
from models.skill import Skill
from services.job_extraction import JobExtractionError, JobInfo, extract_job_info
from services.job_persistence import (
    JobPersistenceError,
    create_manual_job,
    decode_list,
    save_job,
)
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


class CreateJobRequest(BaseModel):
    title: str
    company_name: str
    required_experience_years: float = Field(ge=0)
    required_education: str | None = None
    required_skills: list[str] = Field(min_length=1)
    posting_date: date | None = None
    location: str | None = None
    department: str | None = None
    employment_type: str | None = None
    description: str | None = None
    responsibilities: list[str] = []
    required_qualifications: list[str] = []
    preferred_qualifications: list[str] = []


class JobSkillSummary(BaseModel):
    name: str
    is_required: bool


class JobSummary(BaseModel):
    job_id: int
    title: str
    company_name: str | None
    required_experience_years: float | None
    required_education: str | None
    posting_date: date | None
    skills: list[JobSkillSummary]
    required_skills_count: int
    ready_to_match: bool
    created_at: datetime | None


class JobListResponse(BaseModel):
    jobs: list[JobSummary]
    total_candidates: int


class JobDetail(BaseModel):
    job_id: int
    title: str
    company_name: str | None
    location: str | None
    department: str | None
    employment_type: str | None
    description: str | None
    required_education: str | None
    required_experience_years: float | None
    experience_description: str | None
    posting_date: date | None
    responsibilities: list[str]
    required_qualifications: list[str]
    preferred_qualifications: list[str]
    skills: list[JobSkillSummary]
    required_skills_count: int
    ready_to_match: bool
    created_at: datetime | None


class JobAnalyzePreviewResponse(BaseModel):
    job_info: JobInfo
    description: str


def _compute_ready_to_match(
    required_skills_count: int,
    required_experience_years: float | None,
    required_education: str | None,
) -> bool:
    """A job is ready to match when it has at least one usable structured
    requirement - the exact same rule `services/matching.py` uses to decide
    whether a criterion contributes to a candidate's score, so this label can
    never contradict actual scoring behavior."""
    has_valid_experience = (
        required_experience_years is not None and required_experience_years > 0
    )
    has_valid_education = normalize_education_level(required_education) is not None
    return required_skills_count > 0 or has_valid_experience or has_valid_education


def _job_to_detail(job: Job, skills: list[JobSkillSummary]) -> JobDetail:
    required_skills_count = sum(1 for skill in skills if skill.is_required)
    ready_to_match = _compute_ready_to_match(
        required_skills_count, job.required_experience_years, job.required_education
    )

    return JobDetail(
        job_id=job.id,
        title=job.title,
        company_name=job.company_name,
        location=job.location,
        department=job.department,
        employment_type=job.employment_type,
        description=job.description,
        required_education=job.required_education,
        required_experience_years=job.required_experience_years,
        experience_description=job.experience_description,
        posting_date=job.posting_date,
        responsibilities=decode_list(job.responsibilities),
        required_qualifications=decode_list(job.required_qualifications),
        preferred_qualifications=decode_list(job.preferred_qualifications),
        skills=skills,
        required_skills_count=required_skills_count,
        ready_to_match=ready_to_match,
        created_at=job.created_at,
    )


def _load_skills_for_job(db: Session, job_id: int) -> list[JobSkillSummary]:
    skill_rows = (
        db.query(JobSkill.is_required, Skill.name)
        .join(Skill, Skill.id == JobSkill.skill_id)
        .filter(JobSkill.job_id == job_id)
        .all()
    )
    return [JobSkillSummary(name=row.name, is_required=row.is_required) for row in skill_rows]


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


@router.post("/analyze-preview", response_model=JobAnalyzePreviewResponse)
async def analyze_job_preview(payload: JobDescriptionRequest):
    """Analyze a pasted job posting WITHOUT persisting anything. The user
    reviews/corrects the returned structure client-side, then submits it to
    `POST /api/jobs` to actually save it."""
    description = payload.description.strip()
    if not description:
        raise HTTPException(
            status_code=400, detail="Job description text is required."
        )

    try:
        job_info = extract_job_info(description)
    except JobExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return JobAnalyzePreviewResponse(job_info=job_info, description=description)


@router.post("", response_model=JobDetail, status_code=201)
def create_job(payload: CreateJobRequest, db: Session = Depends(get_db)):
    """Create a job from structured form fields - no NLP/LLM extraction."""
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Job title is required.")

    company_name = payload.company_name.strip()
    if not company_name:
        raise HTTPException(status_code=400, detail="Company is required.")

    required_education = (
        payload.required_education.strip() if payload.required_education else None
    ) or None

    seen: set[str] = set()
    skill_names: list[str] = []
    for raw in payload.required_skills:
        name = raw.strip()
        if not name:
            continue
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        skill_names.append(name)

    if not skill_names:
        raise HTTPException(
            status_code=400, detail="At least one required skill is needed."
        )

    location = (payload.location.strip() if payload.location else None) or None
    department = (payload.department.strip() if payload.department else None) or None
    employment_type = (
        payload.employment_type.strip() if payload.employment_type else None
    ) or None
    description = (payload.description.strip() if payload.description else None) or None

    try:
        job = create_manual_job(
            db,
            title=title,
            company_name=company_name,
            required_experience_years=payload.required_experience_years,
            required_education=required_education,
            posting_date=payload.posting_date,
            skill_names=skill_names,
            location=location,
            department=department,
            employment_type=employment_type,
            description=description,
            responsibilities=payload.responsibilities,
            required_qualifications=payload.required_qualifications,
            preferred_qualifications=payload.preferred_qualifications,
        )
    except JobPersistenceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    skills = [JobSkillSummary(name=name, is_required=True) for name in skill_names]
    return _job_to_detail(job, skills)


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
        ready_to_match = _compute_ready_to_match(
            required_skills_count, job.required_experience_years, job.required_education
        )

        summaries.append(
            JobSummary(
                job_id=job.id,
                title=job.title,
                company_name=job.company_name,
                required_experience_years=job.required_experience_years,
                required_education=job.required_education,
                posting_date=job.posting_date,
                skills=skills,
                required_skills_count=required_skills_count,
                ready_to_match=ready_to_match,
                created_at=job.created_at,
            )
        )

    total_candidates = db.query(func.count(Candidate.id)).scalar() or 0

    return JobListResponse(jobs=summaries, total_candidates=total_candidates)


@router.get("/{job_id}", response_model=JobDetail)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    skills = _load_skills_for_job(db, job_id)
    return _job_to_detail(job, skills)


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
