# Environment variables (read with os.getenv, set them wherever you set the rest, e.g. Codespaces secrets)

## Secrets
| Name | What it is |
|---|---|
| JWT_SECRET | signs login cookies, 32+ characters (`python -c "import secrets; print(secrets.token_urlsafe(48))"`) |
| DATABASE_URL | your database address, includes the DB password (e.g. postgresql+psycopg2://user:PASSWORD@host:5432/db) |
| Y3_API_KEY | Y3 data key |
| PAIRGATE_API_KEY | Pairgate airtime key |
| PAYSTACK_KEY | Paystack secret key (initializes/verifies payments and validates webhook signatures) |

## Not secret
| Name | What it is |
|---|---|
| Y3_BASE_URL | defaults to https://y3data.com/api/v1 |
| FRONTEND_URL | additional public origin allowed to make credentialed browser requests to the API; `https://bytesentry.netlify.app` is allowed by default |

For the deployed frontend, set `FRONTEND_URL=https://bytesentry.netlify.app` in the backend deployment environment. Localhost and GitHub Codespaces origins remain allowed for testing.

The Paystack webhook URL is configured in `url.py` as `webhook_url`; set this exact public URL in the
Paystack dashboard. The matching route path is `webhook_path`.
`env_template.py` lists the backend variable names and known non-secret defaults; replace its placeholders
with your own secrets in Codespaces or your deployment settings. Do not commit real secrets to that file.
