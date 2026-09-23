"""Request-level auth dependencies shared by every router.

``get_current_user`` reloads the User on every request and rejects inactive
accounts, so deactivation takes effect immediately despite the stateless
token (ADR 0003).
"""

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from models.user import User
from services.auth import TokenError, decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

UNAUTHENTICATED = HTTPException(
    status_code=401,
    detail="Not authenticated.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise UNAUTHENTICATED

    try:
        user_id = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise UNAUTHENTICATED from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise UNAUTHENTICATED
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user
