from sqlalchemy import Column, ForeignKey, Integer, String

from database import Base


class CvLanguage(Base):
    """A language extracted from one CV. The table keeps its historical name."""

    __tablename__ = "CandidateLanguages"

    id = Column(Integer, primary_key=True, index=True)

    cv_id = Column(
        Integer,
        ForeignKey("CVs.id"),
        nullable=False,
        index=True,
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
