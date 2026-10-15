"""Account administration for operators.

Usage (inside the backend container):
    python -m auth.manage list-users
    python -m auth.manage create-user <username> [--admin]
    python -m auth.manage set-password <username>
    python -m auth.manage grant-admin <username>
    python -m auth.manage revoke-admin <username>
    python -m auth.manage deactivate <username>
    python -m auth.manage activate <username>

create-user and set-password prompt for the password on a terminal, or reads one line from
stdin when piped, so the password never appears in shell history or `ps`.
"""

import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import select

from datetime import UTC, datetime

from api.v1.schemas.admin import PasswordReset
from auth.schemas import UserCreate
from auth.sessions import revoke_user_sessions
from auth.utils import get_password_hash
from database import Base, SessionLocal, engine
from models.schema import upgrade_schema
from models.user_models import User


def _read_password() -> str:
    if sys.stdin.isatty():
        password = getpass.getpass("Password: ")
        if password != getpass.getpass("Repeat password: "):
            raise SystemExit("Passwords do not match")
        return password
    return sys.stdin.readline().rstrip("\n")


def create_user(username: str, admin: bool) -> None:
    try:
        new_user = UserCreate(username=username, password=_read_password())
    except ValidationError as error:
        # Report field and reason only; the default message echoes the input password.
        problems = "; ".join(
            f"{'.'.join(map(str, issue['loc']))}: {issue['msg']}" for issue in error.errors()
        )
        raise SystemExit(f"Invalid account details: {problems}") from None
    with SessionLocal.begin() as session:
        if session.scalar(select(User).where(User.username == new_user.username)):
            raise SystemExit(f"User {new_user.username!r} already exists")
        session.add(
            User(
                username=new_user.username,
                hashed_password=get_password_hash(new_user.password),
                is_admin=admin,
                created_at=datetime.now(UTC),
            )
        )
    role = "administrator" if admin else "user"
    print(f"Created {role} {new_user.username!r}")


def list_users() -> None:
    with SessionLocal() as session:
        users = session.scalars(select(User).order_by(User.id)).all()
    print(f"{'id':>4}  {'username':<32} {'admin':<6} {'active':<6}")
    for user in users:
        print(f"{user.id:>4}  {user.username:<32} {str(user.is_admin):<6} {str(user.is_active):<6}")


def set_password(username: str) -> None:
    normalized = username.strip().lower()
    try:
        # Reuse the account rules (length, bcrypt byte limit) for the new password.
        password = PasswordReset(password=_read_password()).password
    except ValidationError as error:
        problems = "; ".join(
            f"{'.'.join(map(str, issue['loc']))}: {issue['msg']}" for issue in error.errors()
        )
        raise SystemExit(f"Invalid account details: {problems}") from None
    with SessionLocal.begin() as session:
        user = session.scalar(select(User).where(User.username == normalized))
        if user is None:
            raise SystemExit(f"User {normalized!r} does not exist")
        user.hashed_password = get_password_hash(password)
        user.tokens_valid_after = datetime.now(UTC)
        revoke_user_sessions(session, user.id)
    print(f"Password updated for {normalized!r}")


def update_user(username: str, **fields: bool) -> None:
    normalized = username.strip().lower()
    with SessionLocal.begin() as session:
        user = session.scalar(select(User).where(User.username == normalized))
        if user is None:
            raise SystemExit(f"User {normalized!r} does not exist")
        for name, value in fields.items():
            setattr(user, name, value)
        if fields.get("is_active") is False:
            revoke_user_sessions(session, user.id)
    print(f"Updated {normalized!r}: {fields}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage DataBix accounts")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("list-users", help="List accounts with their roles")
    create = commands.add_parser("create-user", help="Create an account")
    create.add_argument("username")
    create.add_argument("--admin", action="store_true", help="Grant administrator role")
    for name in ("set-password", "grant-admin", "revoke-admin", "deactivate", "activate"):
        commands.add_parser(name).add_argument("username")
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    upgrade_schema(engine)

    if args.command == "list-users":
        list_users()
    elif args.command == "create-user":
        create_user(args.username, args.admin)
    elif args.command == "set-password":
        set_password(args.username)
    elif args.command == "grant-admin":
        update_user(args.username, is_admin=True)
    elif args.command == "revoke-admin":
        update_user(args.username, is_admin=False)
    elif args.command == "deactivate":
        update_user(args.username, is_active=False)
    elif args.command == "activate":
        update_user(args.username, is_active=True)


if __name__ == "__main__":
    main()
