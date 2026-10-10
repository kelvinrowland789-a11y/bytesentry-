from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from auth import decode_jwt, verify_secret
from database import get_db          # noqa: F401  (re-exported for the routers)
from models import User

COOKIE_NAME = "access_token"


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(401, "Please log in.")
    try:
        user = db.get(User, decode_jwt(token)["sub"])
    except Exception:
        raise HTTPException(401, "Your session has expired. Please log in again.")
    if not user:
        raise HTTPException(401, "Please log in.")
    return user


def verify_pin(user: User, pin: str) -> bool:
    return verify_secret(pin, user.pin_hash)
