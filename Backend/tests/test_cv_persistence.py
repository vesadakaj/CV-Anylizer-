"""services/cv_persistence.save_cv: one CV row, its Profile rows under
cv_id, and a Candidate found by normalised email or created (W2.5)."""

import pytest
from sqlalchemy.exc import SQLAlchemyError

from models.candidate import Candidate
from models.cv import CV
from models.cv_language import CvLanguage
from models.cv_skill import CvSkill
from models.education import Education
from models.project import Project
from models.skill import Skill
from models.work_experience import WorkExperience
from services import cv_persistence
from services.candidate_extraction import (
    CandidateInfo,
    EducationItem,
    LanguageItem,
    ProjectItem,
    SkillItem,
    WorkExperienceItem,
)
from services.cv_persistence import CvPersistenceError, normalize_candidate_email, save_cv


def info(**overrides) -> CandidateInfo:
    base = dict(
        full_name="Jane Doe",
        email="jane@x.com",
        phone="123",
        location="Prishtina",
        education=[],
        work_experience=[],
        projects=[],
        skills=[],
        languages=[],
    )
    base.update(overrides)
    return CandidateInfo(**base)


def save(db, user, candidate_info, file_name="cv.pdf"):
    return save_cv(
        db,
        candidate_info,
        file_name=file_name,
        file_type=".pdf",
        extracted_text="text",
        uploaded_by_user_id=user.id,
    )


def test_normalize_email():
    assert normalize_candidate_email("  Jane@X.com ") == "jane@x.com"
    assert normalize_candidate_email("") is None
    assert normalize_candidate_email("   ") is None
    assert normalize_candidate_email(None) is None


def test_first_cv_creates_candidate_and_cv(db_session, user):
    saved = save(db_session, user, info())

    assert saved.candidate_matched_existing is False
    assert saved.linkable is True
    candidate = db_session.get(Candidate, saved.candidate_id)
    assert candidate.email == "jane@x.com"
    assert candidate.email_normalized == "jane@x.com"
    cv = db_session.get(CV, saved.cv_id)
    assert cv.candidate_id == candidate.id
    assert cv.uploaded_by_user_id == user.id
    assert cv.file_name == "cv.pdf"


def test_same_email_twice_gives_one_candidate_and_two_cvs(db_session, user):
    first = save(db_session, user, info(), file_name="first.pdf")
    second = save(db_session, user, info(phone="999"), file_name="second.pdf")

    assert second.candidate_id == first.candidate_id
    assert second.candidate_matched_existing is True
    assert second.cv_id != first.cv_id
    assert db_session.query(Candidate).count() == 1
    assert db_session.query(CV).count() == 2
    # The newest CV refreshes the contact details it carries.
    assert db_session.get(Candidate, first.candidate_id).phone == "999"


def test_email_matching_ignores_case_and_whitespace(db_session, user):
    first = save(db_session, user, info(email="jane@x.com"))
    second = save(db_session, user, info(email="  Jane@X.com "))

    assert second.candidate_id == first.candidate_id
    assert second.candidate_matched_existing is True
    assert db_session.query(Candidate).count() == 1


def test_details_the_new_cv_does_not_carry_are_kept(db_session, user):
    first = save(db_session, user, info(phone="123", location="Prishtina"))
    save(db_session, user, info(phone=None, location="  "))

    candidate = db_session.get(Candidate, first.candidate_id)
    assert candidate.phone == "123"
    assert candidate.location == "Prishtina"


def test_no_email_twice_gives_two_unlinkable_candidates(db_session, user):
    first = save(db_session, user, info(email=None))
    second = save(db_session, user, info(email=None))

    assert first.candidate_id != second.candidate_id
    assert first.linkable is False
    assert second.linkable is False
    assert db_session.query(Candidate).count() == 2
    assert all(c.email_normalized is None for c in db_session.query(Candidate).all())


def test_blank_email_counts_as_no_email(db_session, user):
    saved = save(db_session, user, info(email="   "))
    assert saved.linkable is False
    assert db_session.get(Candidate, saved.candidate_id).email_normalized is None


def test_missing_name_falls_back_to_unknown(db_session, user):
    saved = save(db_session, user, info(full_name="  ", email=None))
    assert db_session.get(Candidate, saved.candidate_id).full_name == "Unknown"


def test_profile_rows_hang_off_the_cv(db_session, user):
    saved = save(
        db_session,
        user,
        info(
            education=[EducationItem(institution="Uni", degree="BSc", field_of_study="CS", start_date="2018", end_date="2021-06")],
            work_experience=[
                WorkExperienceItem(company_name="Acme", position_title="Dev", start_date="Jan 2022", end_date=None, is_current=True)
            ],
            projects=[ProjectItem(name="Thing", technologies="Python")],
            skills=[SkillItem(name="Python"), SkillItem(name="python"), SkillItem(name="  "), SkillItem(name="SQL")],
            languages=[LanguageItem(name="English", level="C1"), LanguageItem(name="english")],
        ),
    )

    assert db_session.query(Education).filter(Education.cv_id == saved.cv_id).count() == 1
    education = db_session.query(Education).one()
    assert str(education.start_date) == "2018-01-01"
    assert str(education.end_date) == "2021-06-01"
    work = db_session.query(WorkExperience).filter(WorkExperience.cv_id == saved.cv_id).one()
    assert str(work.start_date) == "2022-01-01"
    assert work.is_current is True
    assert db_session.query(Project).filter(Project.cv_id == saved.cv_id).count() == 1
    # Duplicate and blank skill names collapse to one row per skill.
    skill_names = {
        name
        for (name,) in db_session.query(Skill.name)
        .join(CvSkill, CvSkill.skill_id == Skill.id)
        .filter(CvSkill.cv_id == saved.cv_id)
    }
    assert skill_names == {"Python", "SQL"}
    assert db_session.query(CvLanguage).filter(CvLanguage.cv_id == saved.cv_id).count() == 1


def test_second_cv_gets_its_own_profile_rows(db_session, user):
    first = save(db_session, user, info(skills=[SkillItem(name="Python")]))
    second = save(db_session, user, info(skills=[SkillItem(name="Python"), SkillItem(name="SQL")]))

    assert db_session.query(CvSkill).filter(CvSkill.cv_id == first.cv_id).count() == 1
    assert db_session.query(CvSkill).filter(CvSkill.cv_id == second.cv_id).count() == 2
    # The Skill catalogue is shared and never duplicated.
    assert db_session.query(Skill).count() == 2


def test_failure_rolls_back_the_whole_cv(db_session, user, monkeypatch):
    def _boom(*args, **kwargs):
        raise SQLAlchemyError("boom")

    monkeypatch.setattr(cv_persistence, "_add_profile_rows", _boom)

    with pytest.raises(CvPersistenceError):
        save(db_session, user, info())

    assert db_session.query(Candidate).count() == 0
    assert db_session.query(CV).count() == 0
