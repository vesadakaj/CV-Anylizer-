"""Persist one extracted CV: the CV row, its Profile rows and the Candidate
it belongs to (found by normalised email or created).

Deduplication is by normalised email only (ADR 0001, CONTEXT.md
"Unlinkable"): trimmed and lower-cased, matched against
`Candidates.email_normalized`. A CV with no email always creates a new
Candidate. When an existing Candidate is reused, this CV becomes the
newest and refreshes the contact details it actually carries.
"""

from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.candidate import Candidate
from models.cv import CV
from models.cv_language import CvLanguage
from models.cv_skill import CvSkill
from models.education import Education
from models.language import Language
from models.project import Project
from models.skill import Skill
from models.work_experience import WorkExperience
from services.candidate_extraction import CandidateInfo

DATE_FORMATS = ("%Y-%m-%d", "%Y-%m", "%B %Y", "%b %Y", "%Y")


class CvPersistenceError(Exception):
    pass


@dataclass(frozen=True)
class SavedCv:
    cv_id: int
    candidate_id: int
    candidate_matched_existing: bool
    linkable: bool


def normalize_candidate_email(email: str | None) -> str | None:
    """The deduplication key: trimmed and lower-cased, or None when the
    extraction found no usable address."""
    if email is None:
        return None
    normalized = email.strip().lower()
    return normalized or None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None

    value = value.strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue

    return None


def _get_or_create_skill(db: Session, name: str) -> Skill:
    skill = (
        db.query(Skill)
        .filter(func.lower(Skill.name) == name.strip().lower())
        .first()
    )
    if skill is None:
        skill = Skill(name=name.strip())
        db.add(skill)
        db.flush()

    return skill


def _get_or_create_language(db: Session, name: str) -> Language:
    language = (
        db.query(Language)
        .filter(func.lower(Language.name) == name.strip().lower())
        .first()
    )
    if language is None:
        language = Language(name=name.strip())
        db.add(language)
        db.flush()

    return language


def _find_or_create_candidate(
    db: Session, candidate_info: CandidateInfo
) -> tuple[Candidate, bool]:
    """Return (candidate, matched_existing). Only a normalised email can
    match; without one a new Candidate is always created."""
    email_normalized = normalize_candidate_email(candidate_info.email)
    full_name = (candidate_info.full_name or "").strip() or "Unknown"

    if email_normalized is not None:
        existing = (
            db.query(Candidate)
            .filter(Candidate.email_normalized == email_normalized)
            .one_or_none()
        )
        if existing is not None:
            # The newest CV supplies the contact details (CONTEXT.md, "CV").
            # A detail this CV does not carry leaves the old value in place.
            if candidate_info.full_name and candidate_info.full_name.strip():
                existing.full_name = full_name
            if candidate_info.email and candidate_info.email.strip():
                existing.email = candidate_info.email.strip()
            if candidate_info.phone and candidate_info.phone.strip():
                existing.phone = candidate_info.phone.strip()
            if candidate_info.location and candidate_info.location.strip():
                existing.location = candidate_info.location.strip()
            db.flush()
            return existing, True

    candidate = Candidate(
        full_name=full_name,
        email=candidate_info.email.strip() if candidate_info.email else None,
        email_normalized=email_normalized,
        phone=candidate_info.phone,
        location=candidate_info.location,
    )
    db.add(candidate)
    db.flush()
    return candidate, False


def _add_profile_rows(db: Session, cv_id: int, candidate_info: CandidateInfo) -> None:
    for edu in candidate_info.education:
        db.add(
            Education(
                cv_id=cv_id,
                institution=edu.institution,
                degree=edu.degree,
                field_of_study=edu.field_of_study,
                start_date=_parse_date(edu.start_date),
                end_date=_parse_date(edu.end_date),
                description=edu.description,
            )
        )

    for exp in candidate_info.work_experience:
        db.add(
            WorkExperience(
                cv_id=cv_id,
                company_name=exp.company_name,
                position_title=exp.position_title,
                description=exp.description,
                start_date=_parse_date(exp.start_date),
                end_date=_parse_date(exp.end_date),
                is_current=exp.is_current,
            )
        )

    for proj in candidate_info.projects:
        db.add(
            Project(
                cv_id=cv_id,
                name=proj.name,
                description=proj.description,
                technologies=proj.technologies,
                project_url=proj.project_url,
            )
        )

    seen_skill_ids: set[int] = set()
    for skill in candidate_info.skills:
        if not skill.name.strip():
            continue
        skill_row = _get_or_create_skill(db, skill.name)
        if skill_row.id in seen_skill_ids:
            continue
        seen_skill_ids.add(skill_row.id)
        db.add(
            CvSkill(
                cv_id=cv_id,
                skill_id=skill_row.id,
                years_experience=skill.years_experience,
                proficiency_level=skill.proficiency_level,
            )
        )

    seen_language_ids: set[int] = set()
    for lang in candidate_info.languages:
        if not lang.name.strip():
            continue
        language_row = _get_or_create_language(db, lang.name)
        if language_row.id in seen_language_ids:
            continue
        seen_language_ids.add(language_row.id)
        db.add(
            CvLanguage(
                cv_id=cv_id,
                language_id=language_row.id,
                level=lang.level,
            )
        )


def save_cv(
    db: Session,
    candidate_info: CandidateInfo,
    *,
    file_name: str,
    file_type: str,
    extracted_text: str,
    uploaded_by_user_id: int,
) -> SavedCv:
    """Store the CV, its Profile rows and its Candidate in one transaction.

    Rolls back everything on failure so a half-saved CV never exists.
    """
    try:
        candidate, matched_existing = _find_or_create_candidate(db, candidate_info)

        cv = CV(
            candidate_id=candidate.id,
            uploaded_by_user_id=uploaded_by_user_id,
            file_name=file_name,
            file_type=file_type,
            extracted_text=extracted_text,
        )
        db.add(cv)
        db.flush()

        _add_profile_rows(db, cv.id, candidate_info)

        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise CvPersistenceError(f"Could not save CV data: {exc}") from exc

    return SavedCv(
        cv_id=cv.id,
        candidate_id=candidate.id,
        candidate_matched_existing=matched_existing,
        linkable=candidate.email_normalized is not None,
    )
