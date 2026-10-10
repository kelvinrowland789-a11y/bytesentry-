"""Pairgate airtime."""
import os
import requests

URL = "https://pairgate.com/api/v1/airtime/purchase"


def buy_airtime(provider_id: str, amount: int, recipient: str, reference: str) -> tuple[str, str]:
    """provider_id is the lowercase network (mtn, airtel, glo, 9mobile). AGENT: confirm ids."""
    payload = {"provider_id": provider_id, "amount": amount, "recipient": recipient, "reference": reference}
    try:
        r = requests.post(URL, json=payload, timeout=30, headers={
            "Authorization": f"Bearer {os.getenv('PAIRGATE_API_KEY', '')}", "Content-Type": "application/json"})
    except requests.RequestException as e:
        return "pending", str(e)
    if r.status_code >= 500:
        return "pending", r.text[:500]
    try:
        body = r.json()
    except ValueError:
        return "pending", r.text[:500]
    # {"code": 200, "status": "success", "data": {"status": true, "message": "...successful & processing.", ...}}
    status = str(body.get("status", "")).lower()
    if body.get("code") == 200 and status == "success" and (body.get("data") or {}).get("status") is True:
        return "success", r.text[:500]
    if status in {"pending", "processing", "queued"}:
        return "pending", r.text[:500]
    return "failed", r.text[:500]
