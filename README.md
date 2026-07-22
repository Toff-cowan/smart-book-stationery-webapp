# Smart Books Stationery and Supplies Ltd

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
- Optional seed vars: `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` (creates `owner`)
- Optional employee seed: `SEED_EMPLOYEE_EMAIL`, `SEED_EMPLOYEE_PASSWORD`
- Optional mail vars (customer status emails from the business Gmail):

```env
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=smartsbookstore24@gmail.com
MAIL_PASSWORD=your-gmail-app-password
MAIL_FROM=Smart Books Stationery and Supplies Ltd <smartsbookstore24@gmail.com>
BOOKSTORE_NOTIFY_EMAIL=smartsbookstore24@gmail.com
BOOKSTORE_PHONE=876-000-0000
FRONTEND_URL=http://localhost:3000
MAIL_LOGO_URL=https://your-cdn.example/logo.png
```

Use a Google **App Password** (not the normal Gmail password) with 2FA enabled.

Customer notify emails include order items, contact details, and a link to `/orders?order=<id>`. Set `FRONTEND_URL` to your live site URL and `MAIL_LOGO_URL` once you have a hosted logo.

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

Creates an owner user and sample books/stationery products. Set `SEED_EMPLOYEE_EMAIL` to also create an employee account (orders + inventory, no revenue).

Staff roles:
- `owner` — full admin portal (orders, inventory, revenue, registered users)
- `employee` — orders + inventory + notifications (no revenue or users list)

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

### Customer catalog & cart

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/products` | Browse; `?q=` search, `?category_id=` filter |
| GET | `/api/products/<id>` | Product detail |
| GET | `/api/products/categories` | Category list |
| GET | `/api/inventory` | Inventory browse; `?q=`, `?department=textbooks\|stationery\|gifts` |
| GET | `/api/inventory/<id>` | Inventory detail (includes avg `rating_stars` + `rating_count`) |
| GET | `/api/inventory/<id>/ratings` | List customer ratings |
| POST | `/api/inventory/<id>/ratings` | Customer rate/update: `{ stars: 1–5 }` (JWT) |
| DELETE | `/api/inventory/<id>/ratings` | Remove own rating (JWT) |
| GET | `/api/cart` | Current draft cart (auth) |
| POST | `/api/cart/items` | `{ product_id, quantity }` |
| PATCH | `/api/cart/items/<id>` | `{ quantity }` |
| DELETE | `/api/cart/items/<id>` | Remove line |
| POST | `/api/cart/checkout` | `{ fulfillment_type: "reserve"\|"pickup", notes? }` |

### Admin inventory (admin JWT only)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/admin/inventory` | All items including inactive; `?department=` |
| POST | `/api/admin/inventory` | Create: `{ name, price, quantity, department, author?, publisher?, description? }` (ratings are customer-only) |
| PATCH | `/api/admin/inventory/<id>` | Update any inventory fields |
| DELETE | `/api/admin/inventory/<id>` | Soft-delete (`is_active=false`) |

### Orders, share, notifications, messages

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/booklists/orders` | Previous / active orders |
| GET | `/api/booklists/orders/<id>` | Order status + items |
| POST | `/api/booklists/<id>/share` | Get share token |
| GET | `/api/booklists/shared/<token>` | Public shared list |
| GET | `/api/notifications` | Customer notifications |
| POST | `/api/notifications/<id>/read` | Mark one read |
| POST | `/api/messages` | Message the bookstore |
| GET | `/api/messages` | Conversation thread |
| GET | `/api/admin/orders` | All submitted orders (admin) |
| PATCH | `/api/admin/orders/<id>/status` | `{ status }` — `ready` / `completed` notify when ready; completed counts for best sellers |
| GET | `/api/inventory/bestsellers` | Top products by units sold on `ready` + `completed` orders |

### Tests

```bash
cd backend
pytest
```

Tests use an in-memory SQLite database (no Supabase required).

## Frontend (Next.js)

```bash
cd frontend
npm install
copy .env.example .env.local   # or: cp .env.example .env.local
npm run dev
```

Open http://localhost:3000 — redirects to `/catalog`.

Set `NEXT_PUBLIC_API_URL` to your Flask API (default `http://127.0.0.1:5000`). Keep the backend running separately.

Customer pages so far:

| Path | Notes |
|------|--------|
| `/` | Landing: photo carousel, upload booklist, featured products |
| `/booklist/scan` | Camera/OCR booklist → school/grade match → cart |
| `/catalog` | Filterable inventory grid (search + department) |
| `/catalog/[id]` | Detail: cover, rating, price, add to cart |
| `/login` | Register / sign in (JWT stored locally) |
| `/cart` | View draft cart |

Upload API: `POST /api/booklists/upload` (JWT optional, multipart `file`) — PDF/image/Word/TXT/CSV, max 8 MB.

Scan APIs:
- `POST /api/booklists/scan` — Gemini 2.5 Flash extracts titles/authors (EasyOCR fallback)
- `POST /api/booklists/match` — RapidFuzz match titles for a school/grade + return that list
- `POST /api/cart/items/bulk` — add selected books (JWT)

### Gemini free tier (recommended for scan)

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and create an API key
2. Add to `backend/.env`:

```env
GEMINI_API_KEY=your-ai-studio-key
GEMINI_MODEL=gemini-3.6-flash
```

(`gemini-2.5-flash` is retired for many new keys; use `gemini-3.6-flash` or `gemini-3.5-flash`.)
3. Restart Flask

If `GEMINI_API_KEY` is missing, scan falls back to EasyOCR.

OCR extras (fallback only):

```bash
cd backend
pip install easyocr opencv-python-headless rapidfuzz numpy pillow-heif
```

## Project status

- Backend: auth, inventory, cart/orders, share, notifications, messages, admin
- Frontend: customer catalog browse + product detail + add to cart
- Next: checkout UI, orders, ratings UI, admin screens
