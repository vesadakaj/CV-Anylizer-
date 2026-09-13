from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, UnicodeText
from sqlalchemy.sql import func

from database import Base


class MatchResult(Base):
    """The stored score of one Application (1:1). `algorithm_version` lets
    the ranking recompute rows scored by an older formula on read; an
    Unscorable Application has no row at all (CONTEXT.md, "Unscorable")."""

    __tablename__ = "MatchResults"

    id = Column(Integer, primary_key=True, index=True)

    application_id = Column(
        Integer,
        ForeignKey("Applications.id"),
        nullable=False,
        unique=True,
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

    algorithm_version = Column(
        Integer,
        nullable=False
    )

    scored_at = Column(
        DateTime,
        server_default=func.now()
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )
