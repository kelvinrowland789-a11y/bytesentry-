"""Settings come from environment variables (os.getenv), see ENV_VARS.md.
Run:  uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
Serves the API and static frontend files from ../frontend."""
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import auth
import bs_models   # noqa: F401  (registers the tables)
import models      # noqa: F401
from auth_routes import router as auth_router
from database import Base, SessionLocal, engine
from sqlalchemy import text
from routes import router as app_router

auth.require_secret()
Base.metadata.create_all(engine)
with engine.begin() as connection:
    connection.execute(text("ALTER TABLE bs_payments ADD COLUMN IF NOT EXISTS email VARCHAR(254)"))
    connection.execute(text(
        "UPDATE bs_payments AS payment SET email = users.email "
        "FROM users WHERE payment.user_id = users.userid AND payment.email IS NULL"
    ))
    connection.execute(text(
        "ALTER TABLE bs_payments ALTER COLUMN status SET DEFAULT 'pending'"
    ))

with SessionLocal() as db:
    if db.query(models.ProfitMargin).filter_by(margin_id=1).one_or_none() is None:
        db.add(models.ProfitMargin(margin_id=1, margin=1.15))
        db.commit()

app = FastAPI(title="ByteSentry API")

# Same idea as before: allow Codespaces + localhost, with cookies.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://bytesentry.netlify.app",
        *[o for o in [os.getenv("FRONTEND_URL", "").rstrip("/")] if o],
    ],
    allow_origin_regex=r"https://.*\.app\.github\.dev|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def _bad_input(request, exc):
    return JSONResponse({"detail": "Please check your details and try again."}, status_code=422)


app.include_router(auth_router)
app.include_router(app_router)


@app.get("/health")
def health():
    return {"ok": True}


# ---- the website itself (only plain files in the folder above; never the backend folder) ----
SITE = Path(__file__).resolve().parent.parent / "frontend"
SAFE = re.compile(r"^[\w\-]+\.(html|css|js|png|jpg|jpeg|webp|svg|ico)$")


@app.get("/")
def home():
    if (SITE / "index.html").is_file():
        return FileResponse(SITE / "index.html")
    raise HTTPException(404, "Not found")


@app.get("/{name}")
def site_file(name: str):
    path = SITE / name
    if SAFE.match(name) and path.is_file():
        return FileResponse(path)
    raise HTTPException(404, "Not found")
