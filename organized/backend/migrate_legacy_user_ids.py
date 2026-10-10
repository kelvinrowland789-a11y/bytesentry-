"""Prepare legacy PostgreSQL tables for UUID-based user IDs."""
from sqlalchemy import Integer, String, inspect, text

from database import engine

TABLES = (
    "bs_transactions",
    "bs_wallet_ledger",
    "bs_payments",
    "bs_pin_attempts",
    "bs_subscriptions",
)
LEGACY_USER_COLUMNS = {
    "userid",
    "username",
    "phonenumber",
    "email",
    "password",
    "transactionpin",
    "wallet_balance",
}


with engine.begin() as conn:
    inspector = inspect(conn)
    if inspector.has_table("users"):
        columns = {column["name"] for column in inspector.get_columns("users")}
        if not LEGACY_USER_COLUMNS.issubset(columns):
            raise RuntimeError("The users table does not match the legacy schema; refusing migration.")

    for table in TABLES:
        if not inspector.has_table(table):
            continue
        user_id = next(
            (column for column in inspector.get_columns(table) if column["name"] == "user_id"),
            None,
        )
        if user_id is None:
            raise RuntimeError(f"{table} has no user_id column; refusing migration.")
        if isinstance(user_id["type"], String) and user_id["type"].length == 36:
            print(f"{table}.user_id already uses VARCHAR(36)")
            continue
        if not isinstance(user_id["type"], Integer):
            raise RuntimeError(f"{table}.user_id has an unexpected type; refusing migration.")
        count = conn.execute(text(f'SELECT COUNT(*) FROM "{table}"')).scalar_one()
        if count:
            raise RuntimeError(
                f"{table} contains {count} rows; review existing IDs before migrating."
            )
        conn.execute(
            text(f'ALTER TABLE "{table}" ALTER COLUMN user_id TYPE VARCHAR(36) USING user_id::text')
        )
        print(f"{table}.user_id migrated to VARCHAR(36)")
