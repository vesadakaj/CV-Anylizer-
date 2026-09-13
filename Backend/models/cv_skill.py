from sqlalchemy import Column, ForeignKey, Integer, String, Float

from database import Base


class CvSkill(Base):
    """A skill extracted from one CV. The table keeps its historical name."""

    __tablename__ = "CandidateSkills"

    id = Column(Integer, primary_key=True, index=True)

    cv_id = Column(
        Integer,
        ForeignKey("CVs.id"),
        nullable=False,
        index=True,
    )

    skill_id = Column(
        Integer,
        ForeignKey("Skills.id"),
        nullable=False
    )

    years_experience = Column(
        Float,
        nullable=True
    )

    proficiency_level = Column(
        String(50),
        nullable=True
    )
