# Smart Book Stationery

Web app for browsing stationery/books, building a priced **booklist**, and sharing it with the bookstore for offline fulfillment. **No online payments.**

## Stack

- **Backend:** Flask + SQLAlchemy + Flask-Migrate + JWT
- **Database:** [Supabase](https://supabase.com) (hosted PostgreSQL)
- **Frontend:** Next.js (planned)

## Backend setup

### 1. Create a Supabase project

1. Create a project at https://supabase.com
2. Open **Project Settings → Database**
3. Copy the Postgres connection URI
4. Use the **direct** connection for migrations; the **pooler** URI is fine for the running API

### 2. Configure environment

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
# source venv/bin/activate

pip install -r requirements.txt
copy .env.example .env   # or: cp .env.example .env
```

Edit `.env` and set:

- `DATABASE_URL` — Supabase Postgres URI
- `SECRET_KEY` / `JWT_SECRET_KEY` — long random strings
- Optional seed vars: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`

### 3. Run migrations

From the `backend` directory:

```bash
set FLASK_APP=app.app:app
flask db upgrade
```

(On PowerShell: `$env:FLASK_APP = "app.app:app"`)

If this is a fresh clone and `migrations/` already exists, `upgrade` applies pending revisions. To generate a new migration after model changes:

```bash
flask db migrate -m "describe change"
flask db upgrade
```

### 4. Seed sample data

```bash
python seed.py
```

Creates an admin user and sample books/stationery products.

### 5. Run the API

```bash
python -m app.app
# or: flask run
```

Health check: `GET http://127.0.0.1:5000/api/health`

### Auth endpoints

| Method | Path | Notes |
|--------|------|--------|
| POST | `/api/auth/register` | `{ name, email, password }` |
| POST | `/api/auth/login` | returns JWT `token` |
| GET | `/api/auth/me` | `Authorization: Bearer <token>` |

### Tests

```bash
cd backend
pytest
```

Tests use an in-memory SQLite database (no Supabase required).

## Project status

- Phase 0–1: foundation, models, DB-backed auth, seed, tests
- Next: products API, booklist submit/share, bookstore admin, Next.js UI
