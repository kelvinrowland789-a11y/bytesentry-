import os
import re

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://bytesentry.netlify.app").rstrip("/")
_ALLOWED_FRONTEND_ORIGINS = {FRONTEND_URL, "https://bytesentry.netlify.app"}
_CODESPACES_ORIGIN = re.compile(r"https://[a-z0-9-]+\.app\.github\.dev", re.IGNORECASE)
_LOCAL_ORIGIN = re.compile(r"http://(?:localhost|127\.0\.0\.1)(?::\d+)?")


def payment_return_origin(origin: str | None) -> str:
    candidate = (origin or "").rstrip("/")
    if (
        candidate in _ALLOWED_FRONTEND_ORIGINS
        or _CODESPACES_ORIGIN.fullmatch(candidate)
        or _LOCAL_ORIGIN.fullmatch(candidate)
    ):
        return candidate
    return FRONTEND_URL


webhook_path = "/paystack/webhook"
webhook_url = "https://studious-tribble-vpr467w495xxfxqpr-8000.app.github.dev/paystack/webhook"
