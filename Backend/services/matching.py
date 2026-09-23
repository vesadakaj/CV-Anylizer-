"""Deterministic Application scoring.

This module is the matching layer. It is intentionally separate from the
NLP/LLM extraction layer (`services/candidate_extraction.py` and
`services/job_extraction.py`): it never calls an LLM, never reads raw CV or
job-description text, and never uses embeddings. It only reads already
-persisted, structured rows (CV, Candidate, Job, CvSkill, JobSkill, Skill,
WorkExperience, Education) and combines them with a fixed, explainable
formula.

Every score belongs to an Application and is computed from the one CV that
Application points at (ADR 0001), so a later CV for the same person never
moves an earlier Job's ranking. The result is stored 1:1 with the
Application together with `ALGORITHM_VERSION`; a ranking read recomputes
and re-stores any row that is missing or carries an older version.

Storage convention: `MatchResult` stores every score column (overall_score,
skill_score, experience_score, education_score, language_score) as a
PERCENTAGE in the 0-100 range, matching the API response. Internally, this
module computes component scores as ratios in the 0.0-1.0 range and converts
to percentages only at the API/persistence boundary (`_to_percent`).
"""

from __future__ import annotations

import logging
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Iterable, Optional

from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.cv_skill import CvSkill
from models.education import Education
from models.job import Job
from models.job_skill import JobSkill
from models.match_result import MatchResult
from models.skill import Skill
from models.work_experience import WorkExperience

logger = logging.getLogger(__name__)

# Bump whenever the scoring formula or its inputs change. Stored Match
# Results carrying an older version are recomputed the next time they are
# read, so a formula change never requires a data migration.
ALGORITHM_VERSION = 1


# --- Base weights (sum to 100). Language is informational only and never
# contributes to overall_score. ---
SKILL_BASE_WEIGHT = 50.0
EXPERIENCE_BASE_WEIGHT = 30.0
EDUCATION_BASE_WEIGHT = 20.0

# Education hierarchy: High School < Bachelor < Master < PhD.
# Only unambiguous variants are normalized; anything else is "unidentified".
EDUCATION_LEVELS: dict[str, int] = {
    "high school": 0,
    "secondary school": 0,
    "bachelor's": 1,
    "bachelors": 1,
    "bachelor": 1,
    "b.sc": 1,
    "bsc": 1,
    "master's": 2,
    "masters": 2,
    "master": 2,
    "m.sc": 2,
    "msc": 2,
    "doctorate": 3,
    "doctoral": 3,
    "ph.d": 3,
    "phd": 3,
}
EDUCATION_LEVEL_NAMES = {0: "High School", 1: "Bachelor", 2: "Master", 3: "PhD"}

AVG_DAYS_PER_YEAR = 365.25


class CvNotFoundError(Exception):
    pass


class JobNotFoundError(Exception):
    pass


class ApplicationNotFoundError(Exception):
    pass


class MatchPersistenceError(Exception):
    pass


# --------------------------------------------------------------------------
# Internal data shapes
# --------------------------------------------------------------------------


@dataclass
class SkillScoreResult:
    available: bool
    score: Optional[float]
    matched_skills: list[str]
    missing_required_skills: list[str]
    matched_count: int
    total_required: int


@dataclass
class ExperienceScoreResult:
    available: bool
    score: Optional[float]
    candidate_experience_years: float
    required_experience_years: Optional[float]


@dataclass
class EducationScoreResult:
    available: bool
    score: Optional[float]
    candidate_level_name: Optional[str]
    required_level_name: Optional[str]
    candidate_field_of_study: Optional[str]
    reason: Optional[str] = None


@dataclass
class CvMatchInput:
    """The Profile of one CV, plus the identity of the Candidate it belongs
    to. This is the only candidate-side input the scorer ever sees."""

    cv_id: int
    candidate_id: int
    full_name: str
    skill_ids: set[int]
    work_experience_rows: list[tuple[Optional[date], Optional[date], bool]]
    education_rows: list[tuple[Optional[str], Optional[str]]]  # (degree, field_of_study)


@dataclass
class JobMatchInput:
    job_id: int
    title: str
    required_skill_ids: set[int]
    required_skill_names: dict[int, str]
    required_experience_years: Optional[float]
    required_education_level: Optional[int]
    required_education_raw: Optional[str]
    # Preferred skills are shown in the explanation and never scored.
    preferred_skill_ids: set[int]
    preferred_skill_names: dict[int, str]


@dataclass
class MatchOutcome:
    cv_id: int
    candidate_id: int
    job_id: int
    candidate_name: str
    job_title: str
    overall_score: Optional[float]  # percentage 0-100, or None if unscorable
    skill: SkillScoreResult
    experience: ExperienceScoreResult
    education: EducationScoreResult
    available_criteria: list[str]
    effective_weights: dict[str, float]
    explanation: str
    preferred_skills_matched: list[str]
    total_preferred_skills: int


# --------------------------------------------------------------------------
# API response schemas
# --------------------------------------------------------------------------


class MatchResponse(BaseModel):
    """The full breakdown and explanation of one Application's score."""

    application_id: int
    candidate_id: int
    cv_id: int
    job_id: int
    candidate_name: str
    job_title: str
    status: str  # "scored" | "unscorable"
    algorithm_version: int = ALGORITHM_VERSION
    overall_score: Optional[float]
    skill_score: Optional[float]
    experience_score: Optional[float]
    education_score: Optional[float]
    language_score: Optional[float] = None
    matched_skills: list[str]
    missing_required_skills: list[str]
    matched_required_skills_count: int
    total_required_skills: int
    candidate_experience_years: float
    required_experience_years: Optional[float]
    candidate_education_level: Optional[str]
    required_education_level: Optional[str]
    candidate_field_of_study: Optional[str] = None
    preferred_skills_matched: list[str] = []
    total_preferred_skills: int = 0
    available_criteria: list[str]
    effective_weights: dict[str, float]
    explanation: str


class RankedApplicationResponse(BaseModel):
    """One row of a Job's ranking. Deliberately summary-only: the breakdown
    is served per Application by `GET /api/applications/{id}/match`."""

    rank: int
    application_id: int
    candidate_id: int
    cv_id: int
    candidate_name: str
    status: str  # "scored" | "unscorable"
    overall_score: Optional[float]


class JobRankingResponse(BaseModel):
    job_id: int
    job_title: str
    total_applications: int
    returned_applications: int
    limit: int
    offset: int
    minimum_score: Optional[float] = None
    applications: list[RankedApplicationResponse]


# --------------------------------------------------------------------------
# Pure scoring helpers (no DB access - fully unit-testable)
# --------------------------------------------------------------------------


def _clamp01(value: float) -> float:
    return max(0.0, min(value, 1.0))


def normalize_education_level(text: Optional[str]) -> Optional[int]:
    """Map free-text education wording to a hierarchy level, or None if it
    cannot be confidently identified."""
    if not text:
        return None

    lowered = text.lower()
    best: Optional[int] = None
    for keyword, level in EDUCATION_LEVELS.items():
        if keyword in lowered and (best is None or level > best):
            best = level

    return best


def compute_total_experience_years(
    rows: list[tuple[Optional[date], Optional[date], bool]], today: date
) -> float:
    """Sum non-overlapping employment periods, in years.

    - Records with no start_date are ignored (cannot be placed on a timeline).
    - Records with no end_date and is_current=False are ignored (no end date
      may be invented).
    - is_current=True uses `today` as the effective end date.
    - Invalid ranges (end before start) are ignored.
    - Overlapping periods are merged before summing so concurrent jobs are not
      double-counted.
    """
    periods: list[tuple[date, date]] = []
    for start, end, is_current in rows:
        if start is None:
            continue
        effective_end = today if is_current else end
        if effective_end is None:
            continue
        if effective_end < start:
            continue
        periods.append((start, effective_end))

    if not periods:
        return 0.0

    periods.sort(key=lambda period: period[0])
    merged = [periods[0]]
    for start, end in periods[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))

    total_days = sum((end - start).days for start, end in merged)
    return max(total_days / AVG_DAYS_PER_YEAR, 0.0)


def compute_skill_score(
    candidate_skill_ids: set[int],
    required_skill_ids: set[int],
    required_skill_names: dict[int, str],
) -> SkillScoreResult:
    if not required_skill_ids:
        return SkillScoreResult(
            available=False,
            score=None,
            matched_skills=[],
            missing_required_skills=[],
            matched_count=0,
            total_required=0,
        )

    matched_ids = candidate_skill_ids & required_skill_ids
    missing_ids = required_skill_ids - candidate_skill_ids

    score = _clamp01(len(matched_ids) / len(required_skill_ids))
    matched_names = sorted(
        {required_skill_names[i] for i in matched_ids}, key=str.lower
    )
    missing_names = sorted(
        {required_skill_names[i] for i in missing_ids}, key=str.lower
    )

    return SkillScoreResult(
        available=True,
        score=score,
        matched_skills=matched_names,
        missing_required_skills=missing_names,
        matched_count=len(matched_ids),
        total_required=len(required_skill_ids),
    )


def compute_experience_score(
    candidate_years: float, required_years: Optional[float]
) -> Optional[float]:
    if required_years is None:
        return None
    return _clamp01(candidate_years / required_years)


def compute_education_score(
    education_rows: list[tuple[Optional[str], Optional[str]]],
    required_level: Optional[int],
) -> EducationScoreResult:
    candidate_levels = [
        level
        for level in (normalize_education_level(degree) for degree, _ in education_rows)
        if level is not None
    ]
    candidate_level = max(candidate_levels) if candidate_levels else None
    candidate_level_name = (
        EDUCATION_LEVEL_NAMES[candidate_level] if candidate_level is not None else None
    )
    fields_of_study = sorted(
        {field.strip() for _, field in education_rows if field and field.strip()},
        key=str.lower,
    )
    candidate_field_of_study = ", ".join(fields_of_study) if fields_of_study else None

    if required_level is None:
        return EducationScoreResult(
            available=False,
            score=None,
            candidate_level_name=candidate_level_name,
            required_level_name=None,
            candidate_field_of_study=candidate_field_of_study,
            reason=(
                "The job's required education could not be mapped to a "
                "supported level (High School/Bachelor/Master/PhD)."
            ),
        )

    required_level_name = EDUCATION_LEVEL_NAMES[required_level]

    if candidate_level is None:
        return EducationScoreResult(
            available=True,
            score=0.0,
            candidate_level_name=None,
            required_level_name=required_level_name,
            candidate_field_of_study=candidate_field_of_study,
            reason="The candidate's education level could not be identified from persisted records.",
        )

    diff = required_level - candidate_level
    if diff <= 0:
        score = 1.0
    elif diff == 1:
        score = 0.5
    else:
        score = 0.0

    return EducationScoreResult(
        available=True,
        score=score,
        candidate_level_name=candidate_level_name,
        required_level_name=required_level_name,
        candidate_field_of_study=candidate_field_of_study,
    )


def combine_scores(
    skill: SkillScoreResult,
    experience: ExperienceScoreResult,
    education: EducationScoreResult,
) -> tuple[Optional[float], list[str], dict[str, float]]:
    """Dynamic weighting: only criteria the job actually specifies count.

    Returns (overall_score_percent_or_None, available_criteria, effective_weights).
    """
    components: list[tuple[str, float, float]] = []
    if skill.available:
        components.append(("skills", skill.score, SKILL_BASE_WEIGHT))
    if experience.available:
        components.append(("experience", experience.score, EXPERIENCE_BASE_WEIGHT))
    if education.available:
        components.append(("education", education.score, EDUCATION_BASE_WEIGHT))

    if not components:
        return None, [], {}

    weight_sum = sum(weight for _, _, weight in components)
    weighted = sum(score * weight for _, score, weight in components) / weight_sum
    overall = round(_clamp01(weighted) * 100, 2)
    available_criteria = [name for name, _, _ in components]
    effective_weights = {
        name: round((weight / weight_sum) * 100, 2) for name, _, weight in components
    }

    return overall, available_criteria, effective_weights


def _build_explanation(
    candidate_name: str,
    job_title: str,
    skill: SkillScoreResult,
    experience: ExperienceScoreResult,
    education: EducationScoreResult,
    available_criteria: list[str],
    effective_weights: dict[str, float],
    overall_score: Optional[float],
    preferred_skills_matched: Optional[list[str]] = None,
    total_preferred_skills: int = 0,
) -> str:
    if not available_criteria:
        return (
            f"{candidate_name} could not be scored against '{job_title}': the "
            "job has no usable structured requirements (no required skills, "
            "no valid required experience, and no mappable required education)."
        )

    parts: list[str] = []

    if skill.available:
        parts.append(
            f"Skills ({effective_weights['skills']:.2f}% weight): "
            f"{skill.matched_count}/{skill.total_required} required skills matched. "
            f"Matched: {', '.join(skill.matched_skills) or 'none'}. "
            f"Missing: {', '.join(skill.missing_required_skills) or 'none'}."
        )
    else:
        parts.append("Skills excluded: the job has no required skills on record.")

    if experience.available:
        parts.append(
            f"Experience ({effective_weights['experience']:.2f}% weight): "
            f"candidate has {experience.candidate_experience_years:.2f} years "
            f"vs {experience.required_experience_years:.2f} years required."
        )
    else:
        parts.append(
            "Experience excluded: the job has no valid required experience "
            "(missing, invalid, or zero)."
        )

    if education.available:
        parts.append(
            f"Education ({effective_weights['education']:.2f}% weight): "
            f"candidate level {education.candidate_level_name or 'unknown'} "
            f"vs required {education.required_level_name}."
        )
    else:
        parts.append(f"Education excluded: {education.reason}")

    if total_preferred_skills > 0:
        matched = preferred_skills_matched or []
        parts.append(
            f"Also has {len(matched)} of {total_preferred_skills} preferred "
            f"skills ({', '.join(matched) or 'none'}); preferred skills never "
            "count toward the score."
        )

    parts.append(f"Overall match: {overall_score:.2f}%.")

    return " ".join(parts)


def _score_cv_against_job(
    cv: CvMatchInput, job: JobMatchInput, today: date
) -> MatchOutcome:
    """The single deterministic scoring algorithm, reused by Application
    creation, the per-Application breakdown and the Job ranking."""
    candidate = cv
    skill_result = compute_skill_score(
        candidate.skill_ids, job.required_skill_ids, job.required_skill_names
    )

    preferred_matched = sorted(
        {
            job.preferred_skill_names[i]
            for i in (candidate.skill_ids & job.preferred_skill_ids)
        },
        key=str.lower,
    )

    candidate_years = compute_total_experience_years(
        candidate.work_experience_rows, today
    )
    experience_score = compute_experience_score(
        candidate_years, job.required_experience_years
    )
    experience_result = ExperienceScoreResult(
        available=experience_score is not None,
        score=experience_score,
        candidate_experience_years=round(candidate_years, 2),
        required_experience_years=(
            round(job.required_experience_years, 2)
            if job.required_experience_years is not None
            else None
        ),
    )

    education_result = compute_education_score(
        candidate.education_rows, job.required_education_level
    )

    overall, available_criteria, effective_weights = combine_scores(
        skill_result, experience_result, education_result
    )

    explanation = _build_explanation(
        candidate.full_name,
        job.title,
        skill_result,
        experience_result,
        education_result,
        available_criteria,
        effective_weights,
        overall,
        preferred_skills_matched=preferred_matched,
        total_preferred_skills=len(job.preferred_skill_ids),
    )

    return MatchOutcome(
        cv_id=cv.cv_id,
        candidate_id=candidate.candidate_id,
        job_id=job.job_id,
        candidate_name=candidate.full_name,
        job_title=job.title,
        overall_score=overall,
        skill=skill_result,
        experience=experience_result,
        education=education_result,
        available_criteria=available_criteria,
        effective_weights=effective_weights,
        explanation=explanation,
        preferred_skills_matched=preferred_matched,
        total_preferred_skills=len(job.preferred_skill_ids),
    )


# --------------------------------------------------------------------------
# Data loading (the only place that touches the DB)
# --------------------------------------------------------------------------


def _load_cv_inputs(db: Session, cv_ids: Iterable[int]) -> dict[int, CvMatchInput]:
    """Batch-load the Profile of every given CV in a fixed number of queries
    (one for the CVs and their Candidates, one per profile table), so a
    ranking's query count does not grow with the number of Applications."""
    ids = sorted(set(cv_ids))
    if not ids:
        return {}

    cv_rows = (
        db.query(CV.id, CV.candidate_id, Candidate.full_name)
        .join(Candidate, Candidate.id == CV.candidate_id)
        .filter(CV.id.in_(ids))
        .all()
    )

    skills_by_cv: dict[int, set[int]] = defaultdict(set)
    for row in (
        db.query(CvSkill.cv_id, CvSkill.skill_id).filter(CvSkill.cv_id.in_(ids)).all()
    ):
        skills_by_cv[row.cv_id].add(row.skill_id)

    work_by_cv: dict[int, list[tuple[Optional[date], Optional[date], bool]]] = (
        defaultdict(list)
    )
    for row in (
        db.query(
            WorkExperience.cv_id,
            WorkExperience.start_date,
            WorkExperience.end_date,
            WorkExperience.is_current,
        )
        .filter(WorkExperience.cv_id.in_(ids))
        .all()
    ):
        work_by_cv[row.cv_id].append((row.start_date, row.end_date, bool(row.is_current)))

    education_by_cv: dict[int, list[tuple[Optional[str], Optional[str]]]] = (
        defaultdict(list)
    )
    for row in (
        db.query(Education.cv_id, Education.degree, Education.field_of_study)
        .filter(Education.cv_id.in_(ids))
        .all()
    ):
        education_by_cv[row.cv_id].append((row.degree, row.field_of_study))

    return {
        row.id: CvMatchInput(
            cv_id=row.id,
            candidate_id=row.candidate_id,
            full_name=row.full_name,
            skill_ids=skills_by_cv.get(row.id, set()),
            work_experience_rows=work_by_cv.get(row.id, []),
            education_rows=education_by_cv.get(row.id, []),
        )
        for row in cv_rows
    }


def _load_cv_input(db: Session, cv_id: int) -> CvMatchInput:
    inputs = _load_cv_inputs(db, [cv_id])
    if cv_id not in inputs:
        raise CvNotFoundError(f"CV {cv_id} not found.")
    return inputs[cv_id]


def _valid_required_experience_years(value: Optional[float]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if value <= 0:
        return None
    return value


def _load_job_input(db: Session, job_id: int) -> JobMatchInput:
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise JobNotFoundError(f"Job {job_id} not found.")

    skill_rows = (
        db.query(JobSkill.skill_id, JobSkill.is_required, Skill.name)
        .join(Skill, Skill.id == JobSkill.skill_id)
        .filter(JobSkill.job_id == job_id)
        .all()
    )
    required_rows = [row for row in skill_rows if row.is_required]
    preferred_rows = [row for row in skill_rows if not row.is_required]

    return JobMatchInput(
        job_id=job.id,
        title=job.title,
        required_skill_ids={row.skill_id for row in required_rows},
        required_skill_names={row.skill_id: row.name for row in required_rows},
        required_experience_years=_valid_required_experience_years(
            job.required_experience_years
        ),
        required_education_level=normalize_education_level(job.required_education),
        required_education_raw=job.required_education,
        preferred_skill_ids={row.skill_id for row in preferred_rows},
        preferred_skill_names={row.skill_id: row.name for row in preferred_rows},
    )


@dataclass
class _JobApplicationRow:
    application_id: int
    candidate_id: int
    cv_id: int
    candidate_name: str


def _load_job_applications(db: Session, job_id: int) -> list[_JobApplicationRow]:
    """Only this Job's Applications, with the Candidate name, in one query."""
    rows = (
        db.query(
            Application.id,
            Application.candidate_id,
            Application.cv_id,
            Candidate.full_name,
        )
        .join(Candidate, Candidate.id == Application.candidate_id)
        .filter(Application.job_id == job_id)
        .order_by(Application.id)
        .all()
    )
    return [
        _JobApplicationRow(
            application_id=row.id,
            candidate_id=row.candidate_id,
            cv_id=row.cv_id,
            candidate_name=row.full_name,
        )
        for row in rows
    ]


# --------------------------------------------------------------------------
# Persistence: one MatchResult per Application. Uniqueness is a database
# constraint (uq_MatchResults_application_id), not application code.
# --------------------------------------------------------------------------


def _to_percent(ratio: Optional[float]) -> Optional[float]:
    return None if ratio is None else round(_clamp01(ratio) * 100, 2)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _store_outcome(
    db: Session,
    application_id: int,
    outcome: MatchOutcome,
    existing: Optional[MatchResult],
) -> None:
    """Write one outcome onto the session (flush, no commit).

    An Unscorable outcome has no Match Result at all (CONTEXT.md,
    "Unscorable"): `overall_score` is NOT NULL and a fabricated 0% would be
    misleading, so a stale stored row for it is removed instead.
    """
    if outcome.overall_score is None:
        if existing is not None:
            db.delete(existing)
        return

    values = dict(
        overall_score=outcome.overall_score,
        skill_score=_to_percent(outcome.skill.score),
        experience_score=_to_percent(outcome.experience.score),
        education_score=_to_percent(outcome.education.score),
        language_score=None,
        explanation=outcome.explanation,
        algorithm_version=ALGORITHM_VERSION,
        scored_at=_utcnow(),
    )
    if existing is not None:
        for key, value in values.items():
            setattr(existing, key, value)
    else:
        db.add(MatchResult(application_id=application_id, **values))


def _is_stale(result: Optional[MatchResult]) -> bool:
    return result is None or result.algorithm_version < ALGORITHM_VERSION


def score_applications(
    db: Session,
    applications: list[Application],
    *,
    today: Optional[date] = None,
) -> dict[int, MatchOutcome]:
    """Score the given Applications (all of one Job) from the CV each one
    points at and write the results onto the session.

    Does NOT commit: the caller owns the transaction so that creating
    Applications and storing their scores is one atomic step. Returns the
    outcomes keyed by application id.
    """
    if not applications:
        return {}

    job_ids = {application.job_id for application in applications}
    if len(job_ids) != 1:
        raise ValueError("score_applications expects Applications of a single Job.")

    effective_today = today or date.today()
    job_input = _load_job_input(db, job_ids.pop())
    cv_inputs = _load_cv_inputs(db, (application.cv_id for application in applications))

    application_ids = [application.id for application in applications]
    existing_by_application = {
        row.application_id: row
        for row in db.query(MatchResult)
        .filter(MatchResult.application_id.in_(application_ids))
        .all()
    }

    outcomes: dict[int, MatchOutcome] = {}
    for application in applications:
        cv_input = cv_inputs.get(application.cv_id)
        if cv_input is None:
            raise CvNotFoundError(f"CV {application.cv_id} not found.")
        outcome = _score_cv_against_job(cv_input, job_input, effective_today)
        _store_outcome(
            db, application.id, outcome, existing_by_application.get(application.id)
        )
        outcomes[application.id] = outcome

    db.flush()
    return outcomes


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def outcome_to_response(outcome: MatchOutcome, application_id: int) -> MatchResponse:
    return MatchResponse(
        application_id=application_id,
        candidate_id=outcome.candidate_id,
        cv_id=outcome.cv_id,
        job_id=outcome.job_id,
        candidate_name=outcome.candidate_name,
        job_title=outcome.job_title,
        status="scored" if outcome.overall_score is not None else "unscorable",
        algorithm_version=ALGORITHM_VERSION,
        overall_score=outcome.overall_score,
        skill_score=_to_percent(outcome.skill.score),
        experience_score=_to_percent(outcome.experience.score),
        education_score=_to_percent(outcome.education.score),
        language_score=None,
        matched_skills=outcome.skill.matched_skills,
        missing_required_skills=outcome.skill.missing_required_skills,
        matched_required_skills_count=outcome.skill.matched_count,
        total_required_skills=outcome.skill.total_required,
        candidate_experience_years=outcome.experience.candidate_experience_years,
        required_experience_years=outcome.experience.required_experience_years,
        candidate_education_level=outcome.education.candidate_level_name,
        required_education_level=outcome.education.required_level_name,
        candidate_field_of_study=outcome.education.candidate_field_of_study,
        preferred_skills_matched=outcome.preferred_skills_matched,
        total_preferred_skills=outcome.total_preferred_skills,
        available_criteria=outcome.available_criteria,
        effective_weights=outcome.effective_weights,
        explanation=outcome.explanation,
    )


def get_application_match(
    db: Session,
    application_id: int,
    *,
    today: Optional[date] = None,
) -> MatchResponse:
    """The full breakdown of one Application's score.

    The stored Match Result only keeps the score columns and the
    explanation, so the breakdown (matched and missing skills, levels,
    weights) is recomputed from the same CV and Job. The formula is
    deterministic, so the result equals what was stored; when the stored
    row is missing or was scored by an older algorithm, it is refreshed.
    """
    application = db.get(Application, application_id)
    if application is None:
        raise ApplicationNotFoundError(f"Application {application_id} not found.")

    existing = (
        db.query(MatchResult)
        .filter(MatchResult.application_id == application_id)
        .one_or_none()
    )

    cv_input = _load_cv_input(db, application.cv_id)
    job_input = _load_job_input(db, application.job_id)
    outcome = _score_cv_against_job(cv_input, job_input, today or date.today())

    if _is_stale(existing):
        try:
            _store_outcome(db, application.id, outcome, existing)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to persist match result for application=%s", application_id)
            raise MatchPersistenceError("Could not save match result.") from exc

    return outcome_to_response(outcome, application.id)


def get_job_ranking(
    db: Session,
    job_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
    minimum_score: Optional[float] = None,
    today: Optional[date] = None,
) -> JobRankingResponse:
    """Rank one Job's Applications by their stored Match Results.

    Reads the stored rows, recomputes and re-stores any that are missing or
    carry an older `algorithm_version`, then sorts, filters and paginates.
    The number of queries is bounded (job, job skills, applications, stored
    results, then at most one per profile table for the recompute set)
    regardless of how many Applications the Job has.
    """
    job_input = _load_job_input(db, job_id)
    rows = _load_job_applications(db, job_id)

    stored_by_application: dict[int, MatchResult] = {}
    if rows:
        stored_by_application = {
            result.application_id: result
            for result in db.query(MatchResult)
            .filter(MatchResult.application_id.in_([row.application_id for row in rows]))
            .all()
        }

    # Missing rows are recomputed too: they are either Unscorable (still no
    # row afterwards, cheap to confirm) or were never scored.
    recompute = [row for row in rows if _is_stale(stored_by_application.get(row.application_id))]
    scores: dict[int, Optional[float]] = {
        row.application_id: stored_by_application[row.application_id].overall_score
        for row in rows
        if row.application_id in stored_by_application
    }

    if recompute:
        effective_today = today or date.today()
        cv_inputs = _load_cv_inputs(db, (row.cv_id for row in recompute))
        try:
            for row in recompute:
                cv_input = cv_inputs.get(row.cv_id)
                if cv_input is None:
                    raise CvNotFoundError(f"CV {row.cv_id} not found.")
                outcome = _score_cv_against_job(cv_input, job_input, effective_today)
                _store_outcome(
                    db,
                    row.application_id,
                    outcome,
                    stored_by_application.get(row.application_id),
                )
                scores[row.application_id] = outcome.overall_score
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            logger.exception("Failed to persist match result(s) for job=%s", job_id)
            raise MatchPersistenceError("Could not save match result.") from exc

    def sort_key(row: _JobApplicationRow):
        score = scores.get(row.application_id)
        if score is None:
            return (1, 0.0, row.application_id)
        return (0, -score, row.application_id)

    ranked = sorted(rows, key=sort_key)

    if minimum_score is not None:
        ranked = [
            row
            for row in ranked
            if scores.get(row.application_id) is not None
            and scores[row.application_id] >= minimum_score
        ]

    total_applications = len(ranked)
    page = ranked[offset : offset + limit]

    responses = [
        RankedApplicationResponse(
            rank=offset + index + 1,
            application_id=row.application_id,
            candidate_id=row.candidate_id,
            cv_id=row.cv_id,
            candidate_name=row.candidate_name,
            status="scored" if scores.get(row.application_id) is not None else "unscorable",
            overall_score=scores.get(row.application_id),
        )
        for index, row in enumerate(page)
    ]

    return JobRankingResponse(
        job_id=job_input.job_id,
        job_title=job_input.title,
        total_applications=total_applications,
        returned_applications=len(responses),
        limit=limit,
        offset=offset,
        minimum_score=minimum_score,
        applications=responses,
    )
