from datetime import date, datetime

from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from models.candidate import Candidate
from models.candidate_language import CandidateLanguage
from models.candidate_skill import CandidateSkill
from models.cv import CV
from models.education import Education
from models.language import Language
from models.project import Project
from models.skill import Skill
from models.work_experience import WorkExperience
from services.candidate_extraction import CandidateInfo

DATE_FORMATS = ("%Y-%m-%d", "%Y-%m", "%B %Y", "%b %Y", "%Y")


class CandidatePersistenceError(Exception):
    pass


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


def save_candidate(
    db: Session,
    candidate_info: CandidateInfo,
    file_name: str,
    file_type: str,
    extracted_text: str,
) -> Candidate:
    try:
        candidate = Candidate(
            full_name=candidate_info.full_name,
            email=candidate_info.email,
            phone=candidate_info.phone,
            location=candidate_info.location,
        )
        db.add(candidate)
        db.flush()

        for edu in candidate_info.education:
            db.add(
                Education(
                    candidate_id=candidate.id,
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
                    candidate_id=candidate.id,
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
                    candidate_id=candidate.id,
                    name=proj.name,
                    description=proj.description,
                    technologies=proj.technologies,
                    project_url=proj.project_url,
                )
            )

        for skill in candidate_info.skills:
            if not skill.name.strip():
                continue
            skill_row = _get_or_create_skill(db, skill.name)
            db.add(
                CandidateSkill(
                    candidate_id=candidate.id,
                    skill_id=skill_row.id,
                    years_experience=skill.years_experience,
                    proficiency_level=skill.proficiency_level,
                )
            )

        for lang in candidate_info.languages:
            if not lang.name.strip():
                continue
            language_row = _get_or_create_language(db, lang.name)
            db.add(
                CandidateLanguage(
                    candidate_id=candidate.id,
                    language_id=language_row.id,
                    level=lang.level,
                )
            )

        db.add(
            CV(
                candidate_id=candidate.id,
                file_name=file_name,
                file_type=file_type,
                extracted_text=extracted_text,
            )
        )

        db.commit()
        db.refresh(candidate)
    except SQLAlchemyError as exc:
        db.rollback()
        raise CandidatePersistenceError(
            f"Could not save candidate data: {exc}"
        ) from exc

    return candidate
