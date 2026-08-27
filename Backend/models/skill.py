from sqlalchemy import Column, Integer, String

from database import Base


class Skill(Base):
    __tablename__ = "Skills"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String(150),
        nullable=False,
        unique=True
    )