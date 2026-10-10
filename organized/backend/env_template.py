"""Reference for environment variables required by the ByteSentry backend.

Copy the names and your own secret values into Codespaces Secrets or the
deployment environment. Do not commit real credentials to this file.
"""

REQUIRED_ENV = {
    "JWT_SECRET": "GENERATE_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS",
    "DATABASE_URL": "postgresql+psycopg2://USER:PASSWORD@HOST:5432/DATABASE",
    "Y3_API_KEY": "YOUR_Y3_API_KEY",
    "PAIRGATE_API_KEY": "YOUR_PAIRGATE_API_KEY",
    "PAYSTACK_KEY": "YOUR_PAYSTACK_SECRET_KEY",
}

OPTIONAL_ENV = {
    "Y3_BASE_URL": "https://y3data.com/api/v1",
    "FRONTEND_URL": "https://studious-tribble-vpr467w495xxfxqpr-5000.app.github.dev",
}

PAYSTACK_WEBHOOK_URL = (
    "https://studious-tribble-vpr467w495xxfxqpr-8000.app.github.dev/paystack/webhook"
)
