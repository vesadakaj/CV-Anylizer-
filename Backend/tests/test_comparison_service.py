"""Comparing two CVs: the attribution arithmetic, the diff, and the route.

The load-bearing property is in
`test_criterion_contributions_sum_to_the_overall_gap`: what the comparison
says each criterion is worth adds up to the difference between the two
scores, so "why one is better" is arithmetic, not narrative.
"""

from datetime import date

import pytest

from services.comparison import CvNotFoundError, SameCvError, compare_cvs
from services.matching import JobNotFoundError, get_job_ranking
from tests.factories import (
    add_cv_skill,
    add_education,
    add_experience,
    add_job_skill,
    make_application,
    make_candidate_with_cv,
    make_job,
)

TODAY = date(2026, 1, 1)


def build_pair(db, user, *, job_required_years=4.0, job_education="Master's degree"):
    """A Job with all three criteria, and two CVs that differ on each of
    them: Ada is stronger on skills and experience, Grace on education."""
    job = make_job(
        db,
        user,
        title="Senior Data Engineer",
        required_experience_years=job_required_years,
        required_education=job_education,
    )
    for name in ("Python", "SQL", "Airflow", "Spark"):
        add_job_skill(db, job, name, required=True)
    add_job_skill(db, job, "Kubernetes", required=False)
    add_job_skill(db, job, "Terraform", required=False)

    ada, ada_cv = make_candidate_with_cv(db, user, name="Ada Lovelace", email="ada@example.com")
    for name in ("Python", "SQL", "Airflow", "Rust"):
        add_cv_skill(db, ada_cv, name)
    add_cv_skill(db, ada_cv, "Kubernetes")
    add_experience(db, ada_cv, date(2018, 1, 1), date(2026, 1, 1))
    add_education(db, ada_cv, "BSc Computer Science", field_of_study="Computer Science")

    grace, grace_cv = make_candidate_with_cv(
        db, user, name="Grace Hopper", email="grace@example.com"
    )
    for name in ("Python", "Rust"):
        add_cv_skill(db, grace_cv, name)
    add_experience(db, grace_cv, date(2024, 1, 1), date(2026, 1, 1))
    add_education(db, grace_cv, "PhD Mathematics", field_of_study="Mathematics")

    db.commit()
    return job, (ada, ada_cv), (grace, grace_cv)


# --- attribution -----------------------------------------------------------


def test_criterion_contributions_sum_to_the_overall_gap(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    assert result.mode == "job"
    assert result.winner == "a"
    total = sum(row.contribution_delta for row in result.criteria)
    # Rounding of the individual contributions, not a different formula.
    assert total == pytest.approx(result.score_delta, abs=0.05)
    assert result.score_delta == pytest.approx(
        result.a.overall_score - result.b.overall_score, abs=0.01
    )


def test_the_scores_are_the_ranking_s_own_scores(db_session, user, client):
    """A comparison never disagrees with the ranking it explains."""
    job, (ada, ada_cv), (grace, grace_cv) = build_pair(db_session, user)
    make_application(db_session, ada, job, ada_cv, user)
    make_application(db_session, grace, job, grace_cv, user)
    db_session.commit()

    ranking = get_job_ranking(db_session, job.id, today=TODAY)
    by_cv = {row.cv_id: row.overall_score for row in ranking.applications}

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    assert result.a.overall_score == by_cv[ada_cv.id]
    assert result.b.overall_score == by_cv[grace_cv.id]
    # The Applications are linked so the UI can get back to the ranking rows.
    assert result.a.application_id is not None
    assert result.b.application_id is not None


def test_criteria_are_ordered_by_how_much_gap_they_explain(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    contributions = [abs(row.contribution_delta) for row in result.criteria]
    assert contributions == sorted(contributions, reverse=True)
    assert result.criteria[0].criterion == "skills"
    assert result.criteria[0].winner == "a"
    # Education is the one criterion Grace wins, so it is signed towards B.
    education = next(row for row in result.criteria if row.criterion == "education")
    assert education.winner == "b"
    assert education.contribution_delta < 0


def test_each_side_carries_the_weight_the_job_implies(db_session, user):
    """Weights depend only on the Job, so both sides are weighted the same -
    which is what makes the contributions comparable at all."""
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    assert {row.criterion for row in result.criteria} == {
        "skills",
        "experience",
        "education",
    }
    assert sum(row.weight for row in result.criteria) == pytest.approx(100.0, abs=0.01)
    for row in result.criteria:
        assert row.contribution_delta == pytest.approx(
            row.score_delta * row.weight / 100, abs=0.01
        )


def test_a_job_with_one_criterion_puts_the_whole_gap_on_it(db_session, user):
    job = make_job(db_session, user, title="Python Role")
    add_job_skill(db_session, job, "Python", required=True)
    add_job_skill(db_session, job, "SQL", required=True)
    _, first = make_candidate_with_cv(db_session, user, name="First", email="first@example.com")
    add_cv_skill(db_session, first, "Python")
    add_cv_skill(db_session, first, "SQL")
    _, second = make_candidate_with_cv(db_session, user, name="Second", email="second@example.com")
    add_cv_skill(db_session, second, "Python")
    db_session.commit()

    result = compare_cvs(db_session, first.id, second.id, job_id=job.id, today=TODAY)

    assert [row.criterion for row in result.criteria] == ["skills"]
    assert result.criteria[0].weight == 100.0
    assert result.criteria[0].contribution_delta == pytest.approx(result.score_delta, abs=0.01)


# --- verdict ---------------------------------------------------------------


def test_equal_cvs_are_a_tie_not_a_winner(db_session, user):
    job = make_job(db_session, user, title="Python Role")
    add_job_skill(db_session, job, "Python", required=True)
    _, first = make_candidate_with_cv(db_session, user, name="First", email="first@example.com")
    add_cv_skill(db_session, first, "Python")
    _, second = make_candidate_with_cv(db_session, user, name="Second", email="second@example.com")
    add_cv_skill(db_session, second, "Python")
    db_session.commit()

    result = compare_cvs(db_session, first.id, second.id, job_id=job.id, today=TODAY)

    assert result.winner == "tie"
    assert result.margin == "tie"
    assert result.score_delta == 0
    assert "score the same" in result.summary


def test_an_unscorable_job_refuses_to_name_a_winner(db_session, user):
    """No usable requirement means no basis for "better" - the comparison
    says so instead of inventing one (CONTEXT.md, "Unscorable")."""
    job = make_job(db_session, user, title="Vague Role", required_education="something")
    _, first = make_candidate_with_cv(db_session, user, name="First", email="first@example.com")
    add_cv_skill(db_session, first, "Python")
    _, second = make_candidate_with_cv(db_session, user, name="Second", email="second@example.com")
    db_session.commit()

    result = compare_cvs(db_session, first.id, second.id, job_id=job.id, today=TODAY)

    assert result.ready_to_match is False
    assert result.winner is None
    assert result.score_delta is None
    assert result.a.status == "unscorable"
    assert result.criteria == []
    assert "no usable structured requirements" in result.summary
    # The factual diff survives: it needs no requirements.
    assert result.profile_differences


def test_the_margin_says_how_big_the_gap_is(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)
    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)
    assert result.margin == "decisive"
    assert "well ahead of" in result.summary


def test_swapping_the_sides_mirrors_the_verdict(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    forward = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)
    backward = compare_cvs(db_session, grace_cv.id, ada_cv.id, job_id=job.id, today=TODAY)

    assert backward.winner == "b"
    assert backward.score_delta == pytest.approx(-forward.score_delta, abs=0.01)
    assert backward.a.overall_score == forward.b.overall_score
    for row in backward.criteria:
        mirrored = next(f for f in forward.criteria if f.criterion == row.criterion)
        assert row.contribution_delta == pytest.approx(-mirrored.contribution_delta, abs=0.01)


# --- the diff --------------------------------------------------------------


def test_required_skills_are_split_into_both_only_one_and_neither(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    required = next(group for group in result.skill_groups if group.kind == "required")
    assert required.both == ["Python"]
    assert required.only_a == ["Airflow", "SQL"]
    assert required.only_b == []
    assert required.neither == ["Spark"]

    preferred = next(group for group in result.skill_groups if group.kind == "preferred")
    assert preferred.only_a == ["Kubernetes"]
    assert preferred.neither == ["Terraform"]

    # Skills the job never asked about are shown, never scored.
    other = next(group for group in result.skill_groups if group.kind == "other")
    assert other.both == ["Rust"]
    assert "Rust" not in result.a.matched_required_skills


def test_profile_differences_are_present_with_a_job_too(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    by_label = {row.label: row for row in result.profile_differences}
    assert by_label["Years of experience"].advantage == "a"
    assert by_label["Highest education"].a_value == "Bachelor"
    assert by_label["Highest education"].b_value == "PhD"
    assert by_label["Highest education"].advantage == "b"
    assert by_label["Skills listed"].a_value == "5"
    assert by_label["Skills in common"].a_value == "2"  # Python and Rust


def test_decisive_factors_name_the_criterion_the_leader_and_the_points(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)

    assert result.decisive_factors
    first = result.decisive_factors[0]
    assert first.startswith("Skills:")
    assert "Ada Lovelace" in first
    assert "points of the overall score" in first


# --- profile mode ----------------------------------------------------------


def test_without_a_job_nothing_is_scored_but_the_diff_still_holds(db_session, user):
    _, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, today=TODAY)

    assert result.mode == "profile"
    assert result.job_id is None
    assert result.winner is None
    assert result.a.overall_score is None
    assert result.a.status is None
    assert result.criteria == []
    # One group, holding every skill, since no job classified them.
    assert [group.kind for group in result.skill_groups] == ["other"]
    assert result.skill_groups[0].only_a == ["Airflow", "Kubernetes", "SQL"]
    assert result.a.experience_years == pytest.approx(8.0, abs=0.05)
    assert result.a.education_level == "Bachelor"
    assert "No job was chosen" in result.summary
    assert "Pick a job" in result.summary


def test_two_cvs_of_the_same_person_can_be_compared(db_session, user):
    """The obvious second use: did the newer CV actually help?"""
    job = make_job(db_session, user, title="Python Role", required_experience_years=2.0)
    add_job_skill(db_session, job, "Python", required=True)
    add_job_skill(db_session, job, "SQL", required=True)
    candidate, old_cv = make_candidate_with_cv(
        db_session, user, name="Same Person", email="same@example.com", file_name="old.pdf"
    )
    add_cv_skill(db_session, old_cv, "Python")
    add_experience(db_session, old_cv, date(2024, 1, 1), date(2026, 1, 1))

    from tests.factories import make_cv

    new_cv = make_cv(db_session, candidate, user, file_name="new.pdf")
    add_cv_skill(db_session, new_cv, "Python")
    add_cv_skill(db_session, new_cv, "SQL")
    add_experience(db_session, new_cv, date(2024, 1, 1), date(2026, 1, 1))
    db_session.commit()

    result = compare_cvs(db_session, new_cv.id, old_cv.id, job_id=job.id, today=TODAY)

    assert result.a.candidate_id == result.b.candidate_id
    assert result.a.file_name == "new.pdf"
    assert result.winner == "a"
    assert result.a.overall_score > result.b.overall_score
    # One name on both sides would make the prose unreadable, so the
    # document does the distinguishing.
    assert "Same Person (new.pdf)" in result.summary
    assert "Same Person (old.pdf)" in result.summary
    assert all("(new.pdf)" in factor for factor in result.decisive_factors)
    # A column heading has no room for that, so the short label is the file.
    assert (result.a.label, result.b.label) == ("new.pdf", "old.pdf")


def test_two_people_are_labelled_by_name(db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)
    result = compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=job.id, today=TODAY)
    assert (result.a.label, result.b.label) == ("Ada Lovelace", "Grace Hopper")


# --- errors ----------------------------------------------------------------


def test_a_cv_cannot_be_compared_with_itself(db_session, user):
    _, cv = make_candidate_with_cv(db_session, user, name="Solo", email="solo@example.com")
    db_session.commit()
    with pytest.raises(SameCvError):
        compare_cvs(db_session, cv.id, cv.id)


def test_missing_cv_and_missing_job_are_reported(db_session, user):
    _, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)
    with pytest.raises(CvNotFoundError):
        compare_cvs(db_session, ada_cv.id, 9999)
    with pytest.raises(JobNotFoundError):
        compare_cvs(db_session, ada_cv.id, grace_cv.id, job_id=9999)


# --- the route -------------------------------------------------------------


def test_the_endpoint_returns_the_comparison(client, db_session, user):
    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    response = client.get(
        f"/api/comparisons?cv_a={ada_cv.id}&cv_b={grace_cv.id}&job_id={job.id}"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == "job"
    assert body["job_title"] == "Senior Data Engineer"
    assert body["winner"] == "a"
    assert body["a"]["candidate_name"] == "Ada Lovelace"
    assert body["criteria"][0]["criterion"] == "skills"
    assert body["summary"]


def test_the_endpoint_works_without_a_job(client, db_session, user):
    _, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    response = client.get(f"/api/comparisons?cv_a={ada_cv.id}&cv_b={grace_cv.id}")

    assert response.status_code == 200
    assert response.json()["mode"] == "profile"


def test_the_endpoint_reports_bad_input(client, db_session, user):
    _, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    same = client.get(f"/api/comparisons?cv_a={ada_cv.id}&cv_b={ada_cv.id}")
    assert same.status_code == 400

    missing = client.get(f"/api/comparisons?cv_a={ada_cv.id}&cv_b=99999")
    assert missing.status_code == 404

    no_job = client.get(
        f"/api/comparisons?cv_a={ada_cv.id}&cv_b={grace_cv.id}&job_id=99999"
    )
    assert no_job.status_code == 404

    incomplete = client.get(f"/api/comparisons?cv_a={ada_cv.id}")
    assert incomplete.status_code == 422


def test_comparing_stores_nothing(client, db_session, user):
    """A Comparison is a read: it must not create Applications or Match
    Results for CVs that were only being looked at."""
    from models.application import Application
    from models.match_result import MatchResult

    job, (_, ada_cv), (_, grace_cv) = build_pair(db_session, user)

    response = client.get(
        f"/api/comparisons?cv_a={ada_cv.id}&cv_b={grace_cv.id}&job_id={job.id}"
    )

    assert response.status_code == 200
    assert db_session.query(Application).count() == 0
    assert db_session.query(MatchResult).count() == 0
