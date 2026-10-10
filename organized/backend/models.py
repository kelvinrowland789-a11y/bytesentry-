import uuid

from sqlalchemy import Column, Integer, Numeric, String, text
from database import Base

class User(Base):
    __tablename__ = "users"
    id = Column("userid", String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(100), nullable=False)
    phone = Column("phonenumber", String(11), unique=True, nullable=False, index=True)
    email = Column(String(254), unique=True, nullable=False, index=True)
    password_hash = Column("password", String, nullable=False)
    pin_hash = Column("transactionpin", String, nullable=False)
    balance = Column("wallet_balance", Numeric(10, 2), nullable=False, default=0)

    @property
    def name(self):
        return self.username

class ProfitMargin(Base):
    __tablename__ = "profit_margin"

    id = Column("id", String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    margin_id = Column("margin_id", Integer, nullable=False, unique=True, default=1, server_default="1")
    margin = Column("margin", Numeric(10, 4), nullable=False, default=1.15, server_default=text("1.15"))
