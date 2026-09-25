"""Head-to-head Comparison of two CVs.

A Comparison answers one question: of these two CVs, which is the better
match, and *why*. It is a pure read - it creates no Application, stores no
Match Result and never calls an LLM.

Two modes:

- **Job mode** (`job_id` given). Both CVs are scored against that Job with
  the one deterministic algorithm in `services/matching.py`, reached through
  its public `score_cv_against_job`, so a Comparison can never disagree with
  the ranking it is explaining. The gap between the two overall scores is
  then *attributed*: every criterion the Job specifies carries the same
  effective weight for both sides, so
  `(a_score - b_score) x weight` is exactly how many points of the overall
  difference that criterion is responsible for, and those contributions sum
  back to the overall gap. That sum is what makes "why one is better" an
  arithmetic fact rather than a narrative.
- **Profile mode** (no `job_id`). Nothing is scored, because a score only
  means something against requirements. The two Profiles are still diffed
  factually: skills on one side only, years of experience, education level,
  languages.

Both modes always return the skill diff and the profile differences, so the
UI renders one shape either way.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.cv_language import CvLanguage
from models.cv_skill import CvSkill
from models.language import Language
from models.skill import Skill
from models.work_experience import WorkExperience
from services.matching import (
    ALGORITHM_VERSION,
    EDUCATION_LEVEL_NAMES,
    CvMatchInput,
    CvNotFoundError,
    JobMatchInput,
    JobNotFoundError,
    MatchOutcome,
    load_cv_match_input,
    load_job_match_input,
    score_cv_against_job,
    to_percent,
)

# Two scores closer together than this are called level rather than
# separated: the scorer rounds to two decimals, so anything smaller is
# rounding noise, not a difference a user should act on.
TIE_EPSILON = 0.01

# How the size of the overall gap is worded, in percentage points.
NARROW_MARGIN = 2.5
CLEAR_MARGIN = 10.0

CRITERION_LABELS = {
    "skills": "Skills",
    "experience": "Experience",
    "education": "Education",
}

MODE_JOB = "job"
MODE_PROFILE = "profile"

SIDE_A = "a"
SIDE_B = "b"
TIE = "tie"


class SameCvError(Exception):
    """The two sides of a Comparison must be different CVs."""


# --------------------------------------------------------------------------
# API response schemas
# --------------------------------------------------------------------------


class ComparedSide(BaseModel):
    """One CV of the pair: who it belongs to, and how it did."""

    cv_id: int
    candidate_id: int
    candidate_name: str
    # What to call this side in a column heading or a pill. Normally the
    # candidate's name; the file name when both sides are the same person,
    # where the name distinguishes nothing.
    label: str = ""
    email: str | None = None
    file_name: str
    uploaded_at: datetime | None = None
    # Set only when this exact CV is the one an Application for the Job
    # points at, so the UI can link to the ranking row it explains.
    application_id: int | None = None
    status: str | None = None  # "scored" | "unscorable" | None in profile mode
    overall_score: float | None = None
    skill_score: float | None = None
    experience_score: float | None = None
    education_score: float | None = None
    matched_required_skills: list[str] = []
    missing_required_skills: list[str] = []
    matched_required_skills_count: int = 0
    total_required_skills: int = 0
    preferred_skills_matched: list[str] = []
    total_preferred_skills: int = 0
    experience_years: float = 0.0
    education_level: str | None = None
    field_of_study: str | None = None
    latest_position: str | None = None
    skills_count: int = 0
    languages: list[str] = []
    explanation: str | None = None


class ComparedCriterion(BaseModel):
    """One scored criterion, and how much of the overall gap it explains.

    `contribution_delta` is in points of the overall score and is signed
    towards side A; the criteria's contributions sum to `score_delta` of the
    Comparison.
    """

    criterion: str  # "skills" | "experience" | "education"
    label: str
    weight: float  # effective weight in %, identical for both sides
    a_score: float | None
    b_score: float | None
    a_detail: str
    b_detail: str
    score_delta: float  # a - b, in percentage points of this criterion
    contribution_delta: float  # a - b, in points of the overall score
    winner: str  # "a" | "b" | "tie"


class ComparedSkillGroup(BaseModel):
    """The skill diff for one group of skills. `neither` is only meaningful
    for the Job's own skills - it is what neither CV brings."""

    kind: str  # "required" | "preferred" | "other"
    label: str
    both: list[str] = []
    only_a: list[str] = []
    only_b: list[str] = []
    neither: list[str] = []


class ProfileDifference(BaseModel):
    """One factual, unweighted difference between the two Profiles. Present
    in both modes: it is what a Comparison can still say without a Job."""

    label: str
    a_value: str
    b_value: str
    advantage: str  # "a" | "b" | "tie" | "none"


class ComparisonResponse(BaseModel):
    mode: str  # "job" | "profile"
    job_id: int | None = None
    job_title: str | None = None
    ready_to_match: bool = False
    algorithm_version: int = ALGORITHM_VERSION
    a: ComparedSide
    b: ComparedSide
    winner: str | None = None  # "a" | "b" | "tie" | None when unscorable
    score_delta: float | None = None  # a - b, in points
    margin: str | None = None  # "tie" | "narrow" | "clear" | "decisive"
    criteria: list[ComparedCriterion] = []
    skill_groups: list[ComparedSkillGroup] = []
    profile_differences: list[ProfileDifference] = []
    decisive_factors: list[str] = []
    summary: str


# --------------------------------------------------------------------------
# Loading the bits the scorer does not need but the reader does
# --------------------------------------------------------------------------


@dataclass
class _CvFacts:
    """Everything about one CV that the scorer itself has no use for: the
    document, the person, and the skill and language names."""

    cv_id: int
    candidate_id: int
    candidate_name: str
    email: Optional[str]
    file_name: str
    uploaded_at: Optional[datetime]
    skill_names: dict[int, str]
    languages: list[str]
    latest_position: Optional[str]


def _load_cv_facts(db: Session, cv_ids: list[int]) -> dict[int, _CvFacts]:
    """A fixed number of queries for both CVs together, so a Comparison
    costs the same whichever pair is asked for."""
    rows = (
        db.query(CV, Candidate)
        .join(Candidate, Candidate.id == CV.candidate_id)
        .filter(CV.id.in_(cv_ids))
        .all()
    )

    skill_names: dict[int, dict[int, str]] = {cv_id: {} for cv_id in cv_ids}
    for row in (
        db.query(CvSkill.cv_id, CvSkill.skill_id, Skill.name)
        .join(Skill, Skill.id == CvSkill.skill_id)
        .filter(CvSkill.cv_id.in_(cv_ids))
        .all()
    ):
        skill_names[row.cv_id][row.skill_id] = row.name

    languages: dict[int, list[str]] = {cv_id: [] for cv_id in cv_ids}
    for row in (
        db.query(CvLanguage.cv_id, Language.name, CvLanguage.level)
        .join(Language, Language.id == CvLanguage.language_id)
        .filter(CvLanguage.cv_id.in_(cv_ids))
        .order_by(CvLanguage.id)
        .all()
    ):
        label = f"{row.name} ({row.level})" if row.level else row.name
        if label not in languages[row.cv_id]:
            languages[row.cv_id].append(label)

    # "Most recent role" without inventing dates: a current role wins, then
    # the latest start date, then the order the CV stored the rows in.
    latest_position: dict[int, str] = {}
    latest_rank: dict[int, tuple[bool, date]] = {}
    for row in (
        db.query(
            WorkExperience.cv_id,
            WorkExperience.position_title,
            WorkExperience.company_name,
            WorkExperience.start_date,
            WorkExperience.is_current,
        )
        .filter(WorkExperience.cv_id.in_(cv_ids))
        .order_by(WorkExperience.id)
        .all()
    ):
        title = " at ".join(part for part in (row.position_title, row.company_name) if part)
        if not title:
            continue
        rank = (bool(row.is_current), row.start_date or date.min)
        if row.cv_id not in latest_rank or rank > latest_rank[row.cv_id]:
            latest_position[row.cv_id] = title
            latest_rank[row.cv_id] = rank

    return {
        cv.id: _CvFacts(
            cv_id=cv.id,
            candidate_id=candidate.id,
            candidate_name=candidate.full_name,
            email=candidate.email,
            file_name=cv.file_name,
            uploaded_at=cv.uploaded_at,
            skill_names=skill_names.get(cv.id, {}),
            languages=languages.get(cv.id, []),
            latest_position=latest_position.get(cv.id),
        )
        for cv, candidate in rows
    }


def _load_application_ids(db: Session, job_id: int, cv_ids: list[int]) -> dict[int, int]:
    """The Application of this Job that points at each CV, when there is
    one. A Candidate who applied with a *different* CV has no entry here:
    the row being explained is the one scored from this document."""
    return {
        row.cv_id: row.id
        for row in db.query(Application.id, Application.cv_id)
        .filter(Application.job_id == job_id, Application.cv_id.in_(cv_ids))
        .all()
    }


def _empty_job_input() -> JobMatchInput:
    """A Job with no requirements. Profile mode runs the real scorer against
    it so experience years and education level are derived by exactly the
    same code as in job mode; nothing is scorable, so no score comes out."""
    return JobMatchInput(
        job_id=0,
        title="",
        required_skill_ids=set(),
        required_skill_names={},
        required_experience_years=None,
        required_education_level=None,
        required_education_raw=None,
        preferred_skill_ids=set(),
        preferred_skill_names={},
    )


# --------------------------------------------------------------------------
# Diffing
# --------------------------------------------------------------------------


def _sorted_names(names: list[str]) -> list[str]:
    return sorted(set(names), key=str.lower)


def _skill_group(
    kind: str,
    label: str,
    job_names: dict[int, str],
    a_ids: set[int],
    b_ids: set[int],
) -> ComparedSkillGroup:
    job_ids = set(job_names)
    a_has = a_ids & job_ids
    b_has = b_ids & job_ids
    return ComparedSkillGroup(
        kind=kind,
        label=label,
        both=_sorted_names([job_names[i] for i in a_has & b_has]),
        only_a=_sorted_names([job_names[i] for i in a_has - b_has]),
        only_b=_sorted_names([job_names[i] for i in b_has - a_has]),
        neither=_sorted_names([job_names[i] for i in job_ids - a_has - b_has]),
    )


def _other_skill_group(
    label: str,
    a_names: dict[int, str],
    b_names: dict[int, str],
    job_skill_ids: set[int],
) -> ComparedSkillGroup:
    """Everything each CV lists that the Job never asked about. Shown
    because a reader comparing two people wants to see it - it is never
    scored."""
    a_ids = set(a_names) - job_skill_ids
    b_ids = set(b_names) - job_skill_ids
    return ComparedSkillGroup(
        kind="other",
        label=label,
        both=_sorted_names([a_names[i] for i in a_ids & b_ids]),
        only_a=_sorted_names([a_names[i] for i in a_ids - b_ids]),
        only_b=_sorted_names([b_names[i] for i in b_ids - a_ids]),
        neither=[],
    )


def _side_of(delta: float) -> str:
    if abs(delta) < TIE_EPSILON:
        return TIE
    return SIDE_A if delta > 0 else SIDE_B


def _margin_of(delta: Optional[float]) -> Optional[str]:
    if delta is None:
        return None
    size = abs(delta)
    if size < TIE_EPSILON:
        return "tie"
    if size < NARROW_MARGIN:
        return "narrow"
    if size < CLEAR_MARGIN:
        return "clear"
    return "decisive"


def _criterion_detail(criterion: str, outcome: MatchOutcome) -> str:
    if criterion == "skills":
        return (
            f"{outcome.skill.matched_count} of {outcome.skill.total_required} "
            "required skills"
        )
    if criterion == "experience":
        required = outcome.experience.required_experience_years
        return (
            f"{outcome.experience.candidate_experience_years:.1f} of "
            f"{required:.1f} years"
            if required is not None
            else f"{outcome.experience.candidate_experience_years:.1f} years"
        )
    return outcome.education.candidate_level_name or "no identified level"


def _criterion_ratios(outcome: MatchOutcome) -> dict[str, Optional[float]]:
    return {
        "skills": outcome.skill.score,
        "experience": outcome.experience.score,
        "education": outcome.education.score,
    }


def _build_criteria(a: MatchOutcome, b: MatchOutcome) -> list[ComparedCriterion]:
    """One row per criterion the Job specifies, with the gap it owns.

    Which criteria count, and with what weight, depends only on the Job, so
    both sides are weighted identically and the contributions are directly
    comparable.
    """
    a_ratios = _criterion_ratios(a)
    b_ratios = _criterion_ratios(b)

    criteria: list[ComparedCriterion] = []
    for criterion in a.available_criteria:
        weight = a.effective_weights[criterion]
        a_score = to_percent(a_ratios[criterion])
        b_score = to_percent(b_ratios[criterion])
        score_delta = round((a_score or 0.0) - (b_score or 0.0), 2)
        criteria.append(
            ComparedCriterion(
                criterion=criterion,
                label=CRITERION_LABELS[criterion],
                weight=weight,
                a_score=a_score,
                b_score=b_score,
                a_detail=_criterion_detail(criterion, a),
                b_detail=_criterion_detail(criterion, b),
                score_delta=score_delta,
                contribution_delta=round(score_delta * weight / 100, 2),
                winner=_side_of(score_delta),
            )
        )

    # Most decisive first: that ordering is the answer to "why".
    criteria.sort(key=lambda row: (-abs(row.contribution_delta), row.label))
    return criteria


def _years_advantage(a_years: float, b_years: float) -> str:
    # Half a year is the smallest difference worth calling a difference:
    # below it the two are, in hiring terms, the same length of career.
    if abs(a_years - b_years) < 0.5:
        return TIE
    return SIDE_A if a_years > b_years else SIDE_B


def _level_advantage(a_level: Optional[str], b_level: Optional[str]) -> str:
    ranks = {name: value for value, name in EDUCATION_LEVEL_NAMES.items()}
    a_rank = ranks.get(a_level or "")
    b_rank = ranks.get(b_level or "")
    if a_rank is None and b_rank is None:
        return "none"
    if a_rank is None:
        return SIDE_B
    if b_rank is None:
        return SIDE_A
    if a_rank == b_rank:
        return TIE
    return SIDE_A if a_rank > b_rank else SIDE_B


def _count_advantage(a_count: int, b_count: int) -> str:
    if a_count == b_count:
        return TIE
    return SIDE_A if a_count > b_count else SIDE_B


def _profile_differences(
    a: ComparedSide, b: ComparedSide, shared_skills: int
) -> list[ProfileDifference]:
    return [
        ProfileDifference(
            label="Years of experience",
            a_value=f"{a.experience_years:.1f}",
            b_value=f"{b.experience_years:.1f}",
            advantage=_years_advantage(a.experience_years, b.experience_years),
        ),
        ProfileDifference(
            label="Highest education",
            a_value=a.education_level or "Not identified",
            b_value=b.education_level or "Not identified",
            advantage=_level_advantage(a.education_level, b.education_level),
        ),
        ProfileDifference(
            label="Field of study",
            a_value=a.field_of_study or "Not identified",
            b_value=b.field_of_study or "Not identified",
            advantage="none",
        ),
        ProfileDifference(
            label="Most recent role",
            a_value=a.latest_position or "Not identified",
            b_value=b.latest_position or "Not identified",
            advantage="none",
        ),
        ProfileDifference(
            label="Skills listed",
            a_value=str(a.skills_count),
            b_value=str(b.skills_count),
            advantage=_count_advantage(a.skills_count, b.skills_count),
        ),
        ProfileDifference(
            label="Skills in common",
            a_value=str(shared_skills),
            b_value=str(shared_skills),
            advantage=TIE,
        ),
        ProfileDifference(
            label="Languages",
            a_value=", ".join(a.languages) or "Not identified",
            b_value=", ".join(b.languages) or "Not identified",
            advantage="none",
        ),
    ]


# --------------------------------------------------------------------------
# Wording. Deterministic, like the scorer's own explanation: the same pair
# and the same Job always read the same way.
# --------------------------------------------------------------------------


def _labels(a: ComparedSide, b: ComparedSide) -> tuple[str, str]:
    """What to call each side in prose. Two CVs of the same person share a
    name, so the document has to do the distinguishing."""
    if a.candidate_id == b.candidate_id:
        return f"{a.candidate_name} ({a.file_name})", f"{b.candidate_name} ({b.file_name})"
    return a.candidate_name, b.candidate_name


def _short_labels(a: ComparedSide, b: ComparedSide) -> tuple[str, str]:
    """The same distinction, short enough for a column heading."""
    if a.candidate_id == b.candidate_id:
        return a.file_name, b.file_name
    return a.candidate_name, b.candidate_name


def _name_of(side: str, a_label: str, b_label: str) -> str:
    return a_label if side == SIDE_A else b_label


def _plural(count: int, singular: str) -> str:
    return f"{count} {singular}" if count == 1 else f"{count} {singular}s"


def _decisive_factors(
    criteria: list[ComparedCriterion], a_label: str, b_label: str
) -> list[str]:
    factors: list[str] = []
    for row in criteria:
        if row.winner == TIE:
            factors.append(
                f"{row.label}: both land on the same score ({a_label} "
                f"{row.a_detail}, {b_label} {row.b_detail}), so it moves the "
                "gap by nothing."
            )
            continue
        leader = _name_of(row.winner, a_label, b_label)
        factors.append(
            f"{row.label}: {leader} leads by {abs(row.score_delta):.0f} points on "
            f"the criterion, which at a {row.weight:.0f}% weight is worth "
            f"{abs(row.contribution_delta):.1f} points of the overall score "
            f"({a_label} {row.a_detail}; {b_label} {row.b_detail})."
        )
    return factors


MARGIN_WORDING = {
    "narrow": "narrowly ahead of",
    "clear": "ahead of",
    "decisive": "well ahead of",
}


def _skills_sentence(groups: list[ComparedSkillGroup], a_name: str, b_name: str) -> str:
    required = next((group for group in groups if group.kind == "required"), None)
    if required is None or not (
        required.both or required.only_a or required.only_b or required.neither
    ):
        return ""

    parts = [f"Both cover {_plural(len(required.both), 'required skill')}"]
    if required.both:
        parts[0] += f" ({', '.join(required.both)})"
    parts[0] += "."
    if required.only_a:
        parts.append(f"Only {a_name} has {', '.join(required.only_a)}.")
    if required.only_b:
        parts.append(f"Only {b_name} has {', '.join(required.only_b)}.")
    if required.neither:
        parts.append(f"Neither has {', '.join(required.neither)}.")
    return " ".join(parts)


def _job_summary(
    job_title: str,
    a: ComparedSide,
    b: ComparedSide,
    a_label: str,
    b_label: str,
    winner: Optional[str],
    score_delta: Optional[float],
    margin: Optional[str],
    criteria: list[ComparedCriterion],
    groups: list[ComparedSkillGroup],
) -> str:
    if a.overall_score is None or b.overall_score is None:
        return (
            f"Neither CV can be scored against '{job_title}': the job has no "
            "usable structured requirements (no required skills, no valid "
            "required experience, and no mappable required education), so "
            "there is no basis on which one could be called the better match. "
            "The profile differences below are still factual."
        )

    parts: list[str] = []
    if winner == TIE or not score_delta:
        parts.append(
            f"{a_label} and {b_label} score the same against "
            f"'{job_title}': {a.overall_score:.1f}%."
        )
    else:
        leader, trailer = (a, b) if winner == SIDE_A else (b, a)
        leader_label, trailer_label = (
            (a_label, b_label) if winner == SIDE_A else (b_label, a_label)
        )
        parts.append(
            f"{leader_label} is {MARGIN_WORDING[margin]} "
            f"{trailer_label} for '{job_title}': "
            f"{leader.overall_score:.1f}% against {trailer.overall_score:.1f}%, "
            f"a gap of {abs(score_delta):.1f} points."
        )

    if criteria:
        top = criteria[0]
        if top.winner == TIE:
            parts.append(
                "No single criterion separates them: every weighted criterion "
                "lands on the same score for both."
            )
        else:
            parts.append(
                f"{CRITERION_LABELS[top.criterion]} explains most of it - "
                f"{abs(top.contribution_delta):.1f} of those points, in "
                f"{_name_of(top.winner, a_label, b_label)}'s favour."
            )

    skills = _skills_sentence(groups, a_label, b_label)
    if skills:
        parts.append(skills)

    parts.append(
        "Every point above comes from the same deterministic scorer that "
        "produced the ranking; preferred skills and languages are shown for "
        "context and never counted."
    )
    return " ".join(parts)


def _profile_summary(
    a: ComparedSide, b: ComparedSide, a_label: str, b_label: str, shared_skills: int
) -> str:
    return " ".join(
        [
            "No job was chosen, so neither CV has a score: a score only means "
            "something against requirements.",
            f"{a_label} lists {_plural(a.skills_count, 'skill')} and "
            f"{a.experience_years:.1f} years of experience; "
            f"{b_label} lists {b.skills_count} and "
            f"{b.experience_years:.1f}. They share "
            f"{_plural(shared_skills, 'skill')}.",
            f"Highest education: {a.education_level or 'not identified'} against "
            f"{b.education_level or 'not identified'}.",
            "Pick a job to see which of the two matches its requirements better.",
        ]
    )


# --------------------------------------------------------------------------
# Public API
# --------------------------------------------------------------------------


def _side(
    facts: _CvFacts,
    outcome: MatchOutcome,
    *,
    scored: bool,
    application_id: Optional[int],
) -> ComparedSide:
    return ComparedSide(
        cv_id=facts.cv_id,
        candidate_id=facts.candidate_id,
        candidate_name=facts.candidate_name,
        email=facts.email,
        file_name=facts.file_name,
        uploaded_at=facts.uploaded_at,
        application_id=application_id,
        status=(
            None
            if not scored
            else ("scored" if outcome.overall_score is not None else "unscorable")
        ),
        overall_score=outcome.overall_score,
        skill_score=to_percent(outcome.skill.score),
        experience_score=to_percent(outcome.experience.score),
        education_score=to_percent(outcome.education.score),
        matched_required_skills=outcome.skill.matched_skills,
        missing_required_skills=outcome.skill.missing_required_skills,
        matched_required_skills_count=outcome.skill.matched_count,
        total_required_skills=outcome.skill.total_required,
        preferred_skills_matched=outcome.preferred_skills_matched,
        total_preferred_skills=outcome.total_preferred_skills,
        experience_years=outcome.experience.candidate_experience_years,
        education_level=outcome.education.candidate_level_name,
        field_of_study=outcome.education.candidate_field_of_study,
        latest_position=facts.latest_position,
        skills_count=len(facts.skill_names),
        languages=facts.languages,
        explanation=outcome.explanation if scored else None,
    )


def compare_cvs(
    db: Session,
    cv_a_id: int,
    cv_b_id: int,
    *,
    job_id: Optional[int] = None,
    today: Optional[date] = None,
) -> ComparisonResponse:
    """Compare two CVs, against one Job when given.

    Raises `SameCvError` for a CV compared with itself, `CvNotFoundError` for
    a CV that does not exist and `JobNotFoundError` for a Job that does not.
    Nothing is written: a Comparison is a read of the scorer, not a scoring
    event.
    """
    if cv_a_id == cv_b_id:
        raise SameCvError("A CV cannot be compared with itself.")

    cv_inputs: dict[int, CvMatchInput] = {
        cv_id: load_cv_match_input(db, cv_id) for cv_id in (cv_a_id, cv_b_id)
    }
    facts = _load_cv_facts(db, [cv_a_id, cv_b_id])
    for cv_id in (cv_a_id, cv_b_id):
        if cv_id not in facts:
            raise CvNotFoundError(f"CV {cv_id} not found.")

    scored = job_id is not None
    job_input = load_job_match_input(db, job_id) if scored else _empty_job_input()
    effective_today = today or date.today()

    a_outcome = score_cv_against_job(cv_inputs[cv_a_id], job_input, effective_today)
    b_outcome = score_cv_against_job(cv_inputs[cv_b_id], job_input, effective_today)

    application_ids = (
        _load_application_ids(db, job_id, [cv_a_id, cv_b_id]) if scored else {}
    )

    a = _side(
        facts[cv_a_id], a_outcome, scored=scored, application_id=application_ids.get(cv_a_id)
    )
    b = _side(
        facts[cv_b_id], b_outcome, scored=scored, application_id=application_ids.get(cv_b_id)
    )

    a_skill_ids = set(facts[cv_a_id].skill_names)
    b_skill_ids = set(facts[cv_b_id].skill_names)
    shared_skills = len(a_skill_ids & b_skill_ids)
    job_skill_ids = job_input.required_skill_ids | job_input.preferred_skill_ids

    groups: list[ComparedSkillGroup] = []
    if job_input.required_skill_names:
        groups.append(
            _skill_group(
                "required",
                "Required skills",
                job_input.required_skill_names,
                a_skill_ids,
                b_skill_ids,
            )
        )
    if job_input.preferred_skill_names:
        groups.append(
            _skill_group(
                "preferred",
                "Preferred skills (never scored)",
                job_input.preferred_skill_names,
                a_skill_ids,
                b_skill_ids,
            )
        )
    groups.append(
        _other_skill_group(
            "Other skills on the CVs" if scored else "Skills",
            facts[cv_a_id].skill_names,
            facts[cv_b_id].skill_names,
            job_skill_ids,
        )
    )

    criteria = _build_criteria(a_outcome, b_outcome) if scored else []
    differences = _profile_differences(a, b, shared_skills)
    a_label, b_label = _labels(a, b)
    a.label, b.label = _short_labels(a, b)

    if scored and a.overall_score is not None and b.overall_score is not None:
        score_delta = round(a.overall_score - b.overall_score, 2)
        winner = _side_of(score_delta)
        margin = _margin_of(score_delta)
        decisive = _decisive_factors(criteria, a_label, b_label)
        summary = _job_summary(
            job_input.title,
            a,
            b,
            a_label,
            b_label,
            winner,
            score_delta,
            margin,
            criteria,
            groups,
        )
    elif scored:
        score_delta = None
        winner = None
        margin = None
        decisive = []
        summary = _job_summary(
            job_input.title, a, b, a_label, b_label, None, None, None, criteria, groups
        )
    else:
        score_delta = None
        winner = None
        margin = None
        decisive = []
        summary = _profile_summary(a, b, a_label, b_label, shared_skills)

    return ComparisonResponse(
        mode=MODE_JOB if scored else MODE_PROFILE,
        job_id=job_id,
        job_title=job_input.title if scored else None,
        ready_to_match=bool(scored and a_outcome.available_criteria),
        algorithm_version=ALGORITHM_VERSION,
        a=a,
        b=b,
        winner=winner,
        score_delta=score_delta,
        margin=margin,
        criteria=criteria,
        skill_groups=groups,
        profile_differences=differences,
        decisive_factors=decisive,
        summary=summary,
    )


__all__ = [
    "ComparedCriterion",
    "ComparedSide",
    "ComparedSkillGroup",
    "ComparisonResponse",
    "CvNotFoundError",
    "JobNotFoundError",
    "ProfileDifference",
    "SameCvError",
    "compare_cvs",
]
