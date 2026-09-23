"""Application endpoints and the response shapes shared by every route that
returns Application rows (`/api/jobs/{id}/applications`,
`/api/candidates/{id}/applications`)."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services.applications import ApplicationResult
from services.matching import (
    ApplicationNotFoundError,
    CvNotFoundError,
    JobNotFoundError,
    MatchPersistenceError,
    MatchResponse,
    get_application_match,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class ApplicationRow(BaseModel):
    application_id: int
    job_id: int
    candidate_id: int
    cv_id: int
    candidate_name: str
    status: str  # "created" | "updated"
    match: MatchResponse


def application_result_to_row(result: ApplicationResult) -> ApplicationRow:
    return ApplicationRow(
        application_id=result.application_id,
        job_id=result.job_id,
        candidate_id=result.candidate_id,
        cv_id=result.cv_id,
        candidate_name=result.candidate_name,
        status=result.status,
        match=result.match,
    )


@router.get("/{application_id}/match", response_model=MatchResponse)
def get_match(application_id: int, db: Session = Depends(get_db)):
    """The full breakdown and explanation of one Application's score."""
    try:
        return get_application_match(db, application_id)
    except (ApplicationNotFoundError, CvNotFoundError, JobNotFoundError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MatchPersistenceError as exc:
        logger.error("Match persistence failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Could not save the match result."
        ) from exc
