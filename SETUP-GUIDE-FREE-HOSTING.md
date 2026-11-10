# Free Hosting & Setup Guide
## Marathi literary website for Dr. Sadashiv Shriram Suryawanshi

> **Note:** This document was written during early planning and describes an
> older multi-service (Next.js + Vercel + Supabase Postgres) idea. The project
> was ultimately built as a **single Node.js + Express + EJS app** with SQLite /
> Turso. For the current, accurate setup and deployment steps, use
> [`README.md`](README.md). The free-service advice below (Render, Resend,
> backups, security habits) is still useful background.

This guide is for the **site owner / non-developer**. It explains, step by step, how to put the website online for **₹0/month** using free tiers.

> The OpenCode agent will build the code. You only need to create the accounts, copy the keys into the right places, and click "Deploy". Never paste secret keys into chat — put them in the local `.env` file or the hosting dashboard.

---

## 0. What you will end up with

| Piece | Service | Free tier (verify current limits) |
|---|---|---|
| Website (Next.js) | **Vercel Hobby** | Free for personal projects, HTTPS, global CDN |
| API / middleware (Node + Express) | **Render Free Web Service** | 512 MB RAM, spins down after ~15 min idle |
| Database (PostgreSQL) | **Supabase Free** | 500 MB DB, 1 GB file storage, 50k monthly users |
| Login / authentication | **Supabase Auth** | Included |
| Image storage | **Supabase Storage** | 1 GB included |
| Email notifications (optional) | **Resend Free** | 3,000 emails/month, 100/day |
| Spam protection (optional) | **Cloudflare Turnstile** | Free |
| Code hosting / backups | **GitHub Free** | Unlimited private repos, 2,000 Actions minutes/month |
| Domain | Vercel subdomain | `your-project.vercel.app` (free) |

**Total: ₹0/month.** A custom domain (e.g. `sadashivsuryawanshi.in`) is optional and costs roughly ₹700–1,200/year.

> ⚠️ Free tiers change over time. Check each provider's pricing page before launch. Avoid any service that demands a credit card for the free tier.

---

## 1. Fix this Windows PC first

Your machine currently has:

- Node.js **v26.13.0** (works, but LTS is safer)
- npm **11.20.0** (works via `cmd`, blocked in PowerShell by execution policy)
- **Git not installed**
- **pnpm not installed**

### 1.1 Allow npm in PowerShell (recommended)

Open **PowerShell** and run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Close and reopen the terminal. Then check:

```powershell
node --version
npm --version
```

If you prefer not to change the policy, always use `npm.cmd` instead of `npm`, or run commands in `cmd`.

### 1.2 Install Git for Windows

Option A — winget (Windows 10/11):

```powershell
winget install --id Git.Git -e --source winget
```

Option B — download the installer from <https://git-scm.com/download/win> and click through the defaults.

Close and reopen the terminal, then:

```powershell
git --version
```

### 1.3 Recommended: install Node.js 22 or 24 LTS

Node 26 is a current release, but the LTS line is better supported by Next.js, Prisma and hosting providers.

1. Download the **LTS** installer from <https://nodejs.org>.
2. Install it (it replaces the current Node).
3. Reopen the terminal and confirm `node --version`.

> If you do not want to change Node, the project can still work on Node 26 — but tell the agent so it can pin compatible versions.

### 1.4 Optional: pnpm

npm works fine. If you want faster installs:

```powershell
npm install -g pnpm
pnpm --version
```

---

## 2. Create a GitHub account and repository

1. Sign up at <https://github.com> (free).
2. Create a new **private** repository, e.g. `dadasahebwebsite`.
3. Do **not** initialise with a README if OpenCode will create the files.
4. Copy the repository URL.

OpenCode will run:

```powershell
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/dadasahebwebsite.git
git push -u origin main
```

> GitHub will ask for a **Personal Access Token** instead of a password. Create one at
> GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens.
> Give it access to this repository with "Contents: Read and write". Keep it private.

---

## 3. Create the Supabase project (database + login + storage)

1. Sign up at <https://supabase.com> (free, GitHub login is easiest).
2. **New project**:
   - Name: `dadasahebwebsite`
   - Database password: generate a strong one and save it in a password manager.
   - Region: **Mumbai / Singapore** (closest to Dhule).
3. Wait for the project to finish provisioning.

### 3.1 Copy the keys

Go to **Project Settings → API**. Copy:

| Key | Where it goes |
|---|---|
| Project URL | `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` / publishable key | `SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` — **server only, never in the browser** |

Go to **Project Settings → Database → Connection string**:

- Copy the **Connection pooling** URI (port 6543) → `DATABASE_URL`
- Copy the **Direct connection** URI (port 5432) → `DIRECT_URL`
- Replace `[YOUR-PASSWORD]` with the database password.

### 3.2 Run the schema

OpenCode will create SQL files in `supabase/migrations/` and `supabase/seed.sql`.

Easiest path: **Supabase Dashboard → SQL Editor → New query**, paste each file in order, and run. Or use the Supabase CLI if installed.

### 3.3 Create the storage bucket

**Storage → New bucket**:

- Name: `media`
- Public bucket: **yes** (public images, but only authenticated users can upload)
- File size limit: `5 MB`
- Allowed MIME types: `image/jpeg, image/png, image/webp, image/avif`

OpenCode will add the storage policies.

### 3.4 Configure authentication

**Authentication → Providers → Email**: enable.

**Authentication → URL Configuration**:

- Site URL: `http://localhost:3000` for now; change to your Vercel URL after deploy.
- Redirect URLs: add
  - `http://localhost:3000/**`
  - `https://your-project.vercel.app/**`

**Authentication → Settings**:

- Enable **Confirm email**.
- Set minimum password length to 8.
- Optionally enable **MFA (TOTP)** for the owner account.

### 3.5 Make yourself the owner

After you register your own account on the site, run this in the SQL Editor:

```sql
update public.profiles
set role = 'owner', status = 'active'
where id = (
  select id from auth.users where email = 'YOUR-EMAIL@example.com'
);
```

You can then promote trusted people to `admin` or `editor` from the dashboard.

---

## 4. Run the project locally

From the project folder:

```powershell
# install dependencies (npm workspaces)
npm install

# copy environment template and fill it in
copy .env.example .env

# generate Prisma client and apply migrations
npm run db:generate
npm run db:migrate

# seed demo content
npm run db:seed

# start frontend + API together
npm run dev
```

Typical local URLs:

- Frontend: <http://localhost:3000>
- API: <http://localhost:4000/api/health>

If the agent chose different scripts, follow its `README.md`.

---

## 5. Deploy the API to Render (free)

1. Sign up at <https://render.com> with GitHub.
2. **New → Web Service** → connect your repository.
3. Settings:
   - Name: `dadasaheb-api`
   - Root directory: `apps/api`
   - Runtime: **Node**
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
   - Instance type: **Free**
   - Health check path: `/api/health`
4. **Environment → Add environment variables** (server-side only):

```
NODE_ENV=production
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DATABASE_URL=...
DIRECT_URL=...
CORS_ORIGINS=https://your-project.vercel.app
RESEND_API_KEY=...            # optional
OWNER_EMAIL=...
TURNSTILE_SECRET_KEY=...      # optional
```

5. Click **Create Web Service** and wait for the first deploy.
6. Copy the URL, e.g. `https://dadasaheb-api.onrender.com`.
7. Test: open `https://dadasaheb-api.onrender.com/api/health` — it should return `{ "ok": true }`.

> **Cold starts:** Render's free service sleeps after ~15 minutes of inactivity. The first request after sleep can take 30–60 seconds. For a low-traffic literary site this is acceptable. If it becomes a problem, consider Koyeb's free tier or a paid $7/month instance later.

---

## 6. Deploy the website to Vercel (free)

1. Sign up at <https://vercel.com> with GitHub.
2. **Add New → Project** → import your repository.
3. Settings:
   - Framework preset: **Next.js**
   - Root directory: `apps/web`
   - Build command: `npm run build`
   - Output directory: `.next` (default)
4. **Environment Variables** (these are public, `NEXT_PUBLIC_*`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=https://dadasaheb-api.onrender.com
NEXT_PUBLIC_SITE_URL=https://your-project.vercel.app
NEXT_PUBLIC_TURNSTILE_SITE_KEY=...   # optional
```

5. Click **Deploy**.
6. Copy the production URL, e.g. `https://dadasaheb-website.vercel.app`.

### 6.1 Close the loop

1. In **Render**, update `CORS_ORIGINS` to include the Vercel URL and redeploy.
2. In **Supabase → Authentication → URL Configuration**, set the Site URL to the Vercel URL and add `https://your-project.vercel.app/**` to redirect URLs.
3. Visit the site, register, and promote yourself to `owner` (SQL in §3.5).

---

## 7. Optional: custom domain

1. Buy a domain from any registrar (Namecheap, GoDaddy, Hostinger, Cloudflare Registrar).
   A `.in` domain is usually ₹700–1,200/year.
2. **Vercel → Project → Settings → Domains → Add**.
3. Follow Vercel's DNS instructions at your registrar.
4. Update:
   - `NEXT_PUBLIC_SITE_URL`
   - `CORS_ORIGINS`
   - Supabase Site URL / redirect URLs
   - `EMAIL_FROM` (Resend requires a verified domain)

HTTPS is automatic on Vercel.

---

## 8. Optional free services

### 8.1 Resend — email notifications

1. Sign up at <https://resend.com>.
2. Create an API key.
3. Add `RESEND_API_KEY` to Render.
4. To send from your own domain, verify it in Resend → Domains (add the DNS records).
   Until then, use the Resend test address.

### 8.2 Cloudflare Turnstile — spam protection

1. Sign up at <https://dash.cloudflare.com> → Turnstile.
2. Add your domain (or use the test keys during development).
3. Copy the **site key** → Vercel env `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
4. Copy the **secret key** → Render env `TURNSTILE_SECRET_KEY`.

### 8.3 Cloudinary — extra image storage (only if needed)

Supabase's 1 GB is enough for a text-heavy literary site. If you upload many high-resolution event photos, Cloudinary's free tier can help. Not required at launch.

---

## 9. Backups (important on free tiers)

Supabase's free tier does **not** include automated daily backups. Set up a free backup:

1. Add a GitHub Actions workflow (OpenCode will provide `.github/workflows/backup.yml`) that runs weekly:
   - `pg_dump "$DIRECT_URL" --no-owner --no-privileges | gzip > backup.sql.gz`
   - Upload as a GitHub Actions artifact with 90-day retention.
2. Store the `DIRECT_URL` as a GitHub Actions secret.
3. Every few months, download a backup and keep it offline.

Also export a CSV of subscribers from the admin dashboard regularly.

---

## 10. Cost summary

| Item | Monthly cost |
|---|---|
| Vercel Hobby | ₹0 |
| Render Free | ₹0 |
| Supabase Free | ₹0 |
| GitHub Free | ₹0 |
| Resend Free (optional) | ₹0 |
| Turnstile (optional) | ₹0 |
| Domain (optional) | ~₹60–100/month equivalent |
| **Total without domain** | **₹0** |

Limits to watch:

- Supabase: 500 MB database, 1 GB storage, project pauses after ~1 week of inactivity (open the dashboard or send a request to wake it).
- Render: cold starts after idle; 750 instance hours/month.
- Vercel Hobby: personal/non-commercial use; if you add ads or sponsorship, review the plan.
- Resend: 100 emails/day.

---

## 11. What to give OpenCode — and what never to share

**Safe to share:**

- The public site name, tagline, bio, photos, book covers.
- Which social links to show.
- Your Vercel/Render/Supabase **project URLs** (not keys).
- Screenshots of errors with secrets hidden.

**Never paste in chat:**

- `SUPABASE_SERVICE_ROLE_KEY`
- Database password / `DATABASE_URL` with password
- Resend API key
- Turnstile secret key
- GitHub personal access token
- Any `.env` file contents

Put secrets directly into the `.env` file or the hosting dashboard.

---

## 12. Troubleshooting

| Problem | Fix |
|---|---|
| `npm.ps1 cannot be loaded` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or use `npm.cmd` / `cmd` |
| `git is not recognized` | Install Git for Windows and reopen the terminal |
| API returns CORS error | Add the exact frontend origin (no trailing slash) to `CORS_ORIGINS` on Render |
| Login redirects to localhost | Update Supabase Site URL and redirect URLs to the deployed domain |
| Images fail to upload | Check the `media` bucket exists, is public, and storage policies allow authenticated inserts |
| Render sleeps | Expected on free tier; wait 30–60 s for the first request |
| Supabase project paused | Open the Supabase dashboard and restore the project |
| Marathi text looks broken | Ensure UTF-8 encoding, the Devanagari font is loaded, and the DB is UTF8 |
| `prisma migrate` fails on Supabase | Use `DIRECT_URL` (port 5432) for migrations, `DATABASE_URL` (pooler, 6543) at runtime |

---

## 13. Go-live checklist

- [ ] Supabase schema, RLS policies, storage bucket, and seed data applied.
- [ ] Owner account promoted to `role = 'owner'`.
- [ ] Render API healthy at `/api/health`.
- [ ] Vercel site loads over HTTPS.
- [ ] CORS and Supabase redirect URLs point to the live domain.
- [ ] Register → verify email → contributor sees "pending approval".
- [ ] Admin approves contributor → contributor submits a post → admin publishes.
- [ ] Marathi and Ahirani text render correctly on a phone.
- [ ] Contact form and Turnstile work.
- [ ] `sitemap.xml`, `rss.xml`, `robots.txt` load.
- [ ] No secret keys in the browser bundle.
- [ ] Weekly backup workflow runs.
- [ ] Owner has the admin walkthrough document.

---

## 14. Routine maintenance (15 minutes a month)

1. Open the Supabase dashboard so the free project does not pause.
2. Check Render logs for errors.
3. Approve pending contributors and posts.
4. Export subscribers CSV.
5. Download the latest database backup.
6. Update dependencies (`npm outdated`) and redeploy — ask OpenCode to handle this.
7. Check the contact inbox and spam comments.
