from sqlalchemy import Column, DateTime, Index, Integer, String, text
from sqlalchemy.sql import func

from database import Base


class Candidate(Base):
    """A person, identified by the normalised email extracted from their CVs.

    Only identity and contact details live here; the extracted Profile
    belongs to each CV (ADR 0001). `email_normalized` (trimmed, lower-cased)
    is the one deduplication key. A Candidate whose CV carried no email has
    it NULL, is Unlinkable, and is excluded from the unique index below so
    any number of such Candidates can coexist.
    """

    __tablename__ = "Candidates"

    id = Column(Integer, primary_key=True, index=True)

    full_name = Column(String(200), nullable=False)
    email = Column(String(200), nullable=True)
    email_normalized = Column(String(200), nullable=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(200), nullable=True)

    created_at = Column(
        DateTime,
        server_default=func.now()
    )

    __table_args__ = (
        Index(
            "ix_Candidates_email_normalized",
            "email_normalized",
            unique=True,
            mssql_where=text("email_normalized IS NOT NULL"),
            sqlite_where=text("email_normalized IS NOT NULL"),
        ),
    )

    @property
    def linkable(self) -> bool:
        """False when no email was extracted, so no later CV can ever be
        merged with this Candidate (CONTEXT.md, "Unlinkable")."""
        return self.email_normalized is not None
