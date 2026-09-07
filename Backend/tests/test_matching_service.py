"""Integration tests for services/matching.py against an isolated in-memory
SQLite database (see conftest.py). These never touch the real MSSQL database.
"""

from datetime import date

import pytest
from sqlalchemy import event

from models.candidate import Candidate
from models.candidate_skill import CandidateSkill
from models.education import Education
from models.job import Job
from models.job_skill import JobSkill
from models.match_result import MatchResult
from models.skill import Skill
from models.work_experience import WorkExperience
from services.matching import (
    CandidateNotFoundError,
    JobNotFoundError,
    get_candidate_job_match,
    get_job_candidate_matches,
)

TODAY = date(2026, 9, 2)


def make_candidate(db, name="Candidate", **kwargs):
    candidate = Candidate(full_name=name, **kwargs)
    db.add(candidate)
    db.flush()
    return candidate


def make_job(db, title="Job", **kwargs):
    job = Job(title=title, description="desc", **kwargs)
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


def add_candidate_skill(db, candidate, name):
    skill = get_or_create_skill(db, name)
    db.add(CandidateSkill(candidate_id=candidate.id, skill_id=skill.id))
    db.flush()


def add_job_skill(db, job, name, required=True):
    skill = get_or_create_skill(db, name)
    db.add(JobSkill(job_id=job.id, skill_id=skill.id, is_required=required))
    db.flush()


def add_education(db, candidate, degree, field_of_study=None):
    db.add(
        Education(
            candidate_id=candidate.id,
            institution="Some University",
            degree=degree,
            field_of_study=field_of_study,
        )
    )
    db.flush()


def add_experience(db, candidate, start, end, is_current=False, company="Acme"):
    db.add(
        WorkExperience(
            candidate_id=candidate.id,
            company_name=company,
            position_title="Engineer",
            start_date=start,
            end_date=end,
            is_current=is_current,
        )
    )
    db.flush()


# --------------------------------------------------------------------------
# Not found
# --------------------------------------------------------------------------


def test_candidate_not_found_raises(db_session):
    job = make_job(db_session)
    db_session.commit()
    with pytest.raises(CandidateNotFoundError):
        get_candidate_job_match(db_session, candidate_id=999, job_id=job.id)


def test_job_not_found_raises(db_session):
    candidate = make_candidate(db_session)
    db_session.commit()
    with pytest.raises(JobNotFoundError):
        get_candidate_job_match(db_session, candidate_id=candidate.id, job_id=999)


def test_ranking_job_not_found_raises(db_session):
    with pytest.raises(JobNotFoundError):
        get_job_candidate_matches(db_session, job_id=999)


# --------------------------------------------------------------------------
# Full scoring scenario (mirrors the real Jane Doe / Backend Developer data)
# --------------------------------------------------------------------------


def test_full_scoring_scenario(db_session):
    candidate = make_candidate(db_session, "Jane Doe")
    for skill in ["Python", "FastAPI", "SQL", "React"]:
        add_candidate_skill(db_session, candidate, skill)
    add_experience(db_session, candidate, date(2022, 1, 1), None, is_current=True)
    add_education(db_session, candidate, "BSc", "Computer Science")

    job = make_job(
        db_session,
        "Backend Developer",
        required_experience_years=3.0,
        required_education="Bachelor's degree in Computer Science",
    )
    add_job_skill(db_session, job, "Python", required=True)
    add_job_skill(db_session, job, "FastAPI", required=True)
    add_job_skill(db_session, job, "SQL databases", required=True)
    add_job_skill(db_session, job, "REST APIs", required=True)
    add_job_skill(db_session, job, "Docker", required=False)
    db_session.commit()

    outcome = get_candidate_job_match(
        db_session, candidate.id, job.id, today=TODAY, persist=False
    )

    assert outcome.skill.matched_count == 2
    assert outcome.skill.total_required == 4
    assert outcome.skill.score == 0.5
    assert outcome.experience.score == 1.0  # capped, exceeds requirement
    assert outcome.education.score == 1.0
    assert outcome.overall_score == 75.0
    assert outcome.available_criteria == ["skills", "experience", "education"]


def test_preferred_qualifications_and_description_do_not_affect_score(db_session):
    """Responsibilities, required/preferred qualifications, and the raw
    description are informational-only text fields the matching layer never
    reads (see services/matching.py module docstring) - two otherwise
    identical jobs must score identically regardless of what they contain."""
    candidate = make_candidate(db_session, "Jane Doe")
    add_candidate_skill(db_session, candidate, "Python")
    add_experience(db_session, candidate, date(2022, 1, 1), None, is_current=True)
    add_education(db_session, candidate, "BSc", "Computer Science")

    plain_job = make_job(
        db_session,
        "Backend Developer",
        required_experience_years=3.0,
        required_education="Bachelor's degree",
    )
    add_job_skill(db_session, plain_job, "Python", required=True)

    decorated_job = make_job(
        db_session,
        "Backend Developer",
        required_experience_years=3.0,
        required_education="Bachelor's degree",
        responsibilities='["Ship features", "Review code"]',
        required_qualifications='["Excellent communication skills"]',
        preferred_qualifications='["10 years of Python", "PhD preferred"]',
    )
    add_job_skill(db_session, decorated_job, "Python", required=True)
    db_session.commit()

    plain_outcome = get_candidate_job_match(
        db_session, candidate.id, plain_job.id, today=TODAY, persist=False
    )
    decorated_outcome = get_candidate_job_match(
        db_session, candidate.id, decorated_job.id, today=TODAY, persist=False
    )

    assert plain_outcome.overall_score == decorated_outcome.overall_score
    assert plain_outcome.available_criteria == decorated_outcome.available_criteria


# --------------------------------------------------------------------------
# Unscorable job
# --------------------------------------------------------------------------


def test_job_with_no_usable_criteria_is_unscorable(db_session):
    candidate = make_candidate(db_session)
    job = make_job(db_session, required_experience_years=None, required_education=None)
    db_session.commit()

    outcome = get_candidate_job_match(db_session, candidate.id, job.id, today=TODAY)

    assert outcome.overall_score is None
    assert outcome.available_criteria == []
    # No misleading zero-percent row should be persisted.
    assert db_session.query(MatchResult).count() == 0


def test_zero_required_experience_excludes_experience_criterion(db_session):
    candidate = make_candidate(db_session)
    job = make_job(db_session, required_experience_years=0)
    add_job_skill(db_session, job, "Python", required=True)
    add_candidate_skill(db_session, candidate, "Python")
    db_session.commit()

    outcome = get_candidate_job_match(db_session, candidate.id, job.id, today=TODAY)
    assert "experience" not in outcome.available_criteria
    assert outcome.available_criteria == ["skills"]


# --------------------------------------------------------------------------
# Persistence: upsert, no duplicates, deterministic
# --------------------------------------------------------------------------


def test_repeated_matching_is_deterministic_and_does_not_duplicate(db_session):
    candidate = make_candidate(db_session)
    add_candidate_skill(db_session, candidate, "Python")
    job = make_job(db_session)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    first = get_candidate_job_match(db_session, candidate.id, job.id, today=TODAY)
    second = get_candidate_job_match(db_session, candidate.id, job.id, today=TODAY)

    assert first.overall_score == second.overall_score
    assert db_session.query(MatchResult).count() == 1

    row = db_session.query(MatchResult).one()
    assert row.overall_score == first.overall_score


def test_persistence_updates_existing_row_when_data_changes(db_session):
    candidate = make_candidate(db_session)
    job = make_job(db_session)
    add_job_skill(db_session, job, "Python", required=True)
    add_job_skill(db_session, job, "SQL", required=True)
    db_session.commit()

    before = get_candidate_job_match(db_session, candidate.id, job.id, today=TODAY)
    assert before.overall_score == 0.0

    add_candidate_skill(db_session, candidate, "Python")
    add_candidate_skill(db_session, candidate, "SQL")
    db_session.commit()

    after = get_candidate_job_match(db_session, candidate.id, job.id, today=TODAY)
    assert after.overall_score == 100.0
    assert db_session.query(MatchResult).count() == 1


# --------------------------------------------------------------------------
# Ranking
# --------------------------------------------------------------------------


def _make_ranking_fixture(db):
    job = make_job(db, "Backend Developer", required_experience_years=None, required_education=None)
    add_job_skill(db, job, "Python", required=True)
    add_job_skill(db, job, "SQL", required=True)

    high = make_candidate(db, "High Scorer")
    add_candidate_skill(db, high, "Python")
    add_candidate_skill(db, high, "SQL")

    mid = make_candidate(db, "Mid Scorer")
    add_candidate_skill(db, mid, "Python")

    low = make_candidate(db, "Low Scorer")

    tie_a = make_candidate(db, "Tie A")
    tie_b = make_candidate(db, "Tie B")
    # tie_a.id < tie_b.id by insertion order; both get 0 matches -> tie.

    db.commit()
    return job, high, mid, low, tie_a, tie_b


def test_ranking_orders_highest_first(db_session):
    job, high, mid, low, *_ = _make_ranking_fixture(db_session)

    result = get_job_candidate_matches(db_session, job.id, today=TODAY, limit=50)

    scores = [c.overall_score for c in result.candidates]
    assert scores == sorted(scores, reverse=True)
    assert result.candidates[0].candidate_id == high.id


def test_ranking_tie_break_by_candidate_id_ascending(db_session):
    job, high, mid, low, tie_a, tie_b = _make_ranking_fixture(db_session)

    result = get_job_candidate_matches(db_session, job.id, today=TODAY, limit=50)

    tied = [c for c in result.candidates if c.candidate_id in (tie_a.id, tie_b.id)]
    tied_ids = [c.candidate_id for c in tied]
    assert tied_ids == sorted(tied_ids)


def test_ranking_returns_same_scores_as_individual_match(db_session):
    job, high, mid, low, *_ = _make_ranking_fixture(db_session)

    individual = get_candidate_job_match(db_session, high.id, job.id, today=TODAY, persist=False)
    ranking = get_job_candidate_matches(db_session, job.id, today=TODAY, limit=50, persist=False)

    ranked_high = next(c for c in ranking.candidates if c.candidate_id == high.id)
    assert ranked_high.overall_score == individual.overall_score
    assert ranked_high.skill_score == pytest.approx(individual.skill.score * 100)


def test_ranking_pagination_preserves_global_rank(db_session):
    job, high, mid, low, tie_a, tie_b = _make_ranking_fixture(db_session)

    full = get_job_candidate_matches(db_session, job.id, today=TODAY, limit=50)
    page2 = get_job_candidate_matches(db_session, job.id, today=TODAY, limit=2, offset=2)

    assert page2.total_candidates == full.total_candidates
    assert page2.returned_candidates == 2
    assert [c.rank for c in page2.candidates] == [3, 4]
    assert [c.candidate_id for c in page2.candidates] == [
        c.candidate_id for c in full.candidates[2:4]
    ]


def test_ranking_minimum_score_filters_after_scoring_before_pagination(db_session):
    job, high, mid, low, *_ = _make_ranking_fixture(db_session)

    result = get_job_candidate_matches(
        db_session, job.id, today=TODAY, limit=50, minimum_score=50
    )

    assert all(c.overall_score >= 50 for c in result.candidates)
    assert result.total_candidates == len(result.candidates)


def test_ranking_no_candidates_returns_empty_list(db_session):
    job = make_job(db_session)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    result = get_job_candidate_matches(db_session, job.id, today=TODAY)
    assert result.total_candidates == 0
    assert result.candidates == []


def test_repeated_ranking_does_not_duplicate_rows(db_session):
    job, *_ = _make_ranking_fixture(db_session)

    get_job_candidate_matches(db_session, job.id, today=TODAY, limit=50)
    count_after_first = db_session.query(MatchResult).count()
    get_job_candidate_matches(db_session, job.id, today=TODAY, limit=50)
    count_after_second = db_session.query(MatchResult).count()

    assert count_after_first == count_after_second
    # All 5 candidates are scorable: the job has required skills, so the
    # "skills" criterion is available for everyone even at a 0% skill match.
    assert count_after_first == 5


def test_ranking_query_count_does_not_grow_with_candidate_count(db_session):
    job = make_job(db_session, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    for i in range(10):
        c = make_candidate(db_session, f"Candidate {i}")
        add_candidate_skill(db_session, c, "Python")
    db_session.commit()

    queries = {"count": 0}

    def _count(*args, **kwargs):
        queries["count"] += 1

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", _count)
    try:
        get_job_candidate_matches(db_session, job.id, today=TODAY, persist=False)
    finally:
        event.remove(engine, "before_cursor_execute", _count)

    # Fixed number of queries regardless of candidate count: job + required
    # skills, candidates, candidate_skills, work_experience, education.
    assert queries["count"] <= 8
