"""Argon2 password / PIN hashing and login tokens."""
import os
import time

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

ALGO = "HS256"
TTL_SECONDS = 7 * 24 * 3600
_ph = PasswordHasher()


def _secret() -> str:
    return os.getenv("JWT_SECRET", "")


def require_secret():
    if len(_secret()) < 32:
        raise RuntimeError("Set the JWT_SECRET environment variable (32+ characters). See ENV_VARS.md.")


def hash_secret(plain: str) -> str:
    return _ph.hash(plain)


def verify_secret(plain: str, hashed: str) -> bool:
    try:
        return bool(hashed) and _ph.verify(hashed, plain)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def create_token(user_id: str) -> str:
    return jwt.encode({"sub": str(user_id), "exp": int(time.time()) + TTL_SECONDS}, _secret(), algorithm=ALGO)


def decode_jwt(token: str) -> dict:
    return jwt.decode(token, _secret(), algorithms=[ALGO])
