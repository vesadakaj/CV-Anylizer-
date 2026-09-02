import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services.job_extraction import JobExtractionError, extract_job_info
from services.job_persistence import JobPersistenceError, save_job
from services.matching import (
    JobNotFoundError,
    JobRankingResponse,
    MatchPersistenceError,
    get_job_candidate_matches,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class JobDescriptionRequest(BaseModel):
    description: str


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
