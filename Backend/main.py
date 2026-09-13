import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.cv import router as cv_router
from routers.job import router as job_router
from routers.match import router as match_router

DEFAULT_CORS_ORIGINS = "http://localhost:5173"


def parse_cors_origins(value: str | None) -> list[str]:
    """Split the comma-separated `CORS_ORIGINS` setting into origins."""
    raw = value if value and value.strip() else DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app = FastAPI(title="CV Analyzer API")


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(os.getenv("CORS_ORIGINS")),
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

app.include_router(
    match_router,
    prefix="/api/match",
    tags=["match"]
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
