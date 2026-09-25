"""Comparison endpoint: two CVs head to head, optionally against one Job.

A pure read. It creates no Application and stores no Match Result, so a user
may compare any two CVs - including CVs that were never applied to the Job -
without changing what the ranking says.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from services.comparison import (
    ComparisonResponse,
    CvNotFoundError,
    JobNotFoundError,
    SameCvError,
    compare_cvs,
)

router = APIRouter()


@router.get("", response_model=ComparisonResponse)
def compare(
    cv_a: int = Query(..., ge=1, description="The CV shown on the left."),
    cv_b: int = Query(..., ge=1, description="The CV shown on the right."),
    job_id: int | None = Query(
        None,
        ge=1,
        description="Score both CVs against this Job. Omit for a profile-only diff.",
    ),
    db: Session = Depends(get_db),
):
    """Compare `cv_a` with `cv_b`, against `job_id` when one is given."""
    try:
        return compare_cvs(db, cv_a, cv_b, job_id=job_id)
    except SameCvError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (CvNotFoundError, JobNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
