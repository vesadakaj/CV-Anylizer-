"""Candidates: the people behind the CVs, with their CVs and Applications,
and the "Add to job" action."""

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.job import Job
from models.match_result import MatchResult
from models.user import User
from routers.applications import ApplicationRow, application_result_to_row
from routers.dependencies import get_current_user
from services.applications import (
    ApplicationPersistenceError,
    CandidateNotFoundError,
    CvOwnershipError,
    create_application_for_candidate,
)
from services.matching import CvNotFoundError, JobNotFoundError, MatchPersistenceError

logger = logging.getLogger(__name__)

router = APIRouter()


class CandidateListItem(BaseModel):
    id: int
    full_name: str
    email: str | None
    linkable: bool
    cv_count: int
    application_count: int
    last_uploaded_at: datetime | None


class CandidateListResponse(BaseModel):
    candidates: list[CandidateListItem]
    total: int
    limit: int
    offset: int
    search: str | None = None


class CandidateCv(BaseModel):
    cv_id: int
    file_name: str
    file_type: str
    uploaded_at: datetime | None
    uploaded_by: str | None


class CandidateApplication(BaseModel):
    application_id: int
    job_id: int
    job_title: str
    cv_id: int
    status: str  # "scored" | "unscorable"
    overall_score: float | None
    created_at: datetime | None


class CandidateDetail(BaseModel):
    id: int
    full_name: str
    email: str | None
    phone: str | None
    location: str | None
    linkable: bool
    created_at: datetime | None
    cvs: list[CandidateCv]
    applications: list[CandidateApplication]


class AddToJobRequest(BaseModel):
    job_id: int
    cv_id: int | None = None


@router.get("", response_model=CandidateListResponse)
def list_candidates(
    search: str | None = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    cv_stats = (
        db.query(
            CV.candidate_id.label("candidate_id"),
            func.count(CV.id).label("cv_count"),
            func.max(CV.uploaded_at).label("last_uploaded_at"),
        )
        .group_by(CV.candidate_id)
        .subquery()
    )
    application_stats = (
        db.query(
            Application.candidate_id.label("candidate_id"),
            func.count(Application.id).label("application_count"),
        )
        .group_by(Application.candidate_id)
        .subquery()
    )

    query = (
        db.query(
            Candidate,
            func.coalesce(cv_stats.c.cv_count, 0).label("cv_count"),
            func.coalesce(application_stats.c.application_count, 0).label("application_count"),
            cv_stats.c.last_uploaded_at.label("last_uploaded_at"),
        )
        .outerjoin(cv_stats, cv_stats.c.candidate_id == Candidate.id)
        .outerjoin(application_stats, application_stats.c.candidate_id == Candidate.id)
    )

    term = (search or "").strip()
    if term:
        pattern = f"%{term}%"
        query = query.filter(
            or_(Candidate.full_name.ilike(pattern), Candidate.email.ilike(pattern))
        )

    total = query.count()
    rows = (
        query.order_by(cv_stats.c.last_uploaded_at.desc(), Candidate.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return CandidateListResponse(
        candidates=[
            CandidateListItem(
                id=candidate.id,
                full_name=candidate.full_name,
                email=candidate.email,
                linkable=candidate.linkable,
                cv_count=cv_count,
                application_count=application_count,
                last_uploaded_at=last_uploaded_at,
            )
            for candidate, cv_count, application_count, last_uploaded_at in rows
        ],
        total=total,
        limit=limit,
        offset=offset,
        search=term or None,
    )


@router.get("/{candidate_id}", response_model=CandidateDetail)
def get_candidate(candidate_id: int, db: Session = Depends(get_db)):
    candidate = db.get(Candidate, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=404, detail=f"Candidate {candidate_id} not found.")

    cvs = [
        CandidateCv(
            cv_id=cv.id,
            file_name=cv.file_name,
            file_type=cv.file_type,
            uploaded_at=cv.uploaded_at,
            uploaded_by=uploaded_by,
        )
        for cv, uploaded_by in db.query(CV, User.full_name)
        .outerjoin(User, User.id == CV.uploaded_by_user_id)
        .filter(CV.candidate_id == candidate_id)
        .order_by(CV.uploaded_at.desc(), CV.id.desc())
        .all()
    ]

    applications = [
        CandidateApplication(
            application_id=application.id,
            job_id=job.id,
            job_title=job.title,
            cv_id=application.cv_id,
            status="scored" if overall_score is not None else "unscorable",
            overall_score=overall_score,
            created_at=application.created_at,
        )
        for application, job, overall_score in db.query(
            Application, Job, MatchResult.overall_score
        )
        .join(Job, Job.id == Application.job_id)
        .outerjoin(MatchResult, MatchResult.application_id == Application.id)
        .filter(Application.candidate_id == candidate_id)
        .order_by(Application.created_at.desc(), Application.id.desc())
        .all()
    ]

    return CandidateDetail(
        id=candidate.id,
        full_name=candidate.full_name,
        email=candidate.email,
        phone=candidate.phone,
        location=candidate.location,
        linkable=candidate.linkable,
        created_at=candidate.created_at,
        cvs=cvs,
        applications=applications,
    )


@router.post("/{candidate_id}/applications", response_model=ApplicationRow, status_code=201)
def add_candidate_to_job(
    candidate_id: int,
    payload: AddToJobRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add this Candidate to a Job, scored from `cv_id` or their newest CV.
    Repoints the existing Application when one exists for that Job."""
    try:
        result = create_application_for_candidate(
            db, candidate_id, payload.job_id, user, cv_id=payload.cv_id
        )
    except (CandidateNotFoundError, JobNotFoundError, CvNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except CvOwnershipError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (ApplicationPersistenceError, MatchPersistenceError) as exc:
        logger.error("Application persistence failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Could not save the application."
        ) from exc

    return application_result_to_row(result)
