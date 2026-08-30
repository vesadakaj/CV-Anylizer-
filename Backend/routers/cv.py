from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from services.candidate_extraction import (
    CandidateExtractionError,
    extract_candidate_info,
)
from services.candidate_persistence import (
    CandidatePersistenceError,
    save_candidate,
)
from services.text_extraction import TextExtractionError, extract_text

router = APIRouter()

ALLOWED_EXTENSIONS = {".pdf", ".docx"}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/upload")
async def upload_cv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    extension = Path(file.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, detail="Only PDF and DOCX files are supported."
        )

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
        candidate = save_candidate(
            db,
            candidate_info,
            file_name=file.filename,
            file_type=extension,
            extracted_text=extracted_text,
        )
    except CandidatePersistenceError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": len(contents),
        "extracted_text": extracted_text,
        "candidate_info": candidate_info,
        "candidate_id": candidate.id,
    }
