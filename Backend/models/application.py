from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, UniqueConstraint
from sqlalchemy.sql import func

from database import Base


class Application(Base):
    """One Candidate being considered for one Job, scored from exactly one
    of that Candidate's CVs. At most one per (candidate, job): a newer CV
    for the same Job repoints `cv_id` instead of adding a row (ADR 0001).
    """

    __tablename__ = "Applications"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(Integer, ForeignKey("Candidates.id"), nullable=False)

    job_id = Column(Integer, ForeignKey("Jobs.id"), nullable=False)

    cv_id = Column(Integer, ForeignKey("CVs.id"), nullable=False)

    created_by_user_id = Column(Integer, ForeignKey("Users.id"), nullable=False)

    created_at = Column(DateTime, server_default=func.now())

    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("candidate_id", "job_id", name="uq_Applications_candidate_job"),
        Index("ix_Applications_job_id", "job_id"),
    )
