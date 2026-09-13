"""Read endpoints for CVs: the dashboard's Unattached batch and one CV's
full Profile in the shape the upload endpoint returns."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import exists
from sqlalchemy.orm import Session

from database import get_db
from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.cv_language import CvLanguage
from models.cv_skill import CvSkill
from models.education import Education
from models.job import Job
from models.language import Language
from models.project import Project
from models.skill import Skill
from models.user import User
from models.work_experience import WorkExperience
from routers.dependencies import get_current_user
from services.candidate_extraction import (
    CandidateInfo,
    EducationItem,
    LanguageItem,
    ProjectItem,
    SkillItem,
    WorkExperienceItem,
)

router = APIRouter()


class CandidateSummary(BaseModel):
    id: int
    full_name: str
    email: str | None
    phone: str | None
    location: str | None
    linkable: bool


class UnattachedCv(BaseModel):
    cv_id: int
    file_name: str
    file_type: str
    uploaded_at: datetime | None
    linkable: bool
    candidate: CandidateSummary


class CvApplicationSummary(BaseModel):
    application_id: int
    job_id: int
    job_title: str
    created_at: datetime | None


class CvDetail(BaseModel):
    cv_id: int
    candidate_id: int
    filename: str
    file_type: str
    uploaded_at: datetime | None
    uploaded_by: str | None
    linkable: bool
    extracted_text: str | None
    candidate_info: CandidateInfo
    applications: list[CvApplicationSummary]


def _iso(value: date | None) -> str | None:
    return value.isoformat() if value else None


def _candidate_summary(candidate: Candidate) -> CandidateSummary:
    return CandidateSummary(
        id=candidate.id,
        full_name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        location=candidate.location,
        linkable=candidate.linkable,
    )


def load_candidate_info(db: Session, cv: CV, candidate: Candidate) -> CandidateInfo:
    """Rebuild the Profile of one CV in the `candidate_info` shape the
    upload endpoint returns, so the Extracted Information card can be
    filled after a reload."""
    education = [
        EducationItem(
            institution=row.institution,
            degree=row.degree,
            field_of_study=row.field_of_study,
            start_date=_iso(row.start_date),
            end_date=_iso(row.end_date),
            description=row.description,
        )
        for row in db.query(Education).filter(Education.cv_id == cv.id).order_by(Education.id)
    ]
    work_experience = [
        WorkExperienceItem(
            company_name=row.company_name,
            position_title=row.position_title,
            description=row.description,
            start_date=_iso(row.start_date),
            end_date=_iso(row.end_date),
            is_current=bool(row.is_current),
        )
        for row in db.query(WorkExperience)
        .filter(WorkExperience.cv_id == cv.id)
        .order_by(WorkExperience.id)
    ]
    projects = [
        ProjectItem(
            name=row.name,
            description=row.description,
            technologies=row.technologies,
            project_url=row.project_url,
        )
        for row in db.query(Project).filter(Project.cv_id == cv.id).order_by(Project.id)
    ]
    skills = [
        SkillItem(
            name=row.name,
            proficiency_level=row.proficiency_level,
            years_experience=row.years_experience,
        )
        for row in db.query(Skill.name, CvSkill.proficiency_level, CvSkill.years_experience)
        .join(CvSkill, CvSkill.skill_id == Skill.id)
        .filter(CvSkill.cv_id == cv.id)
        .order_by(CvSkill.id)
    ]
    languages = [
        LanguageItem(name=row.name, level=row.level)
        for row in db.query(Language.name, CvLanguage.level)
        .join(CvLanguage, CvLanguage.language_id == Language.id)
        .filter(CvLanguage.cv_id == cv.id)
        .order_by(CvLanguage.id)
    ]

    return CandidateInfo(
        full_name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        location=candidate.location,
        education=education,
        work_experience=work_experience,
        projects=projects,
        skills=skills,
        languages=languages,
    )


@router.get("/unattached", response_model=list[UnattachedCv])
def list_unattached_cvs(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    """The current User's CVs that no Application points at, newest first.
    Ownership here is a convenience filter for the dashboard batch, not an
    access rule (ADR 0002)."""
    attached = exists().where(Application.cv_id == CV.id)
    rows = (
        db.query(CV, Candidate)
        .join(Candidate, Candidate.id == CV.candidate_id)
        .filter(CV.uploaded_by_user_id == user.id, ~attached)
        .order_by(CV.uploaded_at.desc(), CV.id.desc())
        .all()
    )
    return [
        UnattachedCv(
            cv_id=cv.id,
            file_name=cv.file_name,
            file_type=cv.file_type,
            uploaded_at=cv.uploaded_at,
            linkable=candidate.linkable,
            candidate=_candidate_summary(candidate),
        )
        for cv, candidate in rows
    ]


@router.get("/{cv_id}", response_model=CvDetail)
def get_cv(cv_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(CV, Candidate)
        .join(Candidate, Candidate.id == CV.candidate_id)
        .filter(CV.id == cv_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail=f"CV {cv_id} not found.")
    cv, candidate = row

    uploader = db.get(User, cv.uploaded_by_user_id)
    applications = [
        CvApplicationSummary(
            application_id=application.id,
            job_id=job.id,
            job_title=job.title,
            created_at=application.created_at,
        )
        for application, job in db.query(Application, Job)
        .join(Job, Job.id == Application.job_id)
        .filter(Application.cv_id == cv.id)
        .order_by(Application.created_at.desc(), Application.id.desc())
        .all()
    ]

    return CvDetail(
        cv_id=cv.id,
        candidate_id=candidate.id,
        filename=cv.file_name,
        file_type=cv.file_type,
        uploaded_at=cv.uploaded_at,
        uploaded_by=uploader.full_name if uploader else None,
        linkable=candidate.linkable,
        extracted_text=cv.extracted_text,
        candidate_info=load_candidate_info(db, cv, candidate),
        applications=applications,
    )
