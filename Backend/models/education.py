from sqlalchemy import Column, Date, ForeignKey, Integer, String, UnicodeText

from database import Base


class Education(Base):
    __tablename__ = "Education"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("Candidates.id"),
        nullable=False
    )

    institution = Column(
        String(255),
        nullable=False
    )

    degree = Column(
        String(200),
        nullable=True
    )

    field_of_study = Column(
        String(200),
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

    description = Column(
        UnicodeText,
        nullable=True
    )