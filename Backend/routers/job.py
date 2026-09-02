from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from services.job_extraction import JobExtractionError, extract_job_info
from services.job_persistence import JobPersistenceError, save_job

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
