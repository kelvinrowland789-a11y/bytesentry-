"""Atomic wallet changes, each with a ledger row. ASSUMES User.balance is whole naira."""
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from bs_models import WalletLedger
from deps import User


def debit(db: Session, user_id: str, amount: int, reference: str) -> bool:
    """Deduct only if the balance covers it, in ONE statement (no double-spend race)."""
    res = db.execute(update(User).where(User.id == user_id, User.balance >= amount)
                     .values(balance=User.balance - amount))
    if res.rowcount != 1:
        return False
    db.add(WalletLedger(user_id=user_id, amount_naira=-amount, kind="purchase", reference=reference))
    return True


def credit(db: Session, user_id: str, amount: int, kind: str, reference: str) -> bool:
    """Idempotent: one (kind, reference) can only ever be credited once."""
    try:
        db.add(WalletLedger(user_id=user_id, amount_naira=amount, kind=kind, reference=reference))
        db.flush()
    except IntegrityError:
        db.rollback()
        return False
    db.execute(update(User).where(User.id == user_id).values(balance=User.balance + amount))
    return True
