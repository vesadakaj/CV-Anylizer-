from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from routers.cv import router as cv_router
from routers.job import router as job_router
from database import get_db
from models.candidate import Candidate


app = FastAPI(title="CV Analyzer API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    cv_router,
    prefix="/api/cv",
    tags=["cv"]
)

app.include_router(
    job_router,
    prefix="/api/jobs",
    tags=["jobs"]
)


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/test-candidate")
def create_test_candidate(db: Session = Depends(get_db)):
    candidate = Candidate(
        full_name="Test Candidate",
        email="test@example.com",
        phone="123456",
        location="Prishtina"
    )

    db.add(candidate)
    db.commit()
    db.refresh(candidate)

    return {
        "id": candidate.id,
        "full_name": candidate.full_name,
        "email": candidate.email,
        "phone": candidate.phone,
        "location": candidate.location
    }