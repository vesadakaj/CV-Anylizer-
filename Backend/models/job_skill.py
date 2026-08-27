from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer

from database import Base


class JobSkill(Base):
    __tablename__ = "JobSkills"

    id = Column(Integer, primary_key=True, index=True)

    job_id = Column(
        Integer,
        ForeignKey("Jobs.id"),
        nullable=False
    )

    skill_id = Column(
        Integer,
        ForeignKey("Skills.id"),
        nullable=False
    )

    is_required = Column(
        Boolean,
        nullable=False,
        default=True
    )

    weight = Column(
        Float,
        nullable=True
    )