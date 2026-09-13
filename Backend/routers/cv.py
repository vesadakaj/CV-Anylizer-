from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models.job import Job
from models.user import User
from routers.applications import ApplicationRow, application_result_to_row
from routers.dependencies import get_current_user
from services.applications import (
    ApplicationPersistenceError,
    create_or_update_applications,
)
from services.candidate_extraction import (
    CandidateExtractionError,
    extract_candidate_info,
)
from services.cv_persistence import CvPersistenceError, save_cv
from services.matching import MatchPersistenceError
from services.text_extraction import TextExtractionError, extract_text

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/upload")
async def upload_cv(
    file: UploadFile = File(...),
    job_id: int | None = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Extract one CV and store it. Without `job_id` the CV is Unattached;
    with it, the Application for that Job is created or updated and scored
    in the same request."""
    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail="Only PDF and DOCX files are supported."
        )

    # Reject an unknown Job before spending an LLM call on the file.
    if job_id is not None and db.get(Job, job_id) is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found.")

    contents = await file.read()
    if len(contents) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400, detail="File too large. Maximum size is 5MB."
        )

    try:
        extracted_text = extract_text(extension, contents)
    except TextExtractionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not extracted_text:
        raise HTTPException(
            status_code=400,
            detail=(
                "No text could be found in this file. It may be a scanned "
                "or image-only document, which isn't supported yet."
            ),
        )

    try:
        candidate_info = extract_candidate_info(extracted_text)
    except CandidateExtractionError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    try:
        saved = save_cv(
            db,
            candidate_info,
            file_name=file.filename,
            file_type=extension,
            extracted_text=extracted_text,
            uploaded_by_user_id=user.id,
        )
    except CvPersistenceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    application: ApplicationRow | None = None
    if job_id is not None:
        try:
            results = create_or_update_applications(db, job_id, [saved.cv_id], user)
        except (ApplicationPersistenceError, MatchPersistenceError) as exc:
            raise HTTPException(
                status_code=500,
                detail=f"The CV was saved but could not be attached to the job: {exc}",
            ) from exc
        application = application_result_to_row(results[0])

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(contents),
        "extracted_text": extracted_text,
        "candidate_info": candidate_info,
        "cv_id": saved.cv_id,
        "candidate_id": saved.candidate_id,
        "candidate_matched_existing": saved.candidate_matched_existing,
        "linkable": saved.linkable,
        "application": (
            {"id": application.application_id, "status": application.status}
            if application
            else None
        ),
        "match": application.match if application else None,
    }
