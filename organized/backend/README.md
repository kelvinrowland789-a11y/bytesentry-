# ByteSentry

Everything is in the folder above (the website) and this folder (the server).

## Run
    cd backend
    pip install -r requirements.txt
    # set the environment variables listed in ENV_VARS.md first
    python migrate_legacy_user_ids.py
    uvicorn main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips="*"
Then open the separately served frontend on port 5000. The API is on port 8000. In Codespaces, forward both ports.
Tables are created automatically on first start. Subscription offers are stored and managed in PostgreSQL's
`bs_subscription_plans` table; they are not defined in `config.py`. The `profit_margin` table is also created
automatically and initialized to a markup of `1.15` if it has no configured row.

In a second terminal, start the frontend with:

    cd frontend
    python -m http.server 5000 --bind 0.0.0.0

The migration checks and adapts empty legacy business tables to UUID user IDs. It stops rather than changing
business tables that already contain rows; review those IDs before migrating them.

## Secrets you need (environment variables)
JWT_SECRET, DATABASE_URL, Y3_API_KEY, PAIRGATE_API_KEY, PAYSTACK_KEY (details in ENV_VARS.md).
Not secret: Y3_BASE_URL, FRONTEND_URL.
Paystack: set the webhook URL to the `webhook_url` value in `url.py` (`/paystack/webhook`).
Wallet funding is credited only after the signed `charge.success` webhook is received and the transaction is verified
with Paystack. The callback URL only returns the customer to the funding page.
Users can view their own payment records at `payments.html` and verify pending payments there. Webhook and manual
verification share an idempotent settlement path; pending payments cannot be deleted, and deleting a settled
payment removes only its history row, not the wallet ledger or credited balance.

## Subscriptions
Each database offer specifies its network, pack size, validity and price. Pack price is paid once; 1GB is
delivered immediately and each confirmed top-up sends another 1GB without charge. The recipient number can be
edited before each top-up; the confirmed number is saved for the next one. One live subscription per network
per user. Each 1GB drop still uses the live Y3 1GB plan with the pack's validity, cheapest first.

## Account activity and sessions
The landing page checks the existing HTTP-only login cookie and sends authenticated users to the dashboard.
The cookie/session expires after seven days, after which the user must log in again. Deleting a history item
removes only its transaction-history row; it does not reverse wallet ledger entries or deliveries.

## Test funds
    python add_funds.py someone@example.com 5000
