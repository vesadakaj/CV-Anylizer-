"""Admin-only user management. Users are never deleted, only deactivated."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from database import get_db
from models.user import ROLES, ROLE_ADMIN, User
from routers.auth import UserPublic
from routers.dependencies import require_admin
from services.auth import (
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    hash_password,
    normalize_email,
)

router = APIRouter(dependencies=[Depends(require_admin)])


def _validate_role(value: str) -> str:
    if value not in ROLES:
        raise ValueError(f"role must be one of: {', '.join(ROLES)}")
    return value


def _validate_email(value: str) -> str:
    normalized = normalize_email(value)
    local, sep, domain = normalized.partition("@")
    if not sep or not local or "." not in domain or domain.startswith("."):
        raise ValueError("email must be a valid address")
    return normalized


class CreateUserRequest(BaseModel):
    email: str
    full_name: str = Field(min_length=1, max_length=200)
    role: str
    temporary_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)

    _role = field_validator("role")(_validate_role)
    _email = field_validator("email")(_validate_email)
    _name = field_validator("full_name")(lambda value: value.strip())


class UpdateUserRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def _role(cls, value):
        return None if value is None else _validate_role(value)

    @field_validator("full_name")
    @classmethod
    def _name(cls, value):
        return None if value is None else value.strip()


class ResetPasswordRequest(BaseModel):
    temporary_password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)


def _load_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _other_active_admins(db: Session, user: User) -> int:
    return (
        db.query(User)
        .filter(User.role == ROLE_ADMIN, User.is_active.is_(True), User.id != user.id)
        .count()
    )


@router.get("", response_model=list[UserPublic])
def list_users(db: Session = Depends(get_db)):
    return db.query(User).order_by(User.full_name, User.id).all()


@router.post("", response_model=UserPublic, status_code=201)
def create_user(payload: CreateUserRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).one_or_none() is not None:
        raise HTTPException(status_code=409, detail="A user with this email already exists.")

    user = User(
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.temporary_password),
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = _load_user(db, user_id)

    deactivating = payload.is_active is False and user.is_active
    demoting = payload.role is not None and payload.role != ROLE_ADMIN and user.is_admin

    if (deactivating or demoting) and user.id == admin.id:
        raise HTTPException(
            status_code=409,
            detail="You cannot deactivate or demote your own account.",
        )
    if (deactivating or demoting) and user.is_admin and user.is_active:
        if _other_active_admins(db, user) == 0:
            raise HTTPException(
                status_code=409,
                detail="This is the last active admin. Promote another user first.",
            )

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=UserPublic)
def reset_password(
    user_id: int,
    payload: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    user = _load_user(db, user_id)
    user.password_hash = hash_password(payload.temporary_password)
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    return user
