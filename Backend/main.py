from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.cv import router as cv_router

app = FastAPI(title="CV Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cv_router, prefix="/api/cv", tags=["cv"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
