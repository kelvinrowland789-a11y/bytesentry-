"""Application settings and database-backed pricing configuration."""

from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from models import ProfitMargin


class PricingConfigurationError(RuntimeError):
    pass


def get_markup(db: Session) -> Decimal:
    row = db.query(ProfitMargin).filter(ProfitMargin.margin_id == 1).one_or_none()
    if row is None:
        raise PricingConfigurationError("No pricing margin is configured in the database.")
    try:
        markup = Decimal(str(row.margin))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise PricingConfigurationError("The database pricing margin is invalid.") from exc
    if not markup.is_finite() or markup <= 0:
        raise PricingConfigurationError("The database pricing margin must be greater than zero.")
    return markup


# Each subscription's 1GB delivery uses a live Y3 plan with the configured validity.
DROP_GB = 1

AIRTIME_MIN, AIRTIME_MAX = 50, 50000
AIRTIME_DISCOUNT_PCT = {}   # e.g. {"MTN": 2}; empty = no discount
