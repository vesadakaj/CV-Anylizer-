from sqlalchemy import Column, Date, DateTime, Float, Integer, String, UnicodeText
from sqlalchemy.sql import func

from database import Base


class Job(Base):
    __tablename__ = "Jobs"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(
        String(255),
        nullable=False
    )

    company_name = Column(
        String(255),
        nullable=True
    )

    location = Column(
        String(255),
        nullable=True
    )

    department = Column(
        String(255),
        nullable=True
    )

    employment_type = Column(
        String(100),
        nullable=True
    )

    # Nullable: only present for jobs analyzed from pasted text. Manually
    # created jobs (structured form, no free text) have no description.
    description = Column(
        UnicodeText,
        nullable=True
    )

    # JSON-encoded list[str]. Informational only - never read by the
    # deterministic matching service (see services/matching.py).
    responsibilities = Column(
        UnicodeText,
        nullable=True
    )

    # JSON-encoded list[str] of qualification statements that don't map to a
    # normalized Skill/JobSkill row. Informational only, same as above.
    required_qualifications = Column(
        UnicodeText,
        nullable=True
    )

    # JSON-encoded list[str]. Must never be treated as mandatory matching
    # criteria.
    preferred_qualifications = Column(
        UnicodeText,
        nullable=True
    )

    required_education = Column(
        String(255),
        nullable=True
    )

    required_experience_years = Column(
        Float,
        nullable=True
    )

    experience_description = Column(
        UnicodeText,
        nullable=True
    )

    # Business-meaningful "posted on" date, distinct from `created_at` (the
    # row-insertion audit timestamp). Only set for manually created jobs.
    posting_date = Column(
        Date,
        nullable=True
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )