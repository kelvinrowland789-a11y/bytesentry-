"""App routes: wallet, data, airtime, ByteSentry subscription, Paystack."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import case
from sqlalchemy.orm import Session

import config
import pricing
import service
import wallet
import url
from bs_models import Payment, SubscriptionPlan, Transaction, WalletLedger
from deps import get_current_user, get_db
from database import SessionLocal
from models import User
from providers import paystack

router = APIRouter()


class BuyDataIn(BaseModel):
    network: str
    plan_id: str
    phone: str
    pin: str
    price: int


class BuyAirtimeIn(BaseModel):
    network: str
    amount: int
    phone: str
    pin: str


class SubscribeIn(BaseModel):
    phone: str
    plan_id: int = Field(gt=0)


class TopupIn(BaseModel):
    network: str
    phone: str


class FundIn(BaseModel):
    amount: int = Field(ge=100, le=500000)


def _call(fn, *a, **k):
    try:
        return fn(*a, **k)
    except service.ServiceError as e:
        raise HTTPException(e.status, e.detail)


def _reply(tx: Transaction, user):
    if tx.status == "pending":
        return JSONResponse({"message": "Order received. We're confirming it now.", "status": "pending"}, 202)
    if tx.status == "failed":
        raise HTTPException(502, "The provider couldn't complete this order. Nothing was lost, please try again.")
    msg = f"{tx.title}. Sent to {tx.phone}." if tx.kind == "topup" else f"{tx.title} sent to {tx.phone}."
    return {"message": msg, "status": "success", "balance": user.balance}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return {"name": user.name, "phone": user.phone, "email": user.email, "balance": user.balance}


@router.get("/transactions")
def transactions(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Transaction).filter_by(user_id=user.id).order_by(Transaction.id.desc()).limit(30).all()
    return {"transactions": [{"id": t.id, "kind": t.kind, "title": t.title, "phone": t.phone, "amount": t.amount_naira,
                              "status": t.status, "date": t.created_at.isoformat() if t.created_at else ""} for t in rows]}


@router.delete("/transactions/{transaction_id}")
def delete_transaction(transaction_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter_by(id=transaction_id, user_id=user.id).first()
    if not transaction:
        raise HTTPException(404, "Activity not found.")
    db.delete(transaction)
    db.commit()
    return {"message": "Activity removed."}


@router.get("/payments")
def payments(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(Payment).filter_by(user_id=user.id).order_by(Payment.id.desc()).all()
    return {"payments": [
        {
            "id": payment.id,
            "reference": payment.reference,
            "amount": payment.amount_naira,
            "status": payment.status,
            "date": payment.created_at.isoformat() if payment.created_at else "",
        }
        for payment in rows
    ]}


@router.post("/payments/{payment_id}/verify")
def verify_payment(payment_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    payment = db.query(Payment).filter_by(id=payment_id, user_id=user.id).first()
    if not payment:
        raise HTTPException(404, "Payment not found.")
    if payment.status == "success":
        return {"status": "success", "message": "This payment is already confirmed."}
    if payment.status != "pending":
        return {"status": payment.status, "message": "This payment is not pending."}
    try:
        settled = settle(db, payment.reference)
    except paystack.PaystackError as exc:
        raise HTTPException(503, "Paystack could not verify this payment right now.") from exc
    payment = db.query(Payment).filter_by(id=payment_id, user_id=user.id).first()
    if not payment:
        raise HTTPException(404, "Payment no longer exists.")
    if settled:
        return {"status": "success", "message": "Payment verified and wallet credited."}
    if payment.status == "failed":
        return {"status": "failed", "message": "Paystack reports this payment was not completed; your wallet was not credited."}
    return {"status": payment.status, "message": "Paystack has not confirmed this payment yet."}


@router.delete("/payments/{payment_id}")
def delete_payment(payment_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    payment = (
        db.query(Payment)
        .filter_by(id=payment_id, user_id=user.id)
        .with_for_update()
        .first()
    )
    if not payment:
        raise HTTPException(404, "Payment not found.")
    if payment.status == "pending":
        raise HTTPException(409, "Pending payments cannot be deleted.")
    db.delete(payment)
    db.commit()
    return {"message": "Payment removed from your history."}


@router.get("/DataPlans")
def data_plans(user=Depends(get_current_user), db: Session = Depends(get_db)):
    plans = _call(service._plans)
    try:
        markup = config.get_markup(db)
    except config.PricingConfigurationError as e:
        raise HTTPException(503, str(e))
    return {"plans": [pricing.shape_plan(p, markup) for p in plans]}


@router.post("/BuyData")
def buy_data(b: BuyDataIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _reply(_call(service.buy_data, db, user, b.network.upper(), b.plan_id, b.phone, b.pin, b.price), user)


@router.post("/BuyAirtime")
def buy_airtime(b: BuyAirtimeIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _reply(_call(service.buy_airtime, db, user, b.network.upper(), b.amount, b.phone, b.pin), user)


@router.get("/subscription/packs")
def packs(user=Depends(get_current_user), db: Session = Depends(get_db)):
    plans = db.query(SubscriptionPlan).filter_by(enabled=True).order_by(
        case(
            (SubscriptionPlan.network == "MTN", 0),
            (SubscriptionPlan.network == "AIRTEL", 1),
            (SubscriptionPlan.network == "GLO", 2),
            (SubscriptionPlan.network == "9MOBILE", 3),
            else_=4,
        ),
        SubscriptionPlan.network,
        SubscriptionPlan.gb,
        SubscriptionPlan.validity_days,
        SubscriptionPlan.price,
        SubscriptionPlan.id,
    ).all()
    return {"packs": [{"id": p.id, "network": p.network, "gb": p.gb,
                       "validity_days": p.validity_days, "price": p.price} for p in plans],
            "subs": service.user_subscriptions(db, user)}


@router.post("/subscription/subscribe")
def subscribe(b: SubscribeIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _reply(_call(service.subscribe, db, user, b.phone, b.plan_id), user)


@router.post("/subscription/topup")
def topup(b: TopupIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return _reply(_call(service.topup_again, db, user, b.network.upper(), b.phone), user)


# ---------- Paystack ----------
@router.post("/fund/init")
def fund_init(b: FundIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    ref = "fund-" + uuid.uuid4().hex
    payment = Payment(
        user_id=user.id,
        email=user.email,
        reference=ref,
        amount_naira=b.amount,
        status="pending",
    )
    db.add(payment)
    db.commit()
    try:
        callback_url = f"{url.Backend_url.rstrip('/')}/fund/callback"
        link = paystack.initialize(user.email, b.amount * 100, ref, callback_url)
    except paystack.PaystackError as exc:
        payment.status = "failed"
        db.commit()
        raise HTTPException(502, "Couldn't start the payment. Try again.") from exc
    return {"authorization_url": link}


def settle(db: Session, reference: str) -> bool:
    """Verify, lock and settle one pending payment at most once."""
    pay = db.query(Payment).filter_by(reference=reference).first()
    if not pay:
        return False
    if pay.status == "success":
        return True
    if pay.status != "pending":
        return False

    d = paystack.verify(reference)
    customer_email = (d.get("customer") or {}).get("email", "").lower()
    if (
        d.get("status") == "success"
        and d.get("reference") == reference
        and d.get("amount") == pay.amount_naira * 100
        and d.get("currency") == "NGN"
        and customer_email == (pay.email or "").lower()
    ):
        pay = (
            db.query(Payment)
            .filter_by(reference=reference)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not pay:
            return False
        if pay.status == "success":
            return True
        if pay.status != "pending":
            return False
        if db.get(User, pay.user_id) is None:
            return False
        existing_credit = db.query(WalletLedger).filter_by(
            kind="fund", reference=reference
        ).one_or_none()
        if existing_credit is not None:
            pay.status = "success"
            db.commit()
            return True
        credited = wallet.credit(db, pay.user_id, pay.amount_naira, "fund", reference)
        if not credited:
            db.rollback()
            pay = (
                db.query(Payment)
                .filter_by(reference=reference)
                .with_for_update()
                .populate_existing()
                .first()
            )
            existing_credit = db.query(WalletLedger).filter_by(
                kind="fund", reference=reference
            ).one_or_none()
            if not pay or not existing_credit:
                return False
            if pay.status == "success":
                return True
            if pay.status != "pending":
                return False
        pay.status = "success"
        db.commit()
        return True
    if d.get("status") in ("failed", "abandoned"):
        pay = (
            db.query(Payment)
            .filter_by(reference=reference)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if pay and pay.status == "pending":
            pay.status = "failed"
            db.commit()
    return False


@router.get("/fund/callback")
def fund_callback():
    """Return the customer to the funding page; payment confirmation comes from settlement."""
    return RedirectResponse(f"{url.frontend_url.rstrip('/')}/fund.html?status=pending")


def _settle_paystack_webhook(reference: str) -> bool:
    with SessionLocal() as db:
        return settle(db, reference)


@router.post(url.webhook_path)
async def paystack_webhook(request: Request):
    raw = await request.body()
    if not paystack.valid_signature(raw, request.headers.get("x-paystack-signature")):
        raise HTTPException(401, "Bad signature")
    try:
        event = await request.json()
    except ValueError as exc:
        raise HTTPException(400, "Invalid webhook payload.") from exc
    if event.get("event") == "charge.success":
        reference = (event.get("data") or {}).get("reference")
        if not reference:
            raise HTTPException(400, "Webhook is missing a payment reference.")
        try:
            await run_in_threadpool(_settle_paystack_webhook, reference)
        except paystack.PaystackError as exc:
            raise HTTPException(503, "Payment confirmation is temporarily unavailable.") from exc
    return {"ok": True}
