from sqlalchemy import Column, ForeignKey, Integer, String, UnicodeText

from database import Base


class Project(Base):
    __tablename__ = "Projects"

    id = Column(Integer, primary_key=True, index=True)

    cv_id = Column(
        Integer,
        ForeignKey("CVs.id"),
        nullable=False,
        index=True,
    )

    name = Column(
        String(255),
        nullable=False
    )

    description = Column(
        UnicodeText,
        nullable=True
    )

    technologies = Column(
        String(500),
        nullable=True
    )

    project_url = Column(
        String(500),
        nullable=True
    )
