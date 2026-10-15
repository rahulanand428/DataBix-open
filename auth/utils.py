import os
from datetime import UTC, datetime, timedelta
from typing import Any

import bcrypt
import jwt


MIN_SECRET_KEY_BYTES = 32
BCRYPT_MAX_PASSWORD_BYTES = 72


def load_secret_key(value: str | None) -> str:
    # HS256 keys shorter than the digest size are brute-forceable, and this also
    # rejects copied placeholders such as the one in .env.example.
    if not value or len(value.encode("utf-8")) < MIN_SECRET_KEY_BYTES:
        raise RuntimeError(
            f"JWT_SECRET_KEY must be a random value of at least {MIN_SECRET_KEY_BYTES} bytes; "
            'generate one with: python -c "import secrets; print(secrets.token_urlsafe(48))"'
        )
    return value


SECRET_KEY = load_secret_key(os.getenv("JWT_SECRET_KEY"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"), hashed_password.encode("utf-8")
        )
    except ValueError:
        # Over-long passwords and malformed hashes never match.
        return False


def get_password_hash(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) > BCRYPT_MAX_PASSWORD_BYTES:
        raise ValueError("bcrypt passwords cannot exceed 72 UTF-8 bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("utf-8")


# Verified against when a username does not exist, so failed logins take the
# same time whether or not the account exists.
DUMMY_PASSWORD_HASH = get_password_hash("databix-timing-equalizer")


def create_access_token(
    data: dict[str, Any], expires_delta: timedelta | None = None
) -> str:
    to_encode = data.copy()
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    # "type" keeps other JWTs signed with this key from being accepted as access tokens.
    to_encode.update({"iat": now, "exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
