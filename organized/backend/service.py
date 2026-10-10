"""Purchase flow. Every purchase: validate -> balance check -> PIN (if required)
-> live plan match -> atomic debit -> provider call -> confirm or refund."""
import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import and_, or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import config
import pricing
import wallet
from bs_models import PinAttempt, Subscription, SubscriptionPlan, Transaction
from deps import verify_pin
from providers import pairgate, y3

PHONE_RE = re.compile(r"^0[789][01]\d{8}$")
NETWORKS = {"MTN", "AIRTEL", "GLO", "9MOBILE"}


class ServiceError(Exception):
    def __init__(self, detail: str, status: int):
        self.detail, self.status = detail, status


def _validate(network, phone):
    if network not in NETWORKS:
        raise ServiceError("Choose a valid network.", 400)
    if not PHONE_RE.match(phone or ""):
        raise ServiceError("Enter a valid 11-digit phone number.", 400)


def _enough(user, amount):
    if user.balance < amount:
        raise ServiceError("Insufficient wallet balance. Fund your wallet to continue.", 402)


def check_pin(db: Session, user, pin: str):
    a = db.get(PinAttempt, user.id) or PinAttempt(user_id=user.id, failures=0)
    if a.locked_until and a.locked_until > datetime.utcnow():
        raise ServiceError("Too many wrong PIN attempts. Try again in a few minutes.", 429)
    if not (pin and pin.isdigit() and len(pin) == 4 and verify_pin(user, pin)):
        a.failures = (a.failures or 0) + 1
        if a.failures >= 5:
            a.locked_until, a.failures = datetime.utcnow() + timedelta(minutes=15), 0
        db.add(a); db.commit()
        raise ServiceError("Incorrect PIN.", 403)
    a.failures, a.locked_until = 0, None
    db.add(a); db.commit()


def _plans():
    try:
        return y3.get_plans()
    except y3.ProviderUnavailable:
        raise ServiceError("Plans are unavailable right now. Try again shortly.", 503)


def _run(db, user, kind, network, phone, charge, title, send) -> Transaction:
    ref = "bs-" + uuid.uuid4().hex
    if not wallet.debit(db, user.id, charge, ref):          # atomic: can't go below zero
        db.rollback()
        raise ServiceError("Insufficient wallet balance. Fund your wallet to continue.", 402)
    tx = Transaction(user_id=user.id, kind=kind, network=network, title=title, phone=phone,
                     amount_naira=charge, reference=ref, status="pending")
    db.add(tx); db.commit()
    state, raw = send(ref)
    tx.provider_response = raw
    if state == "failed":
        wallet.credit(db, user.id, charge, "refund", ref)
    tx.status = state
    db.commit()
    return tx


def buy_data(db, user, network, plan_id, phone, pin, price) -> Transaction:
    _validate(network, phone)
    _enough(user, price)                                     # 1. balance first
    check_pin(db, user, pin)                                 # 2. PIN
    plan = next((p for p in _plans() if p["id"] == plan_id and p["network"].upper() == network), None)
    if not plan:                                             # 3. does it exist right now?
        raise ServiceError("This plan is no longer available.", 409)
    try:
        markup = config.get_markup(db)
    except config.PricingConfigurationError as e:
        raise ServiceError(str(e), 503) from e
    live = pricing.sell_price(plan["price"], markup)
    if live != price:
        raise ServiceError(f"The price is now ₦{live:,}. Please review and try again.", 409)
    return _run(db, user, "data", network, phone, live, f"{network} {pricing.size_label(plan['name'])}",
                lambda ref: y3.buy_data(plan["id"], network, phone, ref))


def buy_airtime(db, user, network, amount, phone, pin) -> Transaction:
    _validate(network, phone)
    if not config.AIRTIME_MIN <= amount <= config.AIRTIME_MAX:
        raise ServiceError(f"Airtime must be between ₦{config.AIRTIME_MIN:,} and ₦{config.AIRTIME_MAX:,}.", 400)
    charge = pricing.airtime_charge(network, amount)
    _enough(user, charge)
    check_pin(db, user, pin)
    return _run(db, user, "airtime", network, phone, charge, f"{network} airtime ₦{amount:,}",
                lambda ref: pairgate.buy_airtime(network.lower(), amount, phone, ref))


def _match(plans, network, gb, days):
    c = [p for p in plans if p["network"].upper() == network
         and pricing.gb_of(p["name"]) == gb and pricing.days_of(p.get("validity")) == days]
    return min(c, key=lambda p: p["price"]) if c else None   # right size + validity first, then cheapest


# ---------- ByteSentry subscription: pay once, receive in 1GB drops ----------
def _live(sub, now=None) -> bool:
    now = now or datetime.utcnow()
    return bool(sub) and sub.status == "active" and sub.expires_at > now and (sub.remaining_gb > 0 or sub.pending_gb > 0)


def _find_sub(db, user_id, network):
    return db.query(Subscription).filter_by(user_id=user_id, network=network).first()


def _start_sub(db, sub, user_id, network, phone, pack, now) -> bool:
    """Create this user's row for the network, or reset a finished/expired one.
    Returns False if a live one exists (the condition sits inside the UPDATE, so two taps can't both win)."""
    vals = dict(phone=phone, pack_gb=pack["gb"], remaining_gb=pack["gb"], pending_gb=0,
                price_naira=pack["price"], validity_days=pack["validity_days"], status="active",
                started_at=now, expires_at=now + timedelta(days=pack["validity_days"]))
    if not sub:
        db.add(Subscription(user_id=user_id, network=network, **vals))
        return True
    res = db.execute(update(Subscription).where(
        Subscription.id == sub.id,
        or_(Subscription.status != "active", Subscription.expires_at <= now,
            and_(Subscription.remaining_gb <= 0, Subscription.pending_gb <= 0))).values(**vals))
    return res.rowcount == 1


def _claim_drop(db, sub_id, now) -> bool:
    """Take 1GB out of 'remaining' in one statement, so rapid double taps can't over-deliver."""
    res = db.execute(update(Subscription).where(
        Subscription.id == sub_id, Subscription.status == "active",
        Subscription.expires_at > now, Subscription.remaining_gb >= config.DROP_GB
    ).values(remaining_gb=Subscription.remaining_gb - config.DROP_GB,
             pending_gb=Subscription.pending_gb + config.DROP_GB))
    return res.rowcount == 1


def _settle_drop(db, sub_id, state):
    if state == "success":
        vals = dict(pending_gb=Subscription.pending_gb - config.DROP_GB)
    elif state == "failed":      # Y3 clearly refused: put the GB back
        vals = dict(remaining_gb=Subscription.remaining_gb + config.DROP_GB,
                    pending_gb=Subscription.pending_gb - config.DROP_GB)
    else:                        # unknown (timeout): keep it held, never hand it out twice
        return
    db.execute(update(Subscription).where(Subscription.id == sub_id).values(**vals))


def _send_drop(db, sub, plan, phone) -> Transaction:
    if not _claim_drop(db, sub.id, datetime.utcnow()):
        db.rollback()
        raise ServiceError("Nothing left to top up, or this subscription has ended.", 409)
    db.refresh(sub)
    sub.phone = phone
    ref = "bs-drop-" + uuid.uuid4().hex
    tx = Transaction(user_id=sub.user_id, kind="topup", network=sub.network, phone=phone, amount_naira=0,
                     reference=ref, status="pending", title=f"{sub.network} {config.DROP_GB}GB ({sub.remaining_gb}GB left)")
    db.add(tx); db.commit()
    state, raw = y3.buy_data(plan["id"], sub.network, phone, ref)
    tx.status, tx.provider_response = state, raw
    _settle_drop(db, sub.id, state)
    db.commit()
    return tx


def subscribe(db, user, phone, plan_id) -> Transaction:
    """Pay the pack price once. 1GB is delivered now, the rest on each 'Top up again'.
    One live subscription per network per user. No PIN on this page."""
    pack = db.query(SubscriptionPlan).filter_by(id=plan_id, enabled=True).first()
    if not pack:
        raise ServiceError("That pack doesn't exist.", 404)
    network = pack.network
    _validate(network, phone)
    _enough(user, pack.price)
    sub = _find_sub(db, user.id, network)
    if _live(sub):
        raise ServiceError(f"You already have an active {network} subscription.", 409)
    plan = _match(_plans(), network, config.DROP_GB, pack.validity_days)
    if not plan:
        raise ServiceError(f"{network} subscriptions aren't available right now.", 409)

    ref, now = "bs-sub-" + uuid.uuid4().hex, datetime.utcnow()
    pack_data = {
        "gb": pack.gb,
        "price": pack.price,
        "validity_days": pack.validity_days,
    }
    if not wallet.debit(db, user.id, pack.price, ref):
        db.rollback()
        raise ServiceError("Insufficient wallet balance. Fund your wallet to continue.", 402)
    if not _start_sub(db, sub, user.id, network, phone, pack_data, now):
        db.rollback()
        raise ServiceError(f"You already have an active {network} subscription.", 409)
    paid = Transaction(user_id=user.id, kind="subscription", network=network, phone=phone,
                       amount_naira=pack.price, reference=ref, status="success",
                       title=f"{network} {pack.gb}GB pack")
    db.add(paid)
    try:
        db.commit()                      # debit + subscription + payment record, all or nothing
    except IntegrityError:
        db.rollback()
        raise ServiceError(f"You already have an active {network} subscription.", 409)

    sub = _find_sub(db, user.id, network)
    drop = _send_drop(db, sub, plan, phone)     # first 1GB, right now
    if drop.status == "failed":          # couldn't deliver anything: cancel and refund the pack
        db.execute(update(Subscription).where(Subscription.id == sub.id)
                   .values(status="cancelled", remaining_gb=0, pending_gb=0))
        wallet.credit(db, user.id, pack.price, "refund", ref)
        paid.status = "failed"
        db.commit()
    return drop


def topup_again(db, user, network, phone) -> Transaction:
    """Sends a free 1GB drop to the confirmed phone number and saves it for next time."""
    if network not in NETWORKS:
        raise ServiceError("Choose a valid network.", 400)
    _validate(network, phone)
    sub = _find_sub(db, user.id, network)
    if not _live(sub):
        raise ServiceError(f"You don't have an active {network} subscription.", 404)
    if sub.remaining_gb < config.DROP_GB:
        raise ServiceError("Nothing left to top up on this subscription.", 409)
    plan = _match(_plans(), network, config.DROP_GB, sub.validity_days)
    if not plan:
        raise ServiceError(f"{network} top-ups aren't available right now.", 409)
    return _send_drop(db, sub, plan, phone)


def user_subscriptions(db, user) -> list[dict]:
    now = datetime.utcnow()
    rows = db.query(Subscription).filter_by(user_id=user.id).all()
    return [{"network": r.network, "phone": r.phone, "pack_gb": r.pack_gb, "remaining_gb": r.remaining_gb,
             "pending_gb": r.pending_gb, "expires_at": r.expires_at.isoformat(), "live": _live(r, now)}
            for r in rows]
