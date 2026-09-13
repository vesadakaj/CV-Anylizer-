from sqlalchemy import Boolean, Column, DateTime, Integer, String, text
from sqlalchemy.sql import func

from database import Base

ROLE_ADMIN = "admin"
ROLE_MEMBER = "member"
ROLES = (ROLE_ADMIN, ROLE_MEMBER)


class User(Base):
    __tablename__ = "Users"

    id = Column(Integer, primary_key=True, index=True)

    # Stored lower-cased and trimmed (see services.auth.normalize_email) so
    # the unique index is the only deduplication rule.
    email = Column(String(255), nullable=False, unique=True, index=True)

    full_name = Column(String(200), nullable=False)

    password_hash = Column(String(255), nullable=False)

    # "admin" | "member". Admins additionally manage Users; nothing else
    # differs (CONTEXT.md, "Access").
    role = Column(String(20), nullable=False, default=ROLE_MEMBER)

    is_active = Column(
        Boolean, nullable=False, default=True, server_default=text("1")
    )

    # Set when an Admin creates the account or resets its password; the
    # frontend forces a password change before anything else is reachable.
    must_change_password = Column(
        Boolean, nullable=False, default=False, server_default=text("0")
    )

    created_at = Column(DateTime, server_default=func.now())

    last_login_at = Column(DateTime, nullable=True)

    @property
    def is_admin(self) -> bool:
        return self.role == ROLE_ADMIN
