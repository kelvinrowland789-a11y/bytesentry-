import math
import re
from decimal import Decimal

import config


def sell_price(y3_price, markup) -> int:
    """Apply the database-configured markup and round UP to a whole naira."""
    return int(math.ceil(Decimal(str(y3_price)) * Decimal(str(markup))))


def _size(name: str):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(GB|MB)", name.upper())
    return (float(m.group(1)), m.group(2)) if m else (None, None)


def gb_of(name: str):
    n, u = _size(name)
    return None if n is None else (n if u == "GB" else n / 1000)


def size_label(name: str) -> str:
    n, u = _size(name)
    return name if n is None else f"{n:g}{u}"


def days_of(validity: str):
    m = re.search(r"\d+", validity or "")
    if not m:
        return None
    n = int(m.group())
    return n * 30 if "month" in validity.lower() else n


def shape_plan(p: dict, markup) -> dict:
    """What the frontend receives. Price is already the selling price."""
    return {
        "plan_id": p["id"], "network": p["network"].upper(), "name": p["name"],
        "type": p.get("type", ""), "size": size_label(p["name"]),
        "validity": p.get("validity", ""), "price": sell_price(p["price"], markup),
    }


def airtime_charge(network: str, amount: int) -> int:
    pct = config.AIRTIME_DISCOUNT_PCT.get(network, 0)
    return int(math.ceil(amount * (100 - pct) / 100))
