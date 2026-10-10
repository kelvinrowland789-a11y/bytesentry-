"""Small Paystack client for wallet funding."""

import hashlib
import hmac
import os
from urllib.parse import quote

import requests

BASE_URL = "https://api.paystack.co"
TIMEOUT_SECONDS = 20


class PaystackError(RuntimeError):
    pass


def _headers():
    key = os.getenv("PAYSTACK_TEST_KEY", "").strip()
    if not key:
        raise PaystackError("PAYSTACK_TEST_KEY is not configured.")
    return {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _request(method, path, **kwargs):
    try:
        response = requests.request(
            method, f"{BASE_URL}{path}", headers=_headers(),
            timeout=TIMEOUT_SECONDS, **kwargs,
        )
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise PaystackError("Paystack request failed.") from exc
    if not isinstance(result, dict) or not result.get("status") or not isinstance(result.get("data"), dict):
        raise PaystackError(result.get("message") or "Paystack returned an invalid response.")
    return result["data"]


def initialize(email: str, amount_kobo: int, reference: str, callback_url: str) -> str:
    data = _request(
        "POST",
        "/transaction/initialize",
        json={
            "email": email,
            "amount": amount_kobo,
            "reference": reference,
            "currency": "NGN",
            "callback_url": callback_url,
        },
    )
    authorization_url = data.get("authorization_url")
    if not authorization_url:
        raise PaystackError("Paystack did not return a checkout URL.")
    return authorization_url


def verify(reference: str) -> dict:
    return _request("GET", f"/transaction/verify/{quote(reference, safe='')}")


def valid_signature(raw_body: bytes, signature: str | None) -> bool:
    key = os.getenv("PAYSTACK_TEST_KEY", "").strip()
    if not key or not signature:
        return False
    expected = hmac.new(key.encode(), raw_body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, signature)
