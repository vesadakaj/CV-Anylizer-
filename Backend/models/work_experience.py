from sqlalchemy import Column, Date, ForeignKey, Integer, String, UnicodeText, Boolean

from database import Base


class WorkExperience(Base):
    __tablename__ = "WorkExperience"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("Candidates.id"),
        nullable=False
    )

    company_name = Column(
        String(255),
        nullable=False
    )

    position_title = Column(
        String(255),
        nullable=False
    )

    description = Column(
        UnicodeText,
        nullable=True
    )

    start_date = Column(
        Date,
        nullable=True
    )

    end_date = Column(
        Date,
        nullable=True
    )

    is_current = Column(
        Boolean,
        nullable=False,
        default=False
    )