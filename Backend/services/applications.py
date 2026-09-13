"""Create or update Applications and score them in one transaction.

An Application is one Candidate considered for one Job, scored from exactly
one CV. There is at most one per (candidate, job): attaching a newer CV of
the same person to the same Job repoints `cv_id` and rescores instead of
adding a row (ADR 0001). The unique constraint on the table is the last
line of defence; this module never relies on it to detect duplicates.
"""

from dataclasses import dataclass
from datetime import date
from typing import Optional

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.job import Job
from models.user import User
from services.matching import (
    CvNotFoundError,
    JobNotFoundError,
    MatchResponse,
    outcome_to_response,
    score_applications,
)

STATUS_CREATED = "created"
STATUS_UPDATED = "updated"


class CandidateNotFoundError(Exception):
    pass


class CvOwnershipError(Exception):
    """The CV belongs to a different Candidate than the one named."""


class ApplicationPersistenceError(Exception):
    pass


@dataclass(frozen=True)
class ApplicationResult:
    application_id: int
    job_id: int
    candidate_id: int
    cv_id: int
    candidate_name: str
    status: str  # "created" | "updated"
    match: MatchResponse


def _load_cvs_in_order(db: Session, cv_ids: list[int]) -> list[CV]:
    """The requested CVs in request order, deduplicated, all present."""
    wanted: list[int] = []
    for cv_id in cv_ids:
        if cv_id not in wanted:
            wanted.append(cv_id)
    if not wanted:
        return []

    by_id = {cv.id: cv for cv in db.query(CV).filter(CV.id.in_(wanted)).all()}
    missing = [cv_id for cv_id in wanted if cv_id not in by_id]
    if missing:
        raise CvNotFoundError(f"CV {missing[0]} not found.")
    return [by_id[cv_id] for cv_id in wanted]


def create_or_update_applications(
    db: Session,
    job_id: int,
    cv_ids: list[int],
    user: User,
    *,
    today: Optional[date] = None,
) -> list[ApplicationResult]:
    """Attach each CV to the Job and score it, all in one transaction.

    For each CV: when an Application already exists for (its Candidate,
    job) the Application is repointed at this CV and reported as
    "updated"; otherwise one is created and reported as "created". When a
    batch holds two CVs of the same Candidate, the later one wins, exactly
    as if it had been uploaded afterwards. Nothing is committed unless every
    CV was attached and scored.
    """
    job = db.get(Job, job_id)
    if job is None:
        raise JobNotFoundError(f"Job {job_id} not found.")

    cvs = _load_cvs_in_order(db, cv_ids)
    if not cvs:
        return []

    try:
        existing_by_candidate = {
            application.candidate_id: application
            for application in db.query(Application)
            .filter(
                Application.job_id == job_id,
                Application.candidate_id.in_({cv.candidate_id for cv in cvs}),
            )
            .all()
        }

        status_by_application: dict[int, str] = {}
        ordered: list[Application] = []
        for cv in cvs:
            application = existing_by_candidate.get(cv.candidate_id)
            if application is None:
                application = Application(
                    candidate_id=cv.candidate_id,
                    job_id=job_id,
                    cv_id=cv.id,
                    created_by_user_id=user.id,
                )
                db.add(application)
                db.flush()
                existing_by_candidate[cv.candidate_id] = application
                status_by_application[application.id] = STATUS_CREATED
                ordered.append(application)
            else:
                application.cv_id = cv.id
                if application.id not in status_by_application:
                    status_by_application[application.id] = STATUS_UPDATED
                    ordered.append(application)
        db.flush()

        outcomes = score_applications(db, ordered, today=today)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise ApplicationPersistenceError(
            f"Could not save application(s): {exc}"
        ) from exc

    return [
        ApplicationResult(
            application_id=application.id,
            job_id=job_id,
            candidate_id=application.candidate_id,
            cv_id=application.cv_id,
            candidate_name=outcomes[application.id].candidate_name,
            status=status_by_application[application.id],
            match=outcome_to_response(outcomes[application.id], application.id),
        )
        for application in ordered
    ]


def create_application_for_candidate(
    db: Session,
    candidate_id: int,
    job_id: int,
    user: User,
    *,
    cv_id: Optional[int] = None,
    today: Optional[date] = None,
) -> ApplicationResult:
    """"Add this Candidate to a Job", scored from `cv_id` or, by default,
    the Candidate's newest CV. A CV of a different Candidate is refused."""
    candidate = db.get(Candidate, candidate_id)
    if candidate is None:
        raise CandidateNotFoundError(f"Candidate {candidate_id} not found.")

    if cv_id is None:
        cv = (
            db.query(CV)
            .filter(CV.candidate_id == candidate_id)
            .order_by(CV.uploaded_at.desc(), CV.id.desc())
            .first()
        )
        if cv is None:
            raise CvNotFoundError(f"Candidate {candidate_id} has no CV.")
    else:
        cv = db.get(CV, cv_id)
        if cv is None:
            raise CvNotFoundError(f"CV {cv_id} not found.")
        if cv.candidate_id != candidate_id:
            raise CvOwnershipError(
                f"CV {cv_id} does not belong to candidate {candidate_id}."
            )

    results = create_or_update_applications(db, job_id, [cv.id], user, today=today)
    return results[0]
