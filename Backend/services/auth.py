"""Password hashing and access-token issue/verify (ADR 0003).

Passwords are hashed with the ``bcrypt`` package directly. Tokens are HS256
JWTs signed with ``JWT_SECRET``, valid for 12 hours, with no refresh: an
expired or rejected token sends the user back to the login page.
"""

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

TOKEN_LIFETIME = timedelta(hours=12)
JWT_ALGORITHM = "HS256"
MIN_PASSWORD_LENGTH = 8
# bcrypt ignores (newer versions reject) anything past 72 bytes.
MAX_PASSWORD_LENGTH = 72


class AuthConfigurationError(RuntimeError):
    pass


class TokenError(Exception):
    """The one error type for expired, malformed and wrongly signed tokens."""


def jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret or not secret.strip():
        raise AuthConfigurationError(
            "JWT_SECRET is not configured. Set a long random value in the "
            "backend .env file."
        )
    return secret


def normalize_email(email: str) -> str:
    """The stored form of an email address: trimmed and lower-cased."""
    return email.strip().lower()


# --- passwords ---------------------------------------------------------------


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:
        # An unreadable hash (or an over-long password) is simply a mismatch.
        return False


# --- tokens ------------------------------------------------------------------


def create_access_token(user, *, now: datetime | None = None) -> str:
    """Issue a token for ``user``. ``sub`` is the user id (as a string, which
    is what the JWT spec and PyJWT require)."""
    issued_at = now or datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "iat": issued_at,
        "exp": issued_at + TOKEN_LIFETIME,
    }
    return jwt.encode(payload, jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> int:
    """Return the user id carried by ``token`` or raise ``TokenError``."""
    try:
        payload = jwt.decode(token, jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid or expired token.") from exc

    subject = payload.get("sub")
    try:
        return int(subject)
    except (TypeError, ValueError) as exc:
        raise TokenError("Invalid or expired token.") from exc
