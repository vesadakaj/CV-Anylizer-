from sqlalchemy import Column, ForeignKey, Integer, String

from database import Base


class CandidateLanguage(Base):
    __tablename__ = "CandidateLanguages"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("Candidates.id"),
        nullable=False
    )

    language_id = Column(
        Integer,
        ForeignKey("Languages.id"),
        nullable=False
    )

    level = Column(
        String(50),
        nullable=True
    )