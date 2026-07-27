# Smart Books Stationery and Supplies Ltd

Web app for browsing stationery/books, building a priced **booklist**, and sharing it with the bookstore for offline fulfillment. **No online payments.**

## Stack

- **Backend:** Flask + SQLAlchemy + Flask-Migrate + JWT
- **Database:** [Supabase](https://supabase.com) (hosted PostgreSQL)
- **Frontend:** Next.js (App Router)
- **Deploy:** Vercel (frontend) + Render (API) + Supabase (DB)

## Deploy (Vercel + Render)

### Architecture

| Piece | Host | Notes |
|-------|------|--------|
| Next.js UI | [Vercel](https://vercel.com) | Root directory `frontend/` |
| Flask API | [Render](https://render.com) | Root directory `backend/` — see [render.yaml](render.yaml) |
| Postgres | Supabase | Same project as local; use pooler URI on Render |

Deploy order: **Render API first** → **Vercel** with that API URL → set Render `FRONTEND_URL` / `CORS_ORIGINS` to the Vercel URL.

### 1. Render (API)

**Option A — Blueprint (recommended)**

1. Push this repo to GitHub.
2. Render Dashboard → **New** → **Blueprint** → select the repo.
3. Confirm service `smart-book-api` from [render.yaml](render.yaml).
4. Fill secrets prompted by the blueprint (`sync: false` vars).

**Option B — Manual Web Service**

1. **New** → **Web Service** → this repo.
2. **Root Directory:** `backend`
3. **Build:** `pip install -r requirements.txt`
4. **Pre-deploy:** `FLASK_APP=app.app:app flask db upgrade`
5. **Start:** `gunicorn "app.app:app" --bind 0.0.0.0:$PORT --timeout 120 --workers 2`
6. **Health check path:** `/api/health`
7. Attach a **persistent disk** (1 GB+) at `/var/data/uploads` and set `UPLOAD_ROOT=/var/data/uploads`.

**Plan:** use at least **Starter** (paid). Free tier sleeps and makes booklist scan / cold starts unreliable. Prefer **`GEMINI_API_KEY`** in production so scans do not depend on EasyOCR model downloads.

**Required env vars**

| Variable | Example / notes |
|----------|-----------------|
| `DATABASE_URL` | Supabase **pooler** Postgres URI |
| `SECRET_KEY` | Long random string |
| `JWT_SECRET_KEY` | Long random string |
| `FRONTEND_URL` | `https://your-app.vercel.app` (set after Vercel deploy) |
| `CORS_ORIGINS` | Same as `FRONTEND_URL` (comma-separated if multiple) |
| `UPLOAD_ROOT` | `/var/data/uploads` (matches disk mount; local fallback only) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name (durable images) |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `GEMINI_API_KEY` | Google AI Studio key (strongly recommended) |
| `GEMINI_MODEL` | e.g. `gemini-3.6-flash` |

**Optional mail env vars:** `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM`, `BOOKSTORE_NOTIFY_EMAIL`, `BOOKSTORE_PHONE`, `MAIL_LOGO_URL`.

After deploy, confirm:

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

### 2. Vercel (frontend)

1. [Vercel](https://vercel.com) → **Add New** → **Project** → import the same GitHub repo.
2. **Root Directory:** `frontend` (Framework: Next.js).
3. Environment variable:

| Variable | Value |
|----------|--------|
| `NEXT_PUBLIC_API_URL` | `https://YOUR-SERVICE.onrender.com` (no trailing slash) |

4. Deploy. Note the `*.vercel.app` URL.

5. Back on Render, set `FRONTEND_URL` and `CORS_ORIGINS` to that Vercel URL (no trailing slash), then **Manual Deploy** the API once so CORS picks it up.

### 3. Post-deploy smoke tests

- [ ] `GET /api/health` returns OK
- [ ] Landing page loads on Vercel
- [ ] `/catalog` lists products (images resolve via `NEXT_PUBLIC_API_URL`)
- [ ] Register / login works
- [ ] Add to cart + checkout
- [ ] `/booklist/scan` (Gemini key set) extracts titles and matches
- [ ] Admin login + orders / inventory

### 4. Notes

- Uploaded product/carousel/avatar files are wiped on Render redeploy if they only live on local disk (`UPLOAD_ROOT` / `/api/uploads/...`).
- **Recommended:** set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` on Render. Admin image uploads go to Cloudinary; the returned `secure_url` is saved on the product/carousel/avatar row and survives redeploys. Re-upload existing images in the admin UI if they still point at `/api/uploads/...`.
- On Vercel, `NEXT_PUBLIC_API_URL` must be the Render URL (no trailing slash). If it is missing, the browser tries `http://127.0.0.1:5000` and images fail online.
- Custom domains can be added later in both Vercel and Render dashboards; update `FRONTEND_URL`, `CORS_ORIGINS`, and `NEXT_PUBLIC_API_URL` to match.
- Local env templates: [backend/.env.example](backend/.env.example), [frontend/.env.example](frontend/.env.example).

---

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
- `FRONTEND_URL` / `CORS_ORIGINS` — usually `http://localhost:3000` locally
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
CORS_ORIGINS=http://localhost:3000
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
- Frontend: customer catalog, booklist scan, cart, orders, admin portal
- Deploy: Vercel (UI) + Render (API) — see **Deploy** section above
