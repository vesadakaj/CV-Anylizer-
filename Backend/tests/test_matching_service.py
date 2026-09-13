"""Integration tests for services/matching.py and services/applications.py
against an isolated in-memory SQLite database (see conftest.py). These
never touch the real MSSQL database.

Every score belongs to an Application and is computed from the one CV the
Application points at (ADR 0001), so the fixtures build Candidate → CV →
Profile rows and attach the CV to a Job.
"""

from datetime import date, datetime

import pytest
from sqlalchemy import event

from models.application import Application
from models.match_result import MatchResult
from services import matching
from services.applications import (
    CvOwnershipError,
    create_application_for_candidate,
    create_or_update_applications,
)
from services.matching import (
    ApplicationNotFoundError,
    CvNotFoundError,
    JobNotFoundError,
    get_application_match,
    get_job_ranking,
)
from tests.factories import (
    add_cv_skill,
    add_education,
    add_experience,
    add_job_skill,
    make_application,
    make_candidate,
    make_candidate_with_cv,
    make_cv,
    make_job,
)

TODAY = date(2026, 9, 2)


def attach(db, job, cv, user):
    """Create (or update) the Application of `cv` for `job` and return its
    MatchResponse."""
    results = create_or_update_applications(db, job.id, [cv.id], user, today=TODAY)
    return results[0]


# --------------------------------------------------------------------------
# Not found
# --------------------------------------------------------------------------


def test_cv_not_found_raises(db_session, user):
    job = make_job(db_session, user)
    db_session.commit()
    with pytest.raises(CvNotFoundError):
        create_or_update_applications(db_session, job.id, [999], user)


def test_job_not_found_raises(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user)
    db_session.commit()
    with pytest.raises(JobNotFoundError):
        create_or_update_applications(db_session, 999, [cv.id], user)


def test_ranking_job_not_found_raises(db_session):
    with pytest.raises(JobNotFoundError):
        get_job_ranking(db_session, job_id=999)


def test_application_not_found_raises(db_session):
    with pytest.raises(ApplicationNotFoundError):
        get_application_match(db_session, application_id=999)


# --------------------------------------------------------------------------
# Full scoring scenario (mirrors the real Jane Doe / Backend Developer data)
# --------------------------------------------------------------------------


def test_full_scoring_scenario(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user, "Jane Doe")
    for skill in ["Python", "FastAPI", "SQL", "React"]:
        add_cv_skill(db_session, cv, skill)
    add_experience(db_session, cv, date(2022, 1, 1), None, is_current=True)
    add_education(db_session, cv, "BSc", "Computer Science")

    job = make_job(
        db_session,
        user,
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

    result = attach(db_session, job, cv, user)
    match = result.match

    assert result.status == "created"
    assert match.matched_required_skills_count == 2
    assert match.total_required_skills == 4
    assert match.skill_score == 50.0
    assert match.experience_score == 100.0  # capped, exceeds requirement
    assert match.education_score == 100.0
    assert match.overall_score == 75.0
    assert match.available_criteria == ["skills", "experience", "education"]
    # Preferred skills are reported, never scored (Q10, Q17, Q25).
    assert match.total_preferred_skills == 1
    assert match.preferred_skills_matched == []
    assert "0 of 1 preferred" in match.explanation


def test_preferred_qualifications_and_description_do_not_affect_score(db_session, user):
    """Responsibilities, required/preferred qualifications, and the raw
    description are informational-only text fields the matching layer never
    reads (see services/matching.py module docstring) - two otherwise
    identical jobs must score identically regardless of what they contain."""
    _, cv = make_candidate_with_cv(db_session, user, "Jane Doe")
    add_cv_skill(db_session, cv, "Python")
    add_experience(db_session, cv, date(2022, 1, 1), None, is_current=True)
    add_education(db_session, cv, "BSc", "Computer Science")

    plain_job = make_job(
        db_session,
        user,
        "Backend Developer",
        required_experience_years=3.0,
        required_education="Bachelor's degree",
    )
    add_job_skill(db_session, plain_job, "Python", required=True)

    decorated_job = make_job(
        db_session,
        user,
        "Backend Developer",
        required_experience_years=3.0,
        required_education="Bachelor's degree",
        responsibilities='["Ship features", "Review code"]',
        required_qualifications='["Excellent communication skills"]',
        preferred_qualifications='["10 years of Python", "PhD preferred"]',
    )
    add_job_skill(db_session, decorated_job, "Python", required=True)
    db_session.commit()

    plain = attach(db_session, plain_job, cv, user).match
    decorated = attach(db_session, decorated_job, cv, user).match

    assert plain.overall_score == decorated.overall_score
    assert plain.available_criteria == decorated.available_criteria


def test_preferred_skill_match_is_reported_but_not_scored(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user)
    add_cv_skill(db_session, cv, "Python")
    add_cv_skill(db_session, cv, "Docker")
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    add_job_skill(db_session, job, "SQL", required=True)
    add_job_skill(db_session, job, "Docker", required=False)
    db_session.commit()

    match = attach(db_session, job, cv, user).match

    assert match.overall_score == 50.0  # 1 of 2 required; Docker changes nothing
    assert match.preferred_skills_matched == ["Docker"]
    assert match.total_preferred_skills == 1


# --------------------------------------------------------------------------
# Unscorable job
# --------------------------------------------------------------------------


def test_job_with_no_usable_criteria_is_unscorable(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user)
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    db_session.commit()

    result = attach(db_session, job, cv, user)

    assert result.match.status == "unscorable"
    assert result.match.overall_score is None
    assert result.match.available_criteria == []
    # The Application exists; no misleading zero-percent row is persisted.
    assert db_session.query(Application).count() == 1
    assert db_session.query(MatchResult).count() == 0


def test_zero_required_experience_excludes_experience_criterion(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user)
    job = make_job(db_session, user, required_experience_years=0)
    add_job_skill(db_session, job, "Python", required=True)
    add_cv_skill(db_session, cv, "Python")
    db_session.commit()

    match = attach(db_session, job, cv, user).match
    assert "experience" not in match.available_criteria
    assert match.available_criteria == ["skills"]


# --------------------------------------------------------------------------
# Applications: one per (candidate, job); re-attaching repoints and rescores
# --------------------------------------------------------------------------


def test_repeated_attach_is_deterministic_and_does_not_duplicate(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user)
    add_cv_skill(db_session, cv, "Python")
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    first = attach(db_session, job, cv, user)
    second = attach(db_session, job, cv, user)

    assert first.status == "created"
    assert second.status == "updated"
    assert first.application_id == second.application_id
    assert first.match.overall_score == second.match.overall_score
    assert db_session.query(Application).count() == 1
    assert db_session.query(MatchResult).count() == 1

    row = db_session.query(MatchResult).one()
    assert row.overall_score == first.match.overall_score
    assert row.algorithm_version == matching.ALGORITHM_VERSION


def test_same_job_reupload_repoints_the_application_and_rescores(db_session, user):
    """W2.13: a newer CV of the same person for the same Job means one
    Application, a new cv_id and a new score - never a second row."""
    candidate, old_cv = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com", file_name="old.pdf")
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    add_job_skill(db_session, job, "SQL", required=True)
    db_session.commit()

    before = attach(db_session, job, old_cv, user)
    assert before.match.overall_score == 0.0

    new_cv = make_cv(db_session, candidate, user, file_name="new.pdf")
    add_cv_skill(db_session, new_cv, "Python")
    add_cv_skill(db_session, new_cv, "SQL")
    db_session.commit()

    after = attach(db_session, job, new_cv, user)

    assert after.status == "updated"
    assert after.application_id == before.application_id
    assert after.cv_id == new_cv.id
    assert after.match.overall_score == 100.0
    assert db_session.query(Application).count() == 1
    assert db_session.query(MatchResult).count() == 1
    assert db_session.query(MatchResult).one().overall_score == 100.0


def test_isolation_between_jobs(db_session, user):
    """W2.13: score Application A; upload a different CV for the same
    person and attach it to Job B; A's stored and recomputed score must not
    move (ADR 0001)."""
    candidate, cv_a = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com", file_name="a.pdf")
    add_cv_skill(db_session, cv_a, "Python")
    job_a = make_job(db_session, user, "Job A", required_experience_years=None, required_education=None)
    add_job_skill(db_session, job_a, "Python", required=True)
    add_job_skill(db_session, job_a, "SQL", required=True)
    job_b = make_job(db_session, user, "Job B", required_experience_years=None, required_education=None)
    add_job_skill(db_session, job_b, "SQL", required=True)
    db_session.commit()

    application_a = attach(db_session, job_a, cv_a, user)
    assert application_a.match.overall_score == 50.0

    # A much stronger CV for the same person, attached to Job B only.
    cv_b = make_cv(db_session, candidate, user, file_name="b.pdf")
    add_cv_skill(db_session, cv_b, "Python")
    add_cv_skill(db_session, cv_b, "SQL")
    db_session.commit()
    application_b = attach(db_session, job_b, cv_b, user)
    assert application_b.match.overall_score == 100.0
    assert application_b.application_id != application_a.application_id

    stored_a = (
        db_session.query(MatchResult)
        .filter(MatchResult.application_id == application_a.application_id)
        .one()
    )
    assert stored_a.overall_score == 50.0

    recomputed_a = get_application_match(db_session, application_a.application_id, today=TODAY)
    assert recomputed_a.cv_id == cv_a.id
    assert recomputed_a.overall_score == 50.0

    ranking_a = get_job_ranking(db_session, job_a.id, today=TODAY)
    assert [row.overall_score for row in ranking_a.applications] == [50.0]
    ranking_b = get_job_ranking(db_session, job_b.id, today=TODAY)
    assert [row.application_id for row in ranking_b.applications] == [application_b.application_id]


def test_batch_with_two_cvs_of_one_candidate_keeps_the_later_one(db_session, user):
    candidate, first_cv = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    second_cv = make_cv(db_session, candidate, user, file_name="second.pdf")
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    results = create_or_update_applications(
        db_session, job.id, [first_cv.id, second_cv.id], user, today=TODAY
    )

    assert len(results) == 1
    assert results[0].cv_id == second_cv.id
    assert db_session.query(Application).count() == 1


def test_attach_rolls_back_everything_on_failure(db_session, user, monkeypatch):
    _, cv = make_candidate_with_cv(db_session, user)
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    def _boom(*args, **kwargs):
        raise matching.SQLAlchemyError("boom")

    monkeypatch.setattr(matching, "_store_outcome", _boom)

    with pytest.raises(Exception):
        create_or_update_applications(db_session, job.id, [cv.id], user)

    assert db_session.query(Application).count() == 0
    assert db_session.query(MatchResult).count() == 0


# --------------------------------------------------------------------------
# "Add this Candidate to a Job"
# --------------------------------------------------------------------------


def test_add_candidate_defaults_to_newest_cv(db_session, user):
    candidate, old_cv = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    old_cv.uploaded_at = datetime(2026, 1, 1)
    new_cv = make_cv(db_session, candidate, user, file_name="new.pdf")
    new_cv.uploaded_at = datetime(2026, 2, 1)
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    result = create_application_for_candidate(db_session, candidate.id, job.id, user, today=TODAY)

    assert result.cv_id == new_cv.id


def test_add_candidate_refuses_a_cv_of_another_candidate(db_session, user):
    _, own_cv = make_candidate_with_cv(db_session, user, "Jane", email="jane@x.com")
    other = make_candidate(db_session, "Other", email="other@x.com")
    other_cv = make_cv(db_session, other, user, file_name="other.pdf")
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    with pytest.raises(CvOwnershipError):
        create_application_for_candidate(db_session, other.id, job.id, user, cv_id=own_cv.id)

    result = create_application_for_candidate(db_session, other.id, job.id, user, cv_id=other_cv.id)
    assert result.candidate_id == other.id


# --------------------------------------------------------------------------
# Ranking
# --------------------------------------------------------------------------


def _make_ranking_fixture(db, user):
    job = make_job(db, user, "Backend Developer", required_experience_years=None, required_education=None)
    add_job_skill(db, job, "Python", required=True)
    add_job_skill(db, job, "SQL", required=True)

    _, high = make_candidate_with_cv(db, user, "High Scorer")
    add_cv_skill(db, high, "Python")
    add_cv_skill(db, high, "SQL")

    _, mid = make_candidate_with_cv(db, user, "Mid Scorer")
    add_cv_skill(db, mid, "Python")

    _, low = make_candidate_with_cv(db, user, "Low Scorer")

    _, tie_a = make_candidate_with_cv(db, user, "Tie A")
    _, tie_b = make_candidate_with_cv(db, user, "Tie B")
    # tie_a's Application id < tie_b's by insertion order; both get 0 matches -> tie.

    db.commit()
    results = create_or_update_applications(
        db, job.id, [high.id, mid.id, low.id, tie_a.id, tie_b.id], user, today=TODAY
    )
    by_cv = {result.cv_id: result for result in results}
    return job, by_cv[high.id], by_cv[mid.id], by_cv[low.id], by_cv[tie_a.id], by_cv[tie_b.id]


def test_ranking_orders_highest_first(db_session, user):
    job, high, mid, low, *_ = _make_ranking_fixture(db_session, user)

    result = get_job_ranking(db_session, job.id, today=TODAY, limit=50)

    scores = [a.overall_score for a in result.applications]
    assert scores == sorted(scores, reverse=True)
    assert result.applications[0].application_id == high.application_id
    assert result.applications[0].candidate_id == high.candidate_id
    assert result.applications[0].cv_id == high.cv_id


def test_ranking_tie_break_by_application_id_ascending(db_session, user):
    job, high, mid, low, tie_a, tie_b = _make_ranking_fixture(db_session, user)

    result = get_job_ranking(db_session, job.id, today=TODAY, limit=50)

    tied_ids = [
        a.application_id
        for a in result.applications
        if a.application_id in (tie_a.application_id, tie_b.application_id)
    ]
    assert tied_ids == sorted(tied_ids)


def test_ranking_returns_same_scores_as_individual_match(db_session, user):
    job, high, *_ = _make_ranking_fixture(db_session, user)

    individual = get_application_match(db_session, high.application_id, today=TODAY)
    ranking = get_job_ranking(db_session, job.id, today=TODAY, limit=50)

    ranked_high = next(a for a in ranking.applications if a.application_id == high.application_id)
    assert ranked_high.overall_score == individual.overall_score
    assert individual.skill_score == pytest.approx(100.0)


def test_ranking_pagination_preserves_global_rank(db_session, user):
    job, *_ = _make_ranking_fixture(db_session, user)

    full = get_job_ranking(db_session, job.id, today=TODAY, limit=50)
    page2 = get_job_ranking(db_session, job.id, today=TODAY, limit=2, offset=2)

    assert page2.total_applications == full.total_applications
    assert page2.returned_applications == 2
    assert [a.rank for a in page2.applications] == [3, 4]
    assert [a.application_id for a in page2.applications] == [
        a.application_id for a in full.applications[2:4]
    ]


def test_ranking_minimum_score_filters_after_scoring_before_pagination(db_session, user):
    job, *_ = _make_ranking_fixture(db_session, user)

    result = get_job_ranking(db_session, job.id, today=TODAY, limit=50, minimum_score=50)

    assert all(a.overall_score >= 50 for a in result.applications)
    assert result.total_applications == len(result.applications)


def test_ranking_no_applications_returns_empty_list(db_session, user):
    job = make_job(db_session, user)
    add_job_skill(db_session, job, "Python", required=True)
    db_session.commit()

    result = get_job_ranking(db_session, job.id, today=TODAY)
    assert result.total_applications == 0
    assert result.applications == []


def test_ranking_only_lists_this_jobs_applications(db_session, user):
    """A Candidate with an Application to Job B never appears in Job A's
    ranking, whatever CVs exist."""
    job_a = make_job(db_session, user, "A")
    add_job_skill(db_session, job_a, "Python", required=True)
    job_b = make_job(db_session, user, "B")
    add_job_skill(db_session, job_b, "Python", required=True)
    _, cv_a = make_candidate_with_cv(db_session, user, "Only A")
    _, cv_b = make_candidate_with_cv(db_session, user, "Only B")
    _, cv_unattached = make_candidate_with_cv(db_session, user, "Nobody")
    db_session.commit()
    attach(db_session, job_a, cv_a, user)
    attach(db_session, job_b, cv_b, user)

    ranking = get_job_ranking(db_session, job_a.id, today=TODAY)

    assert [a.candidate_name for a in ranking.applications] == ["Only A"]
    assert cv_unattached.id not in {a.cv_id for a in ranking.applications}


def test_repeated_ranking_does_not_duplicate_rows(db_session, user):
    job, *_ = _make_ranking_fixture(db_session, user)

    get_job_ranking(db_session, job.id, today=TODAY, limit=50)
    count_after_first = db_session.query(MatchResult).count()
    get_job_ranking(db_session, job.id, today=TODAY, limit=50)
    count_after_second = db_session.query(MatchResult).count()

    assert count_after_first == count_after_second
    # All 5 Applications are scorable: the job has required skills, so the
    # "skills" criterion is available for everyone even at a 0% skill match.
    assert count_after_first == 5


def test_ranking_scores_applications_that_were_never_scored(db_session, user):
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    candidate, cv = make_candidate_with_cv(db_session, user)
    add_cv_skill(db_session, cv, "Python")
    application = make_application(db_session, candidate, job, cv, user)
    db_session.commit()
    assert db_session.query(MatchResult).count() == 0

    ranking = get_job_ranking(db_session, job.id, today=TODAY)

    assert ranking.applications[0].application_id == application.id
    assert ranking.applications[0].overall_score == 100.0
    assert db_session.query(MatchResult).count() == 1


def test_stale_algorithm_version_is_recomputed_on_read(db_session, user, monkeypatch):
    """A stored row carrying an older ALGORITHM_VERSION is rescored and
    re-stored the next time the ranking or the breakdown is read."""
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    _, cv = make_candidate_with_cv(db_session, user)
    add_cv_skill(db_session, cv, "Python")
    db_session.commit()
    result = attach(db_session, job, cv, user)

    row = db_session.query(MatchResult).one()
    # Pretend the row was scored by an older formula that produced 12%.
    row.overall_score = 12.0
    row.algorithm_version = matching.ALGORITHM_VERSION - 1
    db_session.commit()

    ranking = get_job_ranking(db_session, job.id, today=TODAY)
    assert ranking.applications[0].overall_score == 100.0

    db_session.expire_all()
    row = db_session.query(MatchResult).one()
    assert row.algorithm_version == matching.ALGORITHM_VERSION
    assert row.overall_score == 100.0

    # A current row is read as stored, not recomputed.
    row.overall_score = 12.0
    db_session.commit()
    ranking = get_job_ranking(db_session, job.id, today=TODAY)
    assert ranking.applications[0].overall_score == 12.0

    # The breakdown endpoint re-stores a stale row too.
    row.algorithm_version = matching.ALGORITHM_VERSION - 1
    db_session.commit()
    detail = get_application_match(db_session, result.application_id, today=TODAY)
    assert detail.overall_score == 100.0
    db_session.expire_all()
    assert db_session.query(MatchResult).one().overall_score == 100.0


def _count_queries(db_session, callback):
    queries = {"count": 0}

    def _count(*args, **kwargs):
        queries["count"] += 1

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", _count)
    try:
        callback()
    finally:
        event.remove(engine, "before_cursor_execute", _count)
    return queries["count"]


def test_ranking_query_count_does_not_grow_with_application_count(db_session, user):
    job = make_job(db_session, user, required_experience_years=None, required_education=None)
    add_job_skill(db_session, job, "Python", required=True)
    cvs = []
    for i in range(10):
        _, cv = make_candidate_with_cv(db_session, user, f"Candidate {i}")
        add_cv_skill(db_session, cv, "Python")
        cvs.append(cv)
    db_session.commit()
    create_or_update_applications(db_session, job.id, [cv.id for cv in cvs], user, today=TODAY)

    # Stored path: job + job skills, applications, stored results.
    stored_reads = _count_queries(
        db_session, lambda: get_job_ranking(db_session, job.id, today=TODAY)
    )
    assert stored_reads <= 5

    # Recompute path (every row stale): plus the CVs and one query per
    # profile table, plus the writes - still bounded.
    for row in db_session.query(MatchResult).all():
        row.algorithm_version = matching.ALGORITHM_VERSION - 1
    db_session.commit()
    recompute_reads = _count_queries(
        db_session, lambda: get_job_ranking(db_session, job.id, today=TODAY)
    )
    assert recompute_reads <= 12 + 10  # bounded reads + one UPDATE per row
