"""Row builders shared by the integration tests. Every builder flushes so
ids are available; the caller commits."""

from datetime import date

from models.application import Application
from models.candidate import Candidate
from models.cv import CV
from models.cv_skill import CvSkill
from models.education import Education
from models.job import Job
from models.job_skill import JobSkill
from models.skill import Skill
from models.work_experience import WorkExperience
from services.cv_persistence import normalize_candidate_email


def make_candidate(db, name="Candidate", email=None, **kwargs):
    candidate = Candidate(
        full_name=name,
        email=email,
        email_normalized=normalize_candidate_email(email),
        **kwargs,
    )
    db.add(candidate)
    db.flush()
    return candidate


def make_cv(db, candidate, user, file_name="cv.pdf", **kwargs):
    cv = CV(
        candidate_id=candidate.id,
        uploaded_by_user_id=user.id,
        file_name=file_name,
        file_type=".pdf",
        extracted_text="text",
        **kwargs,
    )
    db.add(cv)
    db.flush()
    return cv


def make_candidate_with_cv(db, user, name="Candidate", email=None, file_name="cv.pdf"):
    candidate = make_candidate(db, name, email=email)
    cv = make_cv(db, candidate, user, file_name=file_name)
    return candidate, cv


def make_job(db, user, title="Job", **kwargs):
    defaults = dict(title=title, description="desc", created_by_user_id=user.id)
    defaults.update(kwargs)
    job = Job(**defaults)
    db.add(job)
    db.flush()
    return job


def get_or_create_skill(db, name):
    skill = db.query(Skill).filter(Skill.name == name).first()
    if skill is None:
        skill = Skill(name=name)
        db.add(skill)
        db.flush()
    return skill


def add_cv_skill(db, cv, name):
    skill = get_or_create_skill(db, name)
    db.add(CvSkill(cv_id=cv.id, skill_id=skill.id))
    db.flush()


def add_job_skill(db, job, name, required=True):
    skill = get_or_create_skill(db, name)
    db.add(JobSkill(job_id=job.id, skill_id=skill.id, is_required=required))
    db.flush()


def add_education(db, cv, degree, field_of_study=None):
    db.add(
        Education(
            cv_id=cv.id,
            institution="Some University",
            degree=degree,
            field_of_study=field_of_study,
        )
    )
    db.flush()


def add_experience(db, cv, start: date, end: date | None, is_current=False, company="Acme"):
    db.add(
        WorkExperience(
            cv_id=cv.id,
            company_name=company,
            position_title="Engineer",
            start_date=start,
            end_date=end,
            is_current=is_current,
        )
    )
    db.flush()


def make_application(db, candidate, job, cv, user):
    """An unscored Application row (no Match Result), for tests that want
    the ranking to compute one on read."""
    application = Application(
        candidate_id=candidate.id,
        job_id=job.id,
        cv_id=cv.id,
        created_by_user_id=user.id,
    )
    db.add(application)
    db.flush()
    return application
