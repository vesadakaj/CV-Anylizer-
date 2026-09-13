"""Create the first Admin account.

Interactive:
    python -m scripts.create_admin

Non-interactive (CI, provisioning scripts):
    python -m scripts.create_admin --email admin@example.com \
        --full-name "Jane Admin" --password-env ADMIN_PASSWORD

Run after ``alembic upgrade head``. The account is active and does not have
to change its password on first login. An email that already exists is
refused; nothing is ever overwritten.
"""

import argparse
import os
import sys
from getpass import getpass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import SessionLocal, get_engine  # noqa: E402
from models.user import ROLE_ADMIN, User  # noqa: E402
from services.auth import (  # noqa: E402
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    hash_password,
    normalize_email,
)


def parse_args(argv):
    parser = argparse.ArgumentParser(description="Create the first Admin user.")
    parser.add_argument("--email", help="Login email (prompted when omitted).")
    parser.add_argument("--full-name", help="Display name (prompted when omitted).")
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--password-env",
        metavar="VAR",
        help="Read the password from this environment variable instead of prompting.",
    )
    group.add_argument(
        "--password",
        help="Password on the command line (visible in shell history; prefer --password-env).",
    )
    return parser.parse_args(argv)


def prompt_password() -> str:
    while True:
        password = getpass("Password: ")
        if len(password) < MIN_PASSWORD_LENGTH:
            print(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
            continue
        if len(password.encode("utf-8")) > MAX_PASSWORD_LENGTH:
            print(f"Password must be at most {MAX_PASSWORD_LENGTH} bytes.")
            continue
        if getpass("Confirm password: ") != password:
            print("Passwords do not match. Try again.")
            continue
        return password


def resolve_password(args) -> str:
    if args.password_env:
        password = os.getenv(args.password_env, "")
        if not password:
            sys.exit(f"Environment variable {args.password_env} is empty or unset.")
    elif args.password is not None:
        password = args.password
    else:
        return prompt_password()

    if len(password) < MIN_PASSWORD_LENGTH:
        sys.exit(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(password.encode("utf-8")) > MAX_PASSWORD_LENGTH:
        sys.exit(f"Password must be at most {MAX_PASSWORD_LENGTH} bytes.")
    return password


def create_admin(db, *, email: str, full_name: str, password: str) -> User:
    email = normalize_email(email)
    if "@" not in email:
        raise ValueError("Email must be a valid address.")
    if not full_name.strip():
        raise ValueError("Full name is required.")
    if db.query(User).filter(User.email == email).one_or_none() is not None:
        raise ValueError(f"A user with the email {email} already exists.")

    user = User(
        email=email,
        full_name=full_name.strip(),
        role=ROLE_ADMIN,
        password_hash=hash_password(password),
        is_active=True,
        must_change_password=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def main(argv=None) -> int:
    args = parse_args(argv)

    email = args.email or input("Email: ")
    full_name = args.full_name or input("Full name: ")
    password = resolve_password(args)

    db = SessionLocal(bind=get_engine())
    try:
        user = create_admin(db, email=email, full_name=full_name, password=password)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        db.close()

    print(f"Created admin {user.full_name} <{user.email}> (id {user.id}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
