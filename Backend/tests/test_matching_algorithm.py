"""Unit tests for the pure, DB-free scoring functions in services.matching.

These never touch a database - they test the deterministic algorithm itself.
"""

from datetime import date

from services.matching import (
    combine_scores,
    compute_education_score,
    compute_experience_score,
    compute_skill_score,
    compute_total_experience_years,
    normalize_education_level,
)


# --------------------------------------------------------------------------
# Education level normalization
# --------------------------------------------------------------------------


def test_normalize_education_level_variants():
    assert normalize_education_level("Bachelor's degree in CS") == 1
    assert normalize_education_level("Bachelor of Science") == 1
    assert normalize_education_level("BSc Computer Science") == 1
    assert normalize_education_level("Master's degree") == 2
    assert normalize_education_level("MSc") == 2
    assert normalize_education_level("PhD") == 3
    assert normalize_education_level("Doctorate in Physics") == 3
    assert normalize_education_level("High School Diploma") == 0


def test_normalize_education_level_unknown_returns_none():
    assert normalize_education_level("Certificate in Welding") is None
    assert normalize_education_level(None) is None
    assert normalize_education_level("") is None


# --------------------------------------------------------------------------
# Experience duration
# --------------------------------------------------------------------------


def test_experience_ignores_missing_start_date():
    rows = [(None, date(2020, 1, 1), False)]
    assert compute_total_experience_years(rows, date(2024, 1, 1)) == 0.0


def test_experience_ignores_missing_end_date_when_not_current():
    rows = [(date(2020, 1, 1), None, False)]
    assert compute_total_experience_years(rows, date(2024, 1, 1)) == 0.0


def test_experience_uses_today_for_current_job():
    rows = [(date(2020, 1, 1), None, True)]
    years = compute_total_experience_years(rows, date(2024, 1, 1))
    assert 3.9 < years < 4.1


def test_experience_ignores_invalid_range():
    rows = [(date(2024, 1, 1), date(2020, 1, 1), False)]
    assert compute_total_experience_years(rows, date(2025, 1, 1)) == 0.0


def test_experience_never_negative():
    rows = [(date(2025, 1, 1), date(2020, 1, 1), False), (None, None, False)]
    assert compute_total_experience_years(rows, date(2025, 1, 1)) >= 0.0


def test_overlapping_periods_are_merged_not_double_counted():
    # Two concurrent jobs spanning 2020-01-01 .. 2022-01-01 combined should
    # total ~2 years, not the sum of each period.
    rows = [
        (date(2020, 1, 1), date(2021, 1, 1), False),
        (date(2020, 6, 1), date(2022, 1, 1), False),
    ]
    years = compute_total_experience_years(rows, date(2025, 1, 1))
    assert 1.9 < years < 2.1


def test_non_overlapping_periods_are_summed():
    rows = [
        (date(2018, 1, 1), date(2019, 1, 1), False),  # 1 year
        (date(2020, 1, 1), date(2021, 1, 1), False),  # 1 year
    ]
    years = compute_total_experience_years(rows, date(2025, 1, 1))
    assert 1.9 < years < 2.1


# --------------------------------------------------------------------------
# Experience score
# --------------------------------------------------------------------------


def test_experience_score_none_when_no_requirement():
    assert compute_experience_score(5.0, None) is None


def test_experience_score_exact_match():
    assert compute_experience_score(3.0, 3.0) == 1.0


def test_experience_score_exceeds_requirement_capped_at_one():
    assert compute_experience_score(10.0, 3.0) == 1.0


def test_experience_score_partial():
    assert compute_experience_score(1.5, 3.0) == 0.5


# --------------------------------------------------------------------------
# Skill score
# --------------------------------------------------------------------------


def test_skill_score_unavailable_when_no_required_skills():
    result = compute_skill_score({1, 2}, set(), {})
    assert result.available is False
    assert result.score is None


def test_skill_score_full_match():
    names = {1: "Python", 2: "SQL"}
    result = compute_skill_score({1, 2, 3}, {1, 2}, names)
    assert result.score == 1.0
    assert result.matched_skills == ["Python", "SQL"]
    assert result.missing_required_skills == []


def test_skill_score_partial_match():
    names = {1: "Python", 2: "SQL", 3: "Docker"}
    result = compute_skill_score({1}, {1, 2, 3}, names)
    assert result.score == 1 / 3
    assert result.matched_skills == ["Python"]
    assert result.missing_required_skills == ["Docker", "SQL"]


def test_skill_score_zero_match():
    names = {1: "Python", 2: "SQL"}
    result = compute_skill_score({99}, {1, 2}, names)
    assert result.score == 0.0
    assert result.matched_skills == []
    assert sorted(result.missing_required_skills) == ["Python", "SQL"]


def test_skill_score_deterministic_sorted_order():
    names = {1: "Zebra", 2: "Alpha", 3: "Mango"}
    result = compute_skill_score({1, 2, 3}, {1, 2, 3}, names)
    assert result.matched_skills == ["Alpha", "Mango", "Zebra"]


def test_duplicate_skill_ids_do_not_change_result():
    # Sets absorb duplicates - passing the same id "twice" via a set is a
    # no-op, mirroring how CandidateSkill dedup happens upstream.
    names = {1: "Python"}
    a = compute_skill_score({1, 1}, {1}, names)  # duplicate literal collapses
    b = compute_skill_score({1}, {1}, names)
    assert a.score == b.score == 1.0


# --------------------------------------------------------------------------
# Education score
# --------------------------------------------------------------------------


def test_education_meets_requirement():
    result = compute_education_score([("Bachelor's", "CS")], required_level=1)
    assert result.score == 1.0
    assert result.available is True


def test_education_exceeds_requirement():
    result = compute_education_score([("Master's", "CS")], required_level=1)
    assert result.score == 1.0


def test_education_one_level_below():
    result = compute_education_score([("High School", None)], required_level=1)
    assert result.score == 0.5


def test_education_two_levels_below():
    result = compute_education_score([("High School", None)], required_level=3)
    assert result.score == 0.0


def test_education_unknown_candidate_level_with_valid_requirement():
    result = compute_education_score([("Certificate in Welding", None)], required_level=1)
    assert result.available is True
    assert result.score == 0.0
    assert result.candidate_level_name is None


def test_education_unknown_job_requirement_excluded():
    result = compute_education_score([("Bachelor's", "CS")], required_level=None)
    assert result.available is False
    assert result.score is None
    assert result.reason is not None


def test_education_no_candidate_records_at_all():
    result = compute_education_score([], required_level=2)
    assert result.available is True
    assert result.score == 0.0
    assert result.candidate_level_name is None


# --------------------------------------------------------------------------
# Dynamic weighting / combine_scores
# --------------------------------------------------------------------------


def _score(available, value):
    class _S:
        pass

    s = _S()
    s.available = available
    s.score = value
    return s


def test_combine_all_three_available():
    skill = _score(True, 0.5)
    experience = _score(True, 1.0)
    education = _score(True, 1.0)
    overall, criteria, weights = combine_scores(skill, experience, education)
    # 0.5*50 + 1.0*30 + 1.0*20 = 75
    assert overall == 75.0
    assert criteria == ["skills", "experience", "education"]
    assert weights == {"skills": 50.0, "experience": 30.0, "education": 20.0}


def test_combine_education_unavailable_renormalizes_weights():
    skill = _score(True, 1.0)
    experience = _score(True, 1.0)
    education = _score(False, None)
    overall, criteria, weights = combine_scores(skill, experience, education)
    assert criteria == ["skills", "experience"]
    assert weights["skills"] == 62.5
    assert weights["experience"] == 37.5
    assert overall == 100.0


def test_combine_experience_unavailable_renormalizes_weights():
    skill = _score(True, 0.5)
    experience = _score(False, None)
    education = _score(True, 1.0)
    overall, criteria, weights = combine_scores(skill, experience, education)
    assert criteria == ["skills", "education"]
    assert weights["skills"] == round(50 / 70 * 100, 2)
    assert weights["education"] == round(20 / 70 * 100, 2)


def test_combine_only_skills_available():
    skill = _score(True, 0.4)
    experience = _score(False, None)
    education = _score(False, None)
    overall, criteria, weights = combine_scores(skill, experience, education)
    assert criteria == ["skills"]
    assert weights == {"skills": 100.0}
    assert overall == 40.0


def test_combine_no_criteria_available_returns_none():
    skill = _score(False, None)
    experience = _score(False, None)
    education = _score(False, None)
    overall, criteria, weights = combine_scores(skill, experience, education)
    assert overall is None
    assert criteria == []
    assert weights == {}
