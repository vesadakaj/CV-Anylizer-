from sqlalchemy import Column, DateTime, Float, Integer, String, UnicodeText
from sqlalchemy.sql import func

from database import Base


class Job(Base):
    __tablename__ = "Jobs"

    id = Column(Integer, primary_key=True, index=True)

    title = Column(
        String(255),
        nullable=False
    )

    company_name = Column(
        String(255),
        nullable=True
    )

    description = Column(
        UnicodeText,
        nullable=False
    )

    required_education = Column(
        String(255),
        nullable=True
    )

    required_experience_years = Column(
        Float,
        nullable=True
    )

    experience_description = Column(
        UnicodeText,
        nullable=True
    )

    created_at = Column(
        DateTime,
        server_default=func.now()
    )