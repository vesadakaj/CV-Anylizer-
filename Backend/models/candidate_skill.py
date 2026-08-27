from sqlalchemy import Column, ForeignKey, Integer, String, Float

from database import Base


class CandidateSkill(Base):
    __tablename__ = "CandidateSkills"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("Candidates.id"),
        nullable=False
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