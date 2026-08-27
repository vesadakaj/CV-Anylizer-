from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, UnicodeText
from sqlalchemy.sql import func

from database import Base


class CV(Base):
    __tablename__ = "CVs"

    id = Column(Integer, primary_key=True, index=True)

    candidate_id = Column(
        Integer,
        ForeignKey("Candidates.id"),
        nullable=False
    )

    file_name = Column(
        String(255),
        nullable=False
    )

    file_type = Column(
        String(20),
        nullable=False
    )

    file_path = Column(
        String(500),
        nullable=True
    )

    extracted_text = Column(
        UnicodeText,
        nullable=True
    )

    uploaded_at = Column(
        DateTime,
        server_default=func.now()
    )