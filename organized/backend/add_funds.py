"""Credit a wallet from the server shell (testing / manual top-ups):
    python add_funds.py someone@example.com 5000"""
import sys
import uuid

import bs_models  # noqa: F401
import wallet     # noqa: E402
from database import SessionLocal  # noqa: E402
from models import User            # noqa: E402

if len(sys.argv) != 3 or not sys.argv[2].isdigit():
    sys.exit("usage: python add_funds.py <email> <amount_naira>")
db = SessionLocal()
user = db.query(User).filter(User.email == sys.argv[1].strip().lower()).first()
if not user:
    sys.exit("No user with that email.")
wallet.credit(db, user.id, int(sys.argv[2]), "fund", "admin-" + uuid.uuid4().hex)
db.commit()
db.refresh(user)
print(f"{user.email} balance is now N{user.balance:,}")
