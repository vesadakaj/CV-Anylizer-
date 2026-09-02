"""Deterministic candidate-job matching.

This module is the matching layer. It is intentionally separate from the
NLP/LLM extraction layer (`services/candidate_extraction.py` and
`services/job_extraction.py`): it never calls an LLM, never reads raw CV or
job-description text, and never uses embeddings. It only reads already
-persisted, structured rows (Candidate, Job, CandidateSkill, JobSkill, Skill,
WorkExperience, Education) and combines them with a fixed, explainable
formula.

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
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.candidate import Candidate
from models.candidate_skill import CandidateSkill
from models.education import Education
from models.job import Job
from models.job_skill import JobSkill
from models.match_result import MatchResult
from models.skill import Skill
from models.work_experience import WorkExperience

logger = logging.getLogger(__name__)


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


class CandidateNotFoundError(Exception):
    pass


class JobNotFoundError(Exception):
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
class CandidateMatchInput:
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


@dataclass
class MatchOutcome:
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


# --------------------------------------------------------------------------
# API response schemas
# --------------------------------------------------------------------------


class MatchResponse(BaseModel):
    candidate_id: int
    job_id: int
    candidate_name: str
    job_title: str
    status: str  # "scored" | "unscorable"
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
    available_criteria: list[str]
    effective_weights: dict[str, float]
    explanation: str


class RankedMatchResponse(MatchResponse):
    rank: int


class JobRankingResponse(BaseModel):
    job_id: int
    job_title: str
    total_candidates: int
    returned_candidates: int
    limit: int
    offset: int
    minimum_score: Optional[float] = None
    candidates: list[RankedMatchResponse]


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

    parts.append(f"Overall match: {overall_score:.2f}%.")

    return " ".join(parts)


def _score_candidate_against_job(
    candidate: CandidateMatchInput, job: JobMatchInput, today: date
) -> MatchOutcome:
    """The single deterministic scoring algorithm, reused by both individual
    matching and job-wide ranking."""
    skill_result = compute_skill_score(
        candidate.skill_ids, job.required_skill_ids, job.required_skill_names
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
    )

    return MatchOutcome(
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
    )


# --------------------------------------------------------------------------
# Data loading (the only place that touches the DB)
# --------------------------------------------------------------------------


def _load_candidate_input(db: Session, candidate_id: int) -> CandidateMatchInput:
    candidate = db.query(Candidate).filter(Candidate.id == candidate_id).first()
    if candidate is None:
        raise CandidateNotFoundError(f"Candidate {candidate_id} not found.")

    skill_ids = {
        row.skill_id
        for row in db.query(CandidateSkill.skill_id)
        .filter(CandidateSkill.candidate_id == candidate_id)
        .all()
    }

    work_experience_rows = [
        (row.start_date, row.end_date, bool(row.is_current))
        for row in db.query(
            WorkExperience.start_date, WorkExperience.end_date, WorkExperience.is_current
        )
        .filter(WorkExperience.candidate_id == candidate_id)
        .all()
    ]

    education_rows = [
        (row.degree, row.field_of_study)
        for row in db.query(Education.degree, Education.field_of_study)
        .filter(Education.candidate_id == candidate_id)
        .all()
    ]

    return CandidateMatchInput(
        candidate_id=candidate.id,
        full_name=candidate.full_name,
        skill_ids=skill_ids,
        work_experience_rows=work_experience_rows,
        education_rows=education_rows,
    )


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

    required_rows = (
        db.query(JobSkill.skill_id, Skill.name)
        .join(Skill, Skill.id == JobSkill.skill_id)
        .filter(JobSkill.job_id == job_id, JobSkill.is_required == True)  # noqa: E712
        .all()
    )
    required_skill_ids = {row.skill_id for row in required_rows}
    required_skill_names = {row.skill_id: row.name for row in required_rows}

    return JobMatchInput(
        job_id=job.id,
        title=job.title,
        required_skill_ids=required_skill_ids,
        required_skill_names=required_skill_names,
        required_experience_years=_valid_required_experience_years(
            job.required_experience_years
        ),
        required_education_level=normalize_education_level(job.required_education),
        required_education_raw=job.required_education,
    )


def _load_all_candidates_input(db: Session) -> list[CandidateMatchInput]:
    """Batch-load every candidate's structured data in a fixed number of
    queries (no N+1), for job-wide ranking."""
    candidates = db.query(Candidate).order_by(Candidate.id).all()
    if not candidates:
        return []

    candidate_ids = [c.id for c in candidates]

    skills_by_candidate: dict[int, set[int]] = defaultdict(set)
    for row in (
        db.query(CandidateSkill.candidate_id, CandidateSkill.skill_id)
        .filter(CandidateSkill.candidate_id.in_(candidate_ids))
        .all()
    ):
        skills_by_candidate[row.candidate_id].add(row.skill_id)

    work_by_candidate: dict[int, list[tuple[Optional[date], Optional[date], bool]]] = (
        defaultdict(list)
    )
    for row in (
        db.query(
            WorkExperience.candidate_id,
            WorkExperience.start_date,
            WorkExperience.end_date,
            WorkExperience.is_current,
        )
        .filter(WorkExperience.candidate_id.in_(candidate_ids))
        .all()
    ):
        work_by_candidate[row.candidate_id].append(
            (row.start_date, row.end_date, bool(row.is_current))
        )

    education_by_candidate: dict[int, list[tuple[Optional[str], Optional[str]]]] = (
        defaultdict(list)
    )
    for row in (
        db.query(Education.candidate_id, Education.degree, Education.field_of_study)
        .filter(Education.candidate_id.in_(candidate_ids))
        .all()
    ):
        education_by_candidate[row.candidate_id].append((row.degree, row.field_of_study))

    return [
        CandidateMatchInput(
            candidate_id=candidate.id,
            full_name=candidate.full_name,
            skill_ids=skills_by_candidate.get(candidate.id, set()),
            work_experience_rows=work_by_candidate.get(candidate.id, []),
            education_rows=education_by_candidate.get(candidate.id, []),
        )
        for candidate in candidates
    ]


# --------------------------------------------------------------------------
# Persistence (upsert on candidate_id + job_id - MatchResult has no unique
# constraint, so the uniqueness is enforced here in application code)
# --------------------------------------------------------------------------


def _to_percent(ratio: Optional[float]) -> Optional[float]:
    return None if ratio is None else round(_clamp01(ratio) * 100, 2)


def _persist_match_results_for_job(
    db: Session, job_id: int, outcomes: list[MatchOutcome]
) -> None:
    """Upsert MatchResult rows for every scorable outcome in one transaction.

    Outcomes with overall_score=None are skipped: MatchResult.overall_score is
    NOT NULL in the schema, so persisting a fabricated 0% would be misleading.
    Skipping is the safest schema-compatible behavior (documented limitation).
    """
    scorable = [outcome for outcome in outcomes if outcome.overall_score is not None]
    if not scorable:
        return

    try:
        existing_by_candidate = {
            row.candidate_id: row
            for row in db.query(MatchResult)
            .filter(
                MatchResult.job_id == job_id,
                MatchResult.candidate_id.in_([o.candidate_id for o in scorable]),
            )
            .all()
        }

        for outcome in scorable:
            values = dict(
                overall_score=outcome.overall_score,
                skill_score=_to_percent(outcome.skill.score),
                experience_score=_to_percent(outcome.experience.score),
                education_score=_to_percent(outcome.education.score),
                language_score=None,
                explanation=outcome.explanation,
            )
            existing = existing_by_candidate.get(outcome.candidate_id)
            if existing is not None:
                for key, value in values.items():
                    setattr(existing, key, value)
            else:
                db.add(
                    MatchResult(
                        candidate_id=outcome.candidate_id, job_id=job_id, **values
                    )
                )

        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to persist match result(s) for job=%s", job_id)
        raise MatchPersistenceError("Could not save match result.") from exc


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def outcome_to_response(outcome: MatchOutcome) -> MatchResponse:
    return MatchResponse(
        candidate_id=outcome.candidate_id,
        job_id=outcome.job_id,
        candidate_name=outcome.candidate_name,
        job_title=outcome.job_title,
        status="scored" if outcome.overall_score is not None else "unscorable",
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
        available_criteria=outcome.available_criteria,
        effective_weights=outcome.effective_weights,
        explanation=outcome.explanation,
    )


def get_candidate_job_match(
    db: Session,
    candidate_id: int,
    job_id: int,
    *,
    today: Optional[date] = None,
    persist: bool = True,
) -> MatchOutcome:
    """Score one candidate against one job. Raises CandidateNotFoundError /
    JobNotFoundError if either does not exist."""
    effective_today = today or date.today()

    candidate_input = _load_candidate_input(db, candidate_id)
    job_input = _load_job_input(db, job_id)

    outcome = _score_candidate_against_job(candidate_input, job_input, effective_today)

    if persist:
        _persist_match_results_for_job(db, job_id, [outcome])

    return outcome


def get_job_candidate_matches(
    db: Session,
    job_id: int,
    *,
    limit: int = 20,
    offset: int = 0,
    minimum_score: Optional[float] = None,
    today: Optional[date] = None,
    persist: bool = True,
) -> JobRankingResponse:
    """Score every candidate against one job, rank them, paginate, and persist.

    Reuses `_score_candidate_against_job` - the exact same function used by
    `get_candidate_job_match` - for every candidate, so ranking can never
    diverge from individual matching.
    """
    effective_today = today or date.today()

    job_input = _load_job_input(db, job_id)
    candidate_inputs = _load_all_candidates_input(db)

    outcomes = [
        _score_candidate_against_job(candidate_input, job_input, effective_today)
        for candidate_input in candidate_inputs
    ]

    if persist:
        _persist_match_results_for_job(db, job_id, outcomes)

    def sort_key(outcome: MatchOutcome):
        if outcome.overall_score is None:
            return (1, 0.0, outcome.candidate_id)
        return (0, -outcome.overall_score, outcome.candidate_id)

    ranked = sorted(outcomes, key=sort_key)

    if minimum_score is not None:
        ranked = [
            outcome
            for outcome in ranked
            if outcome.overall_score is not None and outcome.overall_score >= minimum_score
        ]

    total_candidates = len(ranked)
    page = ranked[offset : offset + limit]

    candidate_responses = [
        RankedMatchResponse(rank=offset + index + 1, **outcome_to_response(outcome).model_dump())
        for index, outcome in enumerate(page)
    ]

    return JobRankingResponse(
        job_id=job_input.job_id,
        job_title=job_input.title,
        total_candidates=total_candidates,
        returned_candidates=len(candidate_responses),
        limit=limit,
        offset=offset,
        minimum_score=minimum_score,
        candidates=candidate_responses,
    )
