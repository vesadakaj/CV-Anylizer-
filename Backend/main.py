import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.applications import router as applications_router
from routers.auth import router as auth_router
from routers.candidates import router as candidates_router
from routers.cv import router as cv_router
from routers.cvs import router as cvs_router
from routers.dependencies import get_current_user
from routers.job import router as job_router
from routers.users import router as users_router
from services.auth import jwt_secret

DEFAULT_CORS_ORIGINS = "http://localhost:5173"

# The only routes reachable without a token. Everything else is attached to
# `get_current_user` at router level below, so a new router cannot be
# forgotten: it either goes in this list or it is protected.
OPEN_ROUTES = {("GET", "/health"), ("POST", "/api/auth/login")}


def parse_cors_origins(value: str | None) -> list[str]:
    """Split the comma-separated `CORS_ORIGINS` setting into origins."""
    raw = value if value and value.strip() else DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Fail at startup, not on the first login, when the secret is missing.
    jwt_secret()
    yield


app = FastAPI(title="CV Analyzer API", lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=parse_cors_origins(os.getenv("CORS_ORIGINS")),
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    auth_router,
    prefix="/api/auth",
    tags=["auth"],
)

app.include_router(
    users_router,
    prefix="/api/users",
    tags=["users"],
)

app.include_router(
    cv_router,
    prefix="/api/cv",
    tags=["cv"],
    dependencies=[Depends(get_current_user)],
)

app.include_router(
    job_router,
    prefix="/api/jobs",
    tags=["jobs"],
    dependencies=[Depends(get_current_user)],
)

app.include_router(
    cvs_router,
    prefix="/api/cvs",
    tags=["cvs"],
    dependencies=[Depends(get_current_user)],
)

app.include_router(
    candidates_router,
    prefix="/api/candidates",
    tags=["candidates"],
    dependencies=[Depends(get_current_user)],
)

app.include_router(
    applications_router,
    prefix="/api/applications",
    tags=["applications"],
    dependencies=[Depends(get_current_user)],
)


@app.get("/health")
def health_check():
    return {"status": "ok"}
