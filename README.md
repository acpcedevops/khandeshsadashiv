# डॉ. सदाशिव सुर्यवंशी — मराठी साहित्य संकेतस्थळ

A free-hosted Marathi literary website and multi-author blogging platform for
**प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी** (Dhule) — Marathi writer, ghazal poet,
Ahirani language activist, and National President of Khandesh Sahitya Sangh.

The site publishes news and achievements, showcases books, events, gallery and
press mentions, and lets approved contributors submit articles, poems and
ghazals in Marathi or Ahirani. Everything is reviewed by the owner before it
goes live.

- **Stack:** Node.js + Express 5 + EJS (server-rendered)
- **Database:** SQLite locally (`node:sqlite`) / Turso (libSQL) in production
- **Images:** local `public/uploads` in dev / Supabase Storage in production
- **Email:** optional Resend integration
- **Cost:** ₹0/month on free tiers (single Render web service)

---

## 1. Quick start (local)

Requirements: **Node.js 22.5+** (uses the built-in `node:sqlite` module).

```powershell
# 1. Install dependencies
npm install

# 2. Create your environment file
copy .env.example .env

# 3. Start the server (creates + seeds data/app.db on first run)
npm start
```

Open <http://localhost:3000>.

> **Windows / PowerShell note:** if `npm` is blocked by the execution policy,
> either run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, or use
> `npm.cmd` / run the command from `cmd`.

### Default development accounts

| Role | Email | Password | State |
|---|---|---|---|
| Owner / Admin | `owner@example.com` | `Owner@12345` | active |
| Contributor | `writer@example.com` | `Writer@12345` | pending approval |

Change these before going live (see [§6 Security](#6-security-checklist)).

The database and seed content are created automatically on first start. To
reset to a clean seeded state, stop the server and delete `data/app.db*`
(`app.db`, `app.db-wal`, `app.db-shm`), then start again.

### Useful scripts

```powershell
npm start      # start the server
npm run dev    # start with --watch (auto-restart on file changes)
npm run seed   # seed an empty database (no-op if already seeded)
npm test       # run unit tests (node:test)
```

---

## 2. What's included

### Public site
- **Home** — configurable sections (hero, latest news, featured writing, latest
  literature, poem spotlight, timeline, books, events, newsletter) that can be
  reordered from the admin panel.
- **News & achievements** — news/achievement posts with dates, sources, pinning
  and reordering.
- **Writings** — articles, poems, ghazals and stories, filterable by type and
  language (Marathi / Ahirani / Hindi / English).
- **Post pages** — Markdown rendering, reading time, view counter, tags,
  previous/next navigation, related posts, and moderated comments. Poems keep
  their line breaks.
- **About, Books, Events, Gallery, Press mentions, Contact, Search.**
- **RSS (`/rss.xml`), sitemap (`/sitemap.xml`) and `robots.txt`.**
- Marathi UI, Devanagari typography, responsive layout, and SEO meta tags.

### Contributor dashboard (`/dashboard`)
- Register → account stays **pending** until the owner approves it.
- Write and preview Markdown, upload a cover image, save drafts.
- Submit for review; track status (`draft → pending_review → approved/published`,
  plus `changes_requested` / `rejected`).
- Edit profile, pen name, bio, city, phone and social links.
- In-app notifications for approvals, feedback and comments.

### Admin panel (`/admin`)
- Dashboard with content, user, comment, subscriber and message statistics.
- Review queue: approve, request changes, reject, publish, schedule.
- Quick actions: feature / pin / reorder content.
- User management: approve, reject, change role, enable auto-publish.
- Comment moderation, contact messages, newsletter subscribers.
- Books, events, media mentions, and gallery album/photo CRUD.
- Site settings (identity, contact, social links, homepage quote, feature
  toggles, content length limits) and homepage section reordering.
- Audit log of administrative actions.
- Optional owner/contributor email notifications via Resend.

### API (read-only, rate-limited)
- `GET /api/posts` — published posts (`?type=`, `?language=`, `?page=`, `?limit=`).
- `GET /api/posts/:slug` — a single published post.
- `GET /api/health` — health check.

---

## 3. Project structure

```
src/
  index.js            Express wiring, middleware order, startup, error handling
  config.js           Environment configuration
  db/
    index.js          SQLite (local) / Turso (production) adapter
    schema.sql        Full schema
    seed.js           Seed data and default accounts
  lib/
    auth.js           bcrypt password hashing, JWT session cookies, role guards
    csrf.js           Double-submit CSRF protection
    email.js          Resend integration (optional)
    flash.js          One-shot flash messages
    helpers.js        Dates, numbers, slugs, pagination, formatting
    markdown.js       Markdown → sanitized HTML, reading time, excerpts
    notifications.js  In-app notifications and audit logging
    posts.js          Shared post SQL, validation, slug/status logic
    scheduler.js      Publishes scheduled posts
    settings.js       Settings defaults and cache
    storage.js        Multer upload + local/Supabase storage
  routes/
    public.js         Public pages, search, comments, newsletter, RSS/sitemap
    auth.js           Register, login, logout, password reset, verification
    dashboard.js      Contributor dashboard and post editor
    admin.js          Admin dashboard, moderation and content CRUD
    api.js            Read-only JSON API
views/                EJS templates (public, auth, dashboard, admin, partials)
public/               CSS, JS, favicon, images, local uploads
data/                 Local SQLite database (generated, git-ignored)
```

### Content workflow

```
draft ──submit──▶ pending_review ──approve──▶ approved ──(publish)──▶ published
                         │
                         ├──request changes──▶ changes_requested ──resubmit──▶ pending_review
                         └──reject───────────▶ rejected
```

- Contributors can never publish directly unless an admin enables
  **auto-publish** on their account.
- Posts with a future `publish_at` are published automatically by the scheduler
  (runs every 5 minutes).

---

## 4. Environment variables

Copy `.env.example` to `.env` and fill in only what you need. Local development
works with the defaults.

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Local port (default `3000`) |
| `SITE_URL` | Public URL used in RSS, sitemap, emails |
| `JWT_SECRET` | Long random string (32+ chars) for session cookies |
| `TURSO_DATABASE_URL` | Turso URL; empty = local SQLite |
| `TURSO_AUTH_TOKEN` | Turso auth token |
| `SUPABASE_URL` | Supabase project URL (image storage) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server only) |
| `SUPABASE_BUCKET` | Storage bucket name (default `media`) |
| `RESEND_API_KEY` | Resend API key (optional email) |
| `EMAIL_FROM` | Sender address (must be verified in Resend) |
| `OWNER_EMAIL` | Where owner notifications are sent |
| `SEED_OWNER_EMAIL` | Seed owner login |
| `SEED_OWNER_PASSWORD` | Seed owner password |
| `MAX_UPLOAD_MB` | Maximum image upload size (default `5`) |

Never commit `.env` or paste secret keys into chat/issues.

---

## 5. Free deployment (Render + Turso + Supabase)

The whole app runs as **one free Render web service**. Because Render's free
filesystem is ephemeral, production must use a remote database and remote image
storage.

### 5.1 Database — Turso (free)

1. Sign up at <https://turso.tech> and create a database.
2. Copy the database URL and create an auth token:
   ```powershell
   turso db show <db-name> --url      # libsql://...
   turso db tokens create <db-name>
   ```
3. In Render, set:
   - `TURSO_DATABASE_URL` — replace the `libsql://` prefix with `https://`
   - `TURSO_AUTH_TOKEN` — the token you created

The same SQLite schema is applied automatically on first start.

### 5.2 Image storage — Supabase (free)

1. Sign up at <https://supabase.com> and create a project.
2. **Storage → New bucket** named `media`, **public**.
3. In Render, set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only)
   - `SUPABASE_BUCKET=media`

If these are left empty in production, uploads are written to the ephemeral
filesystem and will be lost on redeploy.

### 5.3 Email — Resend (optional, free)

1. Sign up at <https://resend.com> and create an API key.
2. Verify your sending domain, or use the Resend test sender during trials.
3. In Render, set `RESEND_API_KEY`, `EMAIL_FROM` and `OWNER_EMAIL`.

Without these variables the site still works; emails are simply skipped.

### 5.4 Deploy on Render

The repository includes `render.yaml`, a Render Blueprint for a free Node web
service.

1. Push the project to a GitHub repository.
2. In Render: **New → Blueprint** and select the repo (or create a **Web
   Service** manually with build `npm install` and start `npm start`).
3. Fill in the environment variables listed in §5.1–5.3, plus:
   - `NODE_ENV=production`
   - `SITE_URL=https://your-service.onrender.com`
   - `JWT_SECRET` — a long random value
   - `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` — your real owner login
4. Deploy, then open the site and log in at `/login`.

> **Cold starts:** Render's free tier sleeps after ~15 minutes idle; the first
> request afterwards can take 30–60 seconds. This is normal.

### 5.5 First-run checklist

- [ ] Home page loads over HTTPS.
- [ ] Owner can log in and reach `/admin`.
- [ ] Change the seed owner password immediately.
- [ ] Register a test contributor → approve from `/admin/users`.
- [ ] Submit a post as the contributor → approve from `/admin/posts`.
- [ ] Upload an image and confirm it is stored in Supabase.
- [ ] Check `/rss.xml`, `/sitemap.xml`, `/robots.txt`.
- [ ] Replace sample ("नमुना") books, events and gallery items with real content.
- [ ] Confirm Marathi/Ahirani text renders correctly on a phone.

### 5.6 Backups

Turso keeps point-in-time history on paid plans. On the free tier, periodically
export the database:

```powershell
turso db shell <db-name> ".dump" > backup.sql
```

Also export newsletter subscribers as CSV from the admin panel.

### 5.7 Deploy on Vercel (alternative to Render)

Vercel runs the app as a single serverless function using its zero-config
Express support. The root `index.js` is the entry point; `vercel.json` bundles
the EJS views and `schema.sql` into that function.

> **Vercel's filesystem is read-only and ephemeral.** A remote database
> (Turso) is mandatory — the app returns a clear 500 error if
> `TURSO_DATABASE_URL` is missing.

1. Create the Turso database (§5.1) and copy the `libsql://` URL + token.
2. Deploy:
   ```powershell
   npm i -g vercel
   vercel login
   vercel --prod
   ```
   Or import the GitHub repository at <https://vercel.com/new>.
3. Add these environment variables in **Project → Settings → Environment
   Variables** (Production and Preview):
   - `NODE_ENV=production`
   - `SITE_URL=https://your-project.vercel.app`
   - `JWT_SECRET` — a long random value
   - `TURSO_DATABASE_URL` — the `libsql://` URL (the app converts it to `https://`)
   - `TURSO_AUTH_TOKEN`
   - `SEED_OWNER_EMAIL` / `SEED_OWNER_PASSWORD` — your real owner login
   - optional: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`,
     `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_EMAIL`
4. Redeploy so the variables take effect, then log in at `/login`.

Notes specific to Vercel:

- `express.static()` is ignored; files in `public/` are served by Vercel's CDN.
  Because of that, **image uploads require Supabase** (§5.2) — files written to
  `public/uploads` at runtime are not persisted or served.
- The in-process scheduler does not run on serverless; scheduled publishing is
  applied when a page is requested.
- Request bodies are limited to ~4.5 MB, so keep `MAX_UPLOAD_MB` at 4 or lower.
- Pre-seed the remote database from your machine (optional, faster first load):
  ```powershell
  $env:TURSO_DATABASE_URL="libsql://..."; $env:TURSO_AUTH_TOKEN="..."; node scripts/seed-remote.js
  ```

---

## 6. Security checklist

- [ ] Set a strong, unique `JWT_SECRET` in production.
- [ ] Change `SEED_OWNER_PASSWORD` before the first production start.
- [ ] Keep `SUPABASE_SERVICE_ROLE_KEY`, `TURSO_AUTH_TOKEN` and `RESEND_API_KEY`
      server-side only.
- [ ] Serve the site over HTTPS (Render provides this automatically).
- [ ] Review contributor accounts before approving them.
- [ ] Keep dependencies updated (`npm audit`, `npm outdated`).

Built-in protections:

- bcrypt password hashing (cost 12).
- JWT session in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in production).
- CSRF double-submit cookie on all state-changing forms.
- Helmet security headers and a Content Security Policy.
- Rate limiting on login, forms and the API.
- Parameterized SQL queries.
- Markdown is sanitized before rendering.
- Role-based access control (`owner`, `admin`, `editor`, `contributor`, `reader`).
- Audit log of administrative actions.

---

## 7. Notes on content

Sample posts, books, events and gallery images in the seed are explicitly
labelled **"नमुना"** (sample) so they are never mistaken for real works or
events. Replace them with verified content from the admin panel.

Biographical facts on the site were compiled from public sources. The
"Marathi Sahitya Sammelan member" detail is marked `[TO CONFIRM]` in the
research notes until the owner verifies it.

---

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| `npm.ps1 cannot be loaded` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd` / `cmd` |
| `Cannot find module 'node:sqlite'` | Use Node.js 22.5+ (LTS recommended) |
| Home page shows a 500 error | Check the server console; usually a missing view include or DB migration |
| Login redirects but stays logged out | Make sure cookies are enabled; in production confirm HTTPS and `SITE_URL` |
| Uploads disappear after redeploy | Configure Supabase storage env vars (Render's disk is ephemeral) |
| Emails are not sent | Set `RESEND_API_KEY` and verify `EMAIL_FROM` |
| Render sleeps | Expected on the free tier; wait 30–60 s |
| Marathi text looks broken | Ensure UTF-8 and that the Devanagari font loads |

---

## 9. License

MIT. Content and photographs belong to their respective owners.
