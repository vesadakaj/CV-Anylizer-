import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from services.matching import (
    CandidateNotFoundError,
    JobNotFoundError,
    MatchPersistenceError,
    MatchResponse,
    get_candidate_job_match,
    outcome_to_response,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{candidate_id}/{job_id}", response_model=MatchResponse)
def match_candidate_to_job(candidate_id: int, job_id: int, db: Session = Depends(get_db)):
    try:
        outcome = get_candidate_job_match(db, candidate_id, job_id)
    except CandidateNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except MatchPersistenceError as exc:
        logger.error("Match persistence failed: %s", exc)
        raise HTTPException(
            status_code=500, detail="Could not save the match result."
        ) from exc

    return outcome_to_response(outcome)
