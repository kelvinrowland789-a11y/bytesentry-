"""New tables only (bs_ prefix). Money = whole naira."""
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint, func

from database import Base


class SubscriptionPlan(Base):
    __tablename__ = "bs_subscription_plans"
    id = Column(Integer, primary_key=True)
    network = Column(String(10), nullable=False, index=True)
    gb = Column(Integer, nullable=False)
    validity_days = Column(Integer, nullable=False)
    price = Column(Integer, nullable=False)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class Transaction(Base):
    __tablename__ = "bs_transactions"
    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    kind = Column(String(12), nullable=False)          # data | airtime | subscription | topup
    network = Column(String(10), nullable=False)
    title = Column(String(80), nullable=False)
    phone = Column(String(11), nullable=False)
    amount_naira = Column(Integer, nullable=False)
    reference = Column(String(64), unique=True, nullable=False)
    status = Column(String(10), nullable=False, default="pending")   # pending | success | failed
    provider_response = Column(Text)
    created_at = Column(DateTime, server_default=func.now())


class WalletLedger(Base):
    __tablename__ = "bs_wallet_ledger"
    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    amount_naira = Column(Integer, nullable=False)     # negative = debit
    kind = Column(String(10), nullable=False)          # fund | purchase | refund
    reference = Column(String(64), nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    __table_args__ = (UniqueConstraint("kind", "reference"),)


class Payment(Base):
    __tablename__ = "bs_payments"
    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    email = Column(String(254), nullable=False)
    reference = Column(String(64), unique=True, nullable=False)
    amount_naira = Column(Integer, nullable=False)
    status = Column(String(10), nullable=False, default="pending", server_default="pending")
    created_at = Column(DateTime, nullable=False, server_default=func.now())


class PinAttempt(Base):
    __tablename__ = "bs_pin_attempts"
    user_id = Column(String(36), primary_key=True)
    failures = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime)


class Subscription(Base):
    """One row per user per network (the unique key enforces 'one subscription per network')."""
    __tablename__ = "bs_subscriptions"
    id = Column(Integer, primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    network = Column(String(10), nullable=False)
    phone = Column(String(11), nullable=False)            # entered once, at subscribe time
    pack_gb = Column(Integer, nullable=False)
    remaining_gb = Column(Integer, nullable=False)        # still to be delivered
    pending_gb = Column(Integer, nullable=False, default=0)   # sent to Y3, outcome unknown
    price_naira = Column(Integer, nullable=False)
    validity_days = Column(Integer, nullable=False)
    status = Column(String(10), nullable=False, default="active")  # active | finished | cancelled
    started_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    __table_args__ = (UniqueConstraint("user_id", "network"),)
