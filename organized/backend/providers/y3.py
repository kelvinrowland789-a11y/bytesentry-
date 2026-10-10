"""Y3 data provider. GET /data/plans, POST /data/purchase (request_id = our reference)."""
import os
import requests

BASE_URL = os.getenv("Y3_BASE_URL", "https://y3data.com/api/v1")
PLAN_FIELD = "plan"        # AGENT: confirm the purchase field name ("plan" or "plan_code")


class ProviderUnavailable(Exception):
    """Y3 couldn't be reached or answered unclearly."""


def _headers():
    return {"Authorization": f"Bearer {os.getenv('Y3_API_KEY', '')}", "Content-Type": "application/json",
            "Accept": "application/json", "User-Agent": "Mozilla/5.0"}


def get_plans() -> list[dict]:
    """Live plans, never stored. Each: id, network, name, type, price, validity."""
    try:
        r = requests.get(f"{BASE_URL}/data/plans", headers=_headers(), timeout=15)
        body = r.json()
    except (requests.RequestException, ValueError) as e:
        raise ProviderUnavailable(str(e))
    if r.status_code != 200:
        raise ProviderUnavailable(f"HTTP {r.status_code}")
    return (body.get("data") or {}).get("plans") or body.get("plans") or []


def classify(r: requests.Response) -> str:
    """Y3 answers {"status": "success", "transaction_id": ..., "request_id": ..., "balance_after": ...}."""
    if r.status_code >= 500:
        return "pending"
    try:
        body = r.json()
    except ValueError:
        return "pending"
    s = str(body.get("status", "")).lower()
    if s == "success":
        return "success"
    if s in {"pending", "processing", "queued"}:     # AGENT: add Y3's real 'pending' wording if different
        return "pending"
    return "failed"


def buy_data(plan_id: str, network: str, phone: str, reference: str) -> tuple[str, str]:
    """Returns (state, raw). A timeout is 'pending', never 'failed': delivery is unknown."""
    payload = {"network": network, PLAN_FIELD: plan_id, "phone": phone, "request_id": reference}
    try:
        r = requests.post(f"{BASE_URL}/data/purchase", headers=_headers(), json=payload, timeout=30)
    except requests.RequestException as e:
        return "pending", str(e)
    return classify(r), r.text[:500]
