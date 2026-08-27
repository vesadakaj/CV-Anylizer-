from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from database import Base


class Candidate(Base):
    __tablename__ = "Candidates"

    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(200), nullable=True)

    created_at = Column(
        DateTime,
        server_default=func.now()
    )