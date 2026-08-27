from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, UnicodeText
from sqlalchemy.sql import func

from database import Base


class MatchResult(Base):
    __tablename__ = "MatchResults"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("Candidates.id"),
        nullable=False
    )

    job_id = Column(
        Integer,
        ForeignKey("Jobs.id"),
        nullable=False
    )

    overall_score = Column(
        Float,
        nullable=False
    )

    skill_score = Column(
        Float,
        nullable=True
    )

    experience_score = Column(
        Float,
        nullable=True
    )

    education_score = Column(
        Float,
        nullable=True
    )

    language_score = Column(
        Float,
        nullable=True
    )

    explanation = Column(
        UnicodeText,
        nullable=True
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )