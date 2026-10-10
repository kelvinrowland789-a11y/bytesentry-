"""/signup, /login, /logout. Matches what signup.js and login.js already send."""
import re
import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from auth import create_token, hash_secret, verify_secret, TTL_SECONDS
from database import get_db
from deps import COOKIE_NAME
from models import User

router = APIRouter()
PHONE_RE = re.compile(r"^0[789][01]\d{8}$")
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")
_fails = defaultdict(list)          # simple in-memory login throttle (use Redis if you run several workers)


class SignupIn(BaseModel):
    username: str = Field(min_length=2, max_length=80)
    phonenumber: str
    email: str
    password: str = Field(min_length=8, max_length=128)
    transactionpin: str = Field(min_length=4, max_length=4)


class LoginIn(BaseModel):
    email: str
    password: str


def _with_cookie(request: Request, user_id: str, message: str):
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    res = JSONResponse({"message": message})
    res.set_cookie(COOKIE_NAME, create_token(user_id), max_age=TTL_SECONDS, httponly=True, path="/",
                   secure=https, samesite="none" if https else "lax")   # none+secure lets Codespaces ports share it
    return res


@router.post("/signup")
def signup(b: SignupIn, request: Request, db: Session = Depends(get_db)):
    email = b.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Enter a valid email address.")
    if not PHONE_RE.match(b.phonenumber):
        raise HTTPException(400, "Enter a valid 11-digit Nigerian phone number.")
    if not (re.search(r"[A-Za-z]", b.password) and re.search(r"\d", b.password)):
        raise HTTPException(400, "Password must include letters and numbers.")
    if not b.transactionpin.isdigit() or len(set(b.transactionpin)) == 1 or b.transactionpin in ("1234", "4321"):
        raise HTTPException(400, "Choose a 4-digit PIN that's harder to guess.")
    pw, pin = hash_secret(b.password), hash_secret(b.transactionpin)
    if db.query(User).filter((User.email == email) | (User.phone == b.phonenumber)).first():
        raise HTTPException(409, "An account with this email or phone number already exists.")
    user = User(username=b.username.strip(), phone=b.phonenumber, email=email, password_hash=pw, pin_hash=pin, balance=0)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email or phone number already exists.")
    return _with_cookie(request, user.id, "Account created.")


@router.post("/login")
def login(b: LoginIn, request: Request, db: Session = Depends(get_db)):
    email = b.email.strip().lower()
    key = f"{request.client.host if request.client else '?'}|{email}"
    now = time.time()
    _fails[key] = [t for t in _fails[key] if now - t < 900]
    if len(_fails[key]) >= 5:
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_secret(b.password, user.password_hash):
        _fails[key].append(now)
        raise HTTPException(401, "Email or password is incorrect.")
    _fails.pop(key, None)
    return _with_cookie(request, user.id, "Logged in.")


@router.post("/logout")
def logout():
    res = JSONResponse({"message": "Logged out."})
    res.delete_cookie(COOKIE_NAME, path="/")
    return res
