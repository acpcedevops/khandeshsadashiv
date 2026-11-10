# MASTER BUILD PROMPT — Marathi Literary Website & Multi-Author Platform
## For: प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी (Prof. Dr. Sadashiv Shriram Suryawanshi), Dhule

> **How to use this file:** Open OpenCode in an empty project folder and paste everything from
> `## 1. MISSION` onward as your instruction. Or simply tell OpenCode:
> *"Read `PROMPT-FOR-OPENCODE.md`, `RESEARCH-NOTES.md` and `SETUP-GUIDE-FREE-HOSTING.md` in this folder and execute the build prompt phase by phase. Ask me for credentials and missing content before deploying."*
>
> The human (site owner) will supply free-tier account credentials and real content/photos.
> **Never invent facts about the person.** Use `[TO CONFIRM]` markers where information is not verified.

---

## 1. MISSION

Build a **production-ready, Marathi-first personal literary website + multi-author blogging platform + admin CMS** for Prof. Dr. Sadashiv Shriram Suryawanshi of Dhule, Maharashtra — a Marathi writer, ghazal poet, Ahirani-language activist, professor, and office-bearer of Khandesh Sahitya Sangh.

The site must:

1. Present his **profile, books, achievements, news and media coverage** in an elegant, credible way.
2. Let **invited contributors** (friends, colleagues, fellow writers) register, write **Marathi / Ahirani / English** blogs and poems, and submit them.
3. Require the **owner's approval** before any contributor post is published.
4. Give the owner a **dynamic admin dashboard** to publish, reorder, edit, schedule, feature and archive news/achievements/blogs — with a fixed, website-friendly content size and live preview.
5. Run entirely on **free and open-source software** and **free hosting tiers** (no recurring cost), with **Node.js + Express** as the middleware/API and a free database.

The result must be fast, mobile-first, accessible, SEO-friendly for Marathi, and easy for a non-technical owner to run.

---

## 2. OWNER PROFILE — VERIFIED FACTS FOR SEED CONTENT

Use these facts for the initial "About" page and seed data. Do **not** embellish or invent awards, dates, book titles, or designations.

| Field | Value |
|---|---|
| Marathi name | प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी |
| English name | Prof. Dr. Sadashiv Shriram Suryawanshi |
| City | Dhule (धुळे), Maharashtra, India |
| Address | 25-A, समृद्धनगर, केलेनगरजवळ, नकाणे रोड, देवपूर, धुळे ४२४००२ |
| Mobile | +91 94053 71313 |
| Email | suryawanshisadashiv643@gmail.com |
| Profession | Professor (प्रा.) and doctorate holder (डॉ.) |
| Literary identity | Marathi writer, ghazal poet (गझलकार), Ahirani-language writer and activist |
| Key position | National / Central President (राष्ट्रीय अध्यक्ष / केंद्रीय अध्यक्ष), **Khandesh Sahitya Sangh** (खान्देश साहित्य संघ) |
| Ahirani movement | Active office-bearer / speaker associated with the **Akhil Bharatiya Ahirani Sahitya Sammelan** (अखिल भारतीय अहिराणी साहित्य संमेलन), including the 6th edition at Dhule |
| Public voice | Advocates for Marathi and Maharashtra's dialects; has spoken against Hindi imposition and for protection of Ahirani and sister dialects |
| Other association | Speaker at Maratha Seva Sangh events (e.g., 36th anniversary lecture, Dhule) |
| Public profiles | Facebook: "Dr. Sadashiv Suryawanshi" · YouTube: literary/Ahirani videos · Marathisahityik (साहित्यिक कोश) listing |
| Stated by owner, needs verification | Membership / role in the **Akhil Bharatiya Marathi Sahitya Sammelan** → mark `[TO CONFIRM]` |

**Rules:**
- Display contact details only after the owner confirms they should be public. Store them in the `settings` table so they can be changed without code.
- Any claim not in the table above must be written as `[TO CONFIRM]` in seed content and hidden from public pages until the owner approves it.
- Do not copy long passages from newspapers. Summarise in original Marathi and link to the source.
- Keep a `sources` field for every seeded news/achievement item.

---

## 3. NON-GOALS / HARD CONSTRAINTS

- ❌ No paid services, paid plugins, paid themes, or paid fonts.
- ❌ No fabricated biography, awards, book list, event dates, or news.
- ❌ No plaintext passwords. Authentication must be delegated to Supabase Auth.
- ❌ No secret keys in the browser bundle. The Supabase **service-role key** must exist only on the Express server.
- ❌ No destructive database operation without explicit human confirmation.
- ❌ No lorem ipsum on public pages. Use real Marathi sample text or clearly labelled demo content.
- ❌ No machine-translated English passed off as Marathi. Marathi copy must read naturally.

---

## 4. USERS, ROLES & PERMISSIONS

| Role | Who | Can do |
|---|---|---|
| `visitor` | Anyone | Read published content, search, comment (if enabled), subscribe, contact |
| `reader` | Optional public account | Everything a visitor can + bookmark/like/comment |
| `contributor` | Invited/registered writer | Create/edit own drafts, submit for review, see review status, edit profile |
| `editor` | Trusted reviewer | Review submissions, edit any post, publish, manage comments |
| `admin` | Owner's delegate | Everything except change owner/billing; manage users, content, media, settings |
| `owner` | Dr. Suryawanshi | Full control, including promoting admins and changing site settings |

**Account status:** `pending` → `active` → `suspended`.
**Two approval gates (both required by default):**
1. **Account approval** — a new contributor account stays `pending` until an admin activates it.
2. **Post approval** — every contributor submission stays `pending_review` until an admin publishes it.

Admins can mark a trusted contributor as `auto_publish = true` later, but this must be an explicit toggle, off by default.

---

## 5. INFORMATION ARCHITECTURE (SITEMAP)

### Public
```
/                             मुख्यपृष्ठ (Home)
/about                        परिचय (Biography, timeline, positions)
/books                        पुस्तके (Published works)
/writings                     साहित्य (All articles/poems; filters)
/writings/[slug]              Single article/poem
/writings/category/[slug]     Category listing
/writings/tag/[slug]          Tag listing
/writings/author/[slug]       Public contributor profile
/news                         बातम्या व कामगिरी (News & achievements)
/news/[slug]                  Single news item
/events                       कार्यक्रम (Upcoming & past events)
/gallery                      छायाचित्र दालन (Photo albums)
/media                        माध्यम (Press clippings, interviews, videos)
/contact                      संपर्क
/search                       शोध
/login                        लॉगिन
/register                     नोंदणी (Contributor signup)
/forgot-password              पासवर्ड विसरलात?
/reset-password               नवीन पासवर्ड
/terms                        अटी व शर्ती
/privacy                      गोपनीयता धोरण
/copyright                    कॉपीराइट व परवाना
/contributor-guidelines       लेखक मार्गदर्शक तत्त्वे
/rss.xml                      RSS feed
/sitemap.xml                  Sitemap
/robots.txt                   Robots
```

### Contributor area (auth required)
```
/dashboard                    माझे डॅशबोर्ड (overview)
/dashboard/posts              माझे लेख (list + status)
/dashboard/posts/new          नवीन लेख
/dashboard/posts/[id]/edit    Edit draft / view rejection reason
/dashboard/profile            माझी माहिती (bio, photo, pen name, social links)
```

### Admin area (role: editor/admin/owner)
```
/admin                        Overview: pending reviews, recent activity, quick stats
/admin/posts                  All content (filter by status/type/language/author)
/admin/posts/new              Create post/news/achievement
/admin/posts/[id]/edit        Edit + revision history
/admin/review                 Approval queue (account + post)
/admin/users                  Users, roles, account status
/admin/categories             Categories & tags
/admin/homepage               Homepage composer (order sections, feature/pin items)
/admin/books                  Books CRUD
/admin/events                 Events CRUD
/admin/gallery                Albums & photos
/admin/media                  Media library
/admin/comments               Comment moderation
/admin/subscribers            Newsletter subscribers + export CSV
/admin/settings               Site settings (name, tagline, contact, social, SEO, toggles)
/admin/audit                  Audit log
```

---

## 6. FEATURE REQUIREMENTS

### 6.1 Public website

**Home (`/`)**
- Hero: portrait/logo, Marathi name, English name, one-line identity ("मराठी लेखक · गझलकार · अहिराणी भाषा अभियंता"), primary CTA ("परिचय वाचा", "साहित्य वाचा").
- **Latest news / achievements** strip or cards (requirement #1). Newest first, with date, category badge and optional image.
- Featured article + latest writings grid.
- Featured poem block (preserve line breaks, elegant typography).
- Category chips: कविता, कथा, ललित, समीक्षा, गझल, अहिराणी, हास्य, प्रवास, पुस्तक परीक्षण.
- Achievements timeline preview (last 3–5).
- Books carousel.
- Upcoming events.
- "आजची ओळ" (quote of the day) — editable from settings.
- Newsletter signup + social links.
- Language switcher: मराठी / अहिराणी / English (UI strings localised; content language is per-post).

**About (`/about`)**
- Long-form biography (Marathi first, optional English).
- Portrait and press-kit download (high-res photo + short bio PDF).
- Timeline of milestones and positions.
- "सन्मान व पुरस्कार" list (only verified items; otherwise hidden).
- Positions held (Khandesh Sahitya Sangh, Ahirani Sammelan, etc.).
- Media mentions with outbound links.

**Writings (`/writings`)**
- Card grid/list toggle.
- Filters: type (article/poem/ghazal/story), language (Marathi/Ahirani/English), category, tag, author, year.
- Search with Devanagari support.
- Sort: newest, oldest, most read, featured.
- Pagination or "load more".
- Empty state in Marathi.

**Single writing (`/writings/[slug]`)**
- Title, author card, date, reading time, language badge, category, tags.
- Cover image with alt text.
- Rich content renderer: headings, lists, blockquotes, images with captions, links, code (rare), poem block, pull quote.
- For poems: preserve every line break, no justified text, comfortable measure (~65ch), optional audio recitation player.
- Share bar: WhatsApp, Facebook, X, copy link, native share.
- Print/PDF-friendly stylesheet for poems.
- Related posts (same category/tags).
- Comments (if enabled) with moderation.
- Prev/next navigation.
- JSON-LD `Article`/`CreativeWork` + breadcrumbs.

**News & achievements (`/news`)**
- Chronological feed with year grouping.
- Filters: award, event, media, book release, appointment, other.
- Each item: title, date, short body, image, source link.
- Admin can pin up to 3 items to the homepage.

**Events (`/events`)**
- Upcoming and past tabs.
- Event detail with date/time, venue, map link, description, gallery.
- Optional "Add to calendar" (.ics download).

**Gallery (`/gallery`)**
- Albums → photo grid → lightbox.
- Alt text and captions in Marathi.
- Lazy loading.

**Media (`/media`)**
- Press clippings (image + publication + date + external link).
- Video embeds (YouTube, privacy-friendly lazy embed).
- Interviews and reviews.

**Contact (`/contact`)**
- Form: name, email, subject, message, honeypot, Cloudflare Turnstile (free).
- Rate-limited. Stores message in DB and emails the owner (if Resend configured).
- Address, phone, email, social links, embedded map (optional, privacy-friendly).

**Global**
- Header, footer, breadcrumbs, skip-to-content link.
- 404 and 500 pages in Marathi.
- Cookie/consent notice only if analytics/cookies are used.
- Print styles.
- Dark mode (optional, respects system preference).

### 6.2 Contributor portal

- **Register:** name, email, password, pen name (optional), city, short bio, preferred language. Email verification via Supabase Auth.
- After verification, account is `pending`; show a friendly Marathi message: "आपली नोंदणी झाली आहे. डॉ. सुर्यवंशी यांच्या मंजुरीनंतर आपण लेख पाठवू शकता."
- **Dashboard:** counts by status, recent posts, profile completeness.
- **Create post:** title, type (article/poem/ghazal/story/news? — contributors cannot create official news), language, category, tags, excerpt, cover image, body editor.
- **Fixed-size, website-friendly content (requirement #3):**
  - Title ≤ 90 characters (live counter).
  - Excerpt ≤ 220 characters (auto-generated from body if empty).
  - Body ≤ 12,000 characters (configurable in settings), with word/character counter.
  - Cover image recommended 1200×630, max 5 MB, JPG/PNG/WebP.
  - Live preview at desktop/tablet/mobile widths.
  - "हे मजकुराच्या मर्यादेत आहे" validation before submit.
- **Submit for review:** status → `pending_review`; contributor cannot publish.
- **Status view:** draft / pending review / changes requested / approved / published / rejected, with admin's reason.
- **Edit own draft or changes-requested post.** Editing a published post creates a revision and sends it back to review (configurable).
- **Profile:** photo, bio, pen name, social links, language preference.
- **Notifications:** in-app bell + email on approval/rejection/changes requested.

### 6.3 Admin dashboard (requirement #3)

- **Overview:** pending account requests, pending post reviews, published this month, top posts, recent audit entries.
- **Review queue:** side-by-side preview; actions: Approve & publish, Approve & schedule, Request changes, Reject (reason required).
- **Content CRUD:** create/edit/delete/duplicate/publish/unpublish/schedule/archive for posts, news, achievements, books, events, gallery.
- **Dynamic homepage composer:**
  - Reorder sections by drag-and-drop (Hero, News, Featured, Latest, Poem, Timeline, Books, Events, Newsletter).
  - Toggle section visibility.
  - Pin/feature up to N items per section.
  - Reorder pinned items.
  - Changes take effect immediately (or on "Publish layout").
- **Scheduling:** set `publish_at`; a scheduled job (or on-read guard) publishes when due.
- **Revision history:** every edit stores a revision; admin can view and restore.
- **Users:** approve/suspend accounts, change roles, reset password link, toggle `auto_publish`.
- **Categories & tags:** CRUD, slug auto-generation with Marathi transliteration.
- **Media library:** upload, crop (optional), alt text, caption, delete with usage check.
- **Comments:** approve/reject/spam, reply.
- **Subscribers:** list, export CSV, delete.
- **Settings:** site name, tagline, owner bio, contact details, social links, SEO defaults, quote of the day, feature toggles (comments, newsletter, gallery, events), content limits.
- **Audit log:** who changed what and when.
- **Accessibility:** keyboard-navigable, clear labels, confirmation dialogs for destructive actions.

### 6.4 Approval workflow (state machine)

```
draft ──submit──▶ pending_review ──approve──▶ approved ──publish_at──▶ published
  ▲                    │                                                │
  │                    ├──request_changes──▶ changes_requested ──edit──▶ pending_review
  │                    └──reject───────────▶ rejected
  └────────────────────────── edit draft ───────────────────────────────┘
published ──unpublish──▶ draft/archived
```

**Server-side enforcement:** contributors may only transition `draft → pending_review`. Only `editor/admin/owner` may approve, reject, request changes, publish, schedule, or archive. Never trust the client.

---

## 7. DATA MODEL (PostgreSQL / Supabase)

Use UUID primary keys, `created_at`/`updated_at` timestamptz, and soft-delete where sensible. Enable RLS on every table.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | references `auth.users(id)` on delete cascade |
| full_name | text | required |
| pen_name | text | optional |
| slug | text unique | transliterated |
| bio | text | ≤ 1000 chars |
| avatar_url | text | Supabase Storage |
| role | enum | reader, contributor, editor, admin, owner |
| status | enum | pending, active, suspended |
| auto_publish | boolean | default false |
| language_pref | enum | mr, ahr, en |
| city | text | |
| phone | text | private by default |
| social | jsonb | facebook, youtube, instagram, x, website |
| created_at, updated_at | timestamptz | |

### `categories`
`id, slug, name_mr, name_en, description_mr, kind (article|poem|news|event), sort_order, is_active`

### `posts`
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| slug | text unique | |
| title | text | ≤ 90 chars (validate) |
| excerpt | text | ≤ 220 chars |
| body_json | jsonb | Tiptap JSON |
| body_html | text | sanitized rendered HTML |
| body_text | text | plain text for search/reading time |
| type | enum | article, poem, ghazal, story, essay, review, news, achievement |
| language | enum | mr, ahr, en |
| category_id | uuid FK | |
| author_id | uuid FK profiles | |
| cover_url | text | |
| cover_alt | text | |
| status | enum | draft, pending_review, changes_requested, approved, published, rejected, archived |
| rejection_reason | text | |
| is_featured | boolean | |
| is_pinned | boolean | |
| pin_order | int | |
| publish_at | timestamptz | |
| published_at | timestamptz | |
| reading_time | int | minutes |
| view_count | bigint | default 0 |
| seo_title | text | |
| seo_description | text | |
| source_url | text | for news |
| source_name | text | for news |
| created_at, updated_at | timestamptz | |

### `post_revisions`
`id, post_id, title, body_json, body_html, edited_by, created_at`

### `tags` / `post_tags`
`tags(id, slug, name_mr, name_en)` · `post_tags(post_id, tag_id)`

### `comments`
`id, post_id, user_id nullable, author_name, author_email, body, status (pending|approved|spam), parent_id, created_at`

### `media`
`id, url, storage_path, alt_mr, caption_mr, mime_type, size_bytes, width, height, uploaded_by, created_at`

### `books`
`id, slug, title, cover_url, description_mr, publisher, year, isbn, language, buy_links jsonb, sort_order`

### `events`
`id, slug, title, description_mr, venue, starts_at, ends_at, cover_url, map_url, status (upcoming|past|cancelled), created_at`

### `gallery_albums` / `gallery_photos`
`albums(id, slug, title_mr, description_mr, cover_url, event_id nullable, created_at)` · `photos(id, album_id, url, alt_mr, caption_mr, sort_order)`

### `achievements`
Either use `posts` with `type='achievement'`, or a dedicated table:
`id, title_mr, description_mr, achieved_on, organisation, image_url, source_url, sort_order, is_pinned`

### `homepage_sections`
`id, key, label_mr, sort_order, is_visible, config jsonb`

### `settings`
`key text PK, value jsonb` — site_name, tagline, owner_name, contact, social, quote_of_day, content_limits, feature_flags, seo_defaults.

### `subscribers`
`id, email unique, name, status (subscribed|unsubscribed), created_at`

### `contact_messages`
`id, name, email, subject, message, ip_hash, created_at, is_read`

### `notifications`
`id, user_id, type, title_mr, body_mr, link, read_at, created_at`

### `audit_logs`
`id, actor_id, action, entity, entity_id, meta jsonb, created_at`

**Indexes:** `posts(status, published_at desc)`, `posts(type, language)`, `posts(author_id)`, full-text search index on `title` + `body_text` (use `pg_trgm` for Devanagari substring search), `comments(post_id, status)`.

**RLS intent:**
- Public: `SELECT` only published posts, active categories, published books/events, approved comments, public profile fields.
- Contributors: `SELECT/INSERT/UPDATE` own posts, but `status` may only be `draft` or `pending_review`; cannot set `published`.
- Editors/admins: full access within their scope.
- Service-role operations only from the Express server.
- Create a Postgres trigger to insert a `profiles` row on `auth.users` insert.

---

## 8. API DESIGN (Express)

Base URL: `/api`. All responses JSON. Validate every input with Zod. Return consistent errors `{ error: { code, message, details? } }`.

### Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | liveness |
| GET | `/api/posts` | filters: type, language, category, tag, author, q, page, limit, sort |
| GET | `/api/posts/:slug` | increments view count (debounced) |
| GET | `/api/news` | published news/achievements |
| GET | `/api/categories` | active |
| GET | `/api/tags` | |
| GET | `/api/books` | |
| GET | `/api/events` | upcoming/past |
| GET | `/api/gallery` | albums + photos |
| GET | `/api/settings/public` | whitelisted settings only |
| GET | `/api/search?q=` | Devanagari-safe |
| POST | `/api/contact` | Turnstile + rate limit |
| POST | `/api/subscribe` | double opt-in optional |
| POST | `/api/posts/:id/view` | optional |

### Authenticated (Supabase JWT in `Authorization: Bearer`)
| Method | Path | Role |
|---|---|---|
| GET | `/api/me` | any auth |
| PATCH | `/api/me` | any auth |
| GET | `/api/me/posts` | contributor+ |
| POST | `/api/posts` | contributor+ (creates draft) |
| PATCH | `/api/posts/:id` | owner of draft / editor+ |
| DELETE | `/api/posts/:id` | owner of draft / admin+ |
| POST | `/api/posts/:id/submit` | owner of draft |
| POST | `/api/uploads/sign` | contributor+ (signed Supabase upload) |
| POST | `/api/comments` | reader/visitor with Turnstile |

### Admin
| Method | Path | Role |
|---|---|---|
| GET | `/api/admin/posts` | editor+ |
| POST | `/api/admin/posts` | editor+ (any status) |
| PATCH | `/api/admin/posts/:id` | editor+ |
| POST | `/api/admin/posts/:id/moderate` | editor+ `{action, reason?, publish_at?}` |
| POST | `/api/admin/posts/reorder` | admin |
| GET | `/api/admin/users` | admin |
| PATCH | `/api/admin/users/:id` | admin (role/status/auto_publish) |
| GET/POST/PATCH/DELETE | `/api/admin/categories` | admin |
| GET/POST/PATCH/DELETE | `/api/admin/books` | admin |
| GET/POST/PATCH/DELETE | `/api/admin/events` | admin |
| GET/POST/PATCH/DELETE | `/api/admin/gallery` | admin |
| GET | `/api/admin/comments` | editor+ |
| PATCH | `/api/admin/comments/:id` | editor+ |
| GET | `/api/admin/subscribers` | admin |
| GET | `/api/admin/audit` | admin |
| GET/PATCH | `/api/admin/settings` | admin/owner |
| GET/PATCH | `/api/admin/homepage` | admin |
| POST | `/api/admin/restore/:revisionId` | admin |

**Middleware order:** `helmet` → `cors` (allowlist) → `express.json({limit})` → request-id/logger (`pino`) → rate limit → auth (verify Supabase JWT) → role guard → Zod validation → handler → error handler.

**Auth verification:** fetch Supabase JWKS or use `supabase.auth.getUser(token)`; cache keys. Attach `req.user = { id, email, role, status }` by joining `profiles`. Reject `suspended` users.

**Rate limits:** contact 5/hour/IP; signup 10/hour/IP; comments 20/hour/user; general API 300/15min/IP.

---

## 9. TECH STACK (ALL FREE / OPEN SOURCE)

### Recommended
| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js (App Router) + React + TypeScript** | SSR/SSG for Marathi SEO, image optimisation, metadata API |
| Styling | **Tailwind CSS + shadcn/ui** | Free, accessible, easy to theme |
| Editor | **Tiptap** (open source) | Rich text, custom poem block, Devanagari-safe |
| Data fetching | **TanStack Query** | Caching, optimistic updates |
| Backend | **Node.js 22 LTS + Express 5 + TypeScript** | Requirement |
| ORM | **Prisma** | Typed schema, migrations |
| Validation | **Zod** | Shared schemas |
| Database | **Supabase Postgres (free tier)** | 500 MB, generous for text |
| Auth | **Supabase Auth** | Email/password, verification, reset, MFA |
| File storage | **Supabase Storage (free 1 GB)** | Covers, avatars, gallery |
| Email | **Resend (free 3,000/month)** — optional | Approval notifications |
| CAPTCHA | **Cloudflare Turnstile (free)** | Contact/signup/comment spam |
| Frontend hosting | **Vercel Hobby (free)** | Best Next.js support |
| Backend hosting | **Render Free Web Service** (primary) or **Koyeb Free** (fallback) | Persistent Express server |
| CI/backups | **GitHub Actions (free 2,000 min/month)** | Tests + scheduled `pg_dump` |
| Analytics | **Vercel Analytics (basic) or Umami/Plausible self-host** — optional | Privacy-friendly |

> **Important:** Free tiers change. Verify current limits before relying on them. Prefer providers with a clear free tier and no credit-card requirement.

### Monorepo layout
```
dadasahebwebsite/
├─ apps/
│  ├─ web/                 # Next.js frontend
│  │  ├─ app/
│  │  ├─ components/
│  │  ├─ lib/
│  │  ├─ messages/         # mr.json, ahr.json, en.json
│  │  └─ public/
│  └─ api/                 # Express backend
│     ├─ src/
│     │  ├─ routes/
│     │  ├─ middleware/
│     │  ├─ services/
│     │  ├─ lib/
│     │  └─ index.ts
│     └─ prisma/
│        ├─ schema.prisma
│        └─ migrations/
├─ packages/
│  └─ shared/              # Zod schemas, types, constants
├─ supabase/
│  ├─ migrations/
│  ├─ seed.sql
│  └─ policies.sql
├─ .env.example
├─ README.md
└─ package.json            # npm workspaces
```

### Architecture
```
Browser (Next.js on Vercel)
   │  Supabase Auth (JWT)
   ├──────────────▶ Supabase Auth
   │
   └── HTTPS ─────▶ Express API (Render)
                       │
                       ├── Prisma ──▶ Supabase Postgres (RLS)
                       └── Supabase Storage (signed uploads)
```

The frontend may read public content directly from Supabase (anon key + RLS) for speed, but **all writes and admin operations go through Express**.

---

## 10. DESIGN SYSTEM

### Brand feel
Warm, literary, rooted in Khandesh, dignified — not corporate. Think hand-bound Marathi book, not SaaS landing page. Generous whitespace, strong Devanagari typography, subtle geometric borders inspired by Warli/Paithani but used sparingly (no clichés, no stock "Indian" patterns).

### Palette
| Token | Hex | Use |
|---|---|---|
| `--brand` | `#7A1F1F` | primary (deep maroon) |
| `--brand-2` | `#9C2B2B` | hover |
| `--accent` | `#C8A24A` | gold accents, dividers |
| `--saffron` | `#E07A2F` | highlights, badges |
| `--bg` | `#FBF7EF` | page background (cream) |
| `--surface` | `#FFFFFF` | cards |
| `--ink` | `#1F1B16` | body text |
| `--muted` | `#6B6257` | secondary text |
| `--success` | `#2E7D5B` | approved |
| `--warning` | `#B7791F` | pending |
| `--danger` | `#B42318` | rejected |

Dark mode: `--bg #151210`, `--surface #211C18`, `--ink #F3EDE3`.

### Typography
- Headings: **Tiro Devanagari Marathi** (serif) — elegant, literary.
- Body: **Mukta** or **Noto Sans Devanagari** — 16–18px, line-height 1.8.
- Latin fallback: **Inter** or **Source Serif 4**.
- Poem block: serif, 1.25–1.5rem, line-height 2, max-width 62ch, `white-space: pre-wrap`.
- Load via `next/font/google` with `display: swap`, subset `devanagari` + `latin`.

### Components
`SiteHeader`, `SiteFooter`, `Hero`, `NewsTicker`, `PostCard`, `NewsCard`, `PoemCard`, `AuthorCard`, `CategoryChip`, `TagPill`, `StatusBadge`, `Timeline`, `BookCard`, `EventCard`, `GalleryGrid`, `Lightbox`, `ShareBar`, `CommentThread`, `NewsletterForm`, `ContactForm`, `Pagination`, `EmptyState`, `Toast`, `Modal`, `ConfirmDialog`, `DataTable`, `ImageUploader`, `RichTextEditor`, `PoemBlock`, `PullQuote`, `ReadingProgress`, `LanguageSwitcher`, `SearchDialog`, `NotificationBell`.

### Layout & responsiveness
- Mobile-first; breakpoints 640 / 768 / 1024 / 1280.
- Sticky header with mobile drawer.
- Cards use 1 / 2 / 3 columns.
- Max content width 1200px; reading column 720px.
- Touch targets ≥ 44px.
- No horizontal scroll at 320px.

### Admin UI
- Clean, neutral, high-contrast; sidebar navigation; breadcrumbs; data tables with filters, bulk actions, pagination.
- Status colours: draft grey, pending amber, changes requested blue, published green, rejected red, archived slate.
- Every destructive action asks for confirmation.
- Editor autosaves draft every 20 seconds.

---

## 11. MARATHI & AHIRANI REQUIREMENTS

- HTML `lang="mr"` for Marathi, `lang="ahr"` for Ahirani, `lang="en"` for English. Use `lang` on article content, not just `<html>`.
- All UI strings in `messages/mr.json` (default), `messages/ahr.json`, `messages/en.json`. No hard-coded Marathi/English strings in components.
- Dates in Marathi: `९ नोव्हेंबर २०२६` (Devanagari numerals) with an option for Arabic numerals in settings.
- Relative time: "२ तासांपूर्वी", "काल", "३ दिवसांपूर्वी".
- Search must handle Devanagari, common spelling variants (श/ष, न/ण, य/ज), and transliteration. Use `pg_trgm` + unaccent-like normalisation.
- Slugs: transliterate Marathi to Latin; allow manual override; keep old slugs as redirects.
- Preserve poem line breaks and spacing exactly. Do not justify poem text.
- Provide a small **Ahirani glossary** feature (optional): term + meaning, used in articles via tooltip/mark. Great for readers outside Khandesh.
- Number formatting: १२,३४५ vs 12,345 (setting).
- Marathi punctuation: use `।` for full stops in Marathi copy where appropriate.
- Honourifics: डॉ., प्रा., ताई, सर, सौ. — never strip them.
- Avoid automatic translation. Provide a manual English summary field for key pages.
- Use UTF-8 everywhere; set DB encoding UTF8; add a test that saves and retrieves Marathi/Ahirani text correctly.

---

## 12. SEO & METADATA

- Per-page `title`, `description`, canonical URL, Open Graph and Twitter cards.
- Default OG image generator (`next/og`) with the person's name in Devanagari.
- `sitemap.xml` generated from published content; `robots.txt`; `rss.xml`.
- JSON-LD: `Person` (owner), `WebSite` with `SearchAction`, `Article`/`CreativeWork` for posts, `Event` for events, `Book` for books, `BreadcrumbList`.
- Clean URLs, no query-string pagination for canonical pages.
- `hreflang` if translated pages exist.
- Semantic headings (one `h1` per page).
- Image `alt` text required in admin.
- Fast LCP: optimise hero image, preload fonts, avoid layout shift.
- 301 redirects for changed slugs.

---

## 13. ACCESSIBILITY (WCAG 2.1 AA)

- Keyboard navigable; visible focus rings.
- Skip-to-content link.
- Sufficient contrast (test maroon on cream).
- Form labels, error messages, and `aria-describedby`.
- Alt text for all images.
- No autoplaying audio/video.
- Reduced-motion support.
- Screen-reader-friendly status messages.
- Language attributes on mixed-language content.
- Test with keyboard only and a screen reader (NVDA on Windows is free).

---

## 14. PERFORMANCE

- Lighthouse ≥ 90 on mobile for Performance, Accessibility, Best Practices, SEO (aim 95+).
- `next/image` for all images; AVIF/WebP; width/height set.
- Route-level code splitting; lazy-load editor and charts.
- Cache public API responses (`stale-while-revalidate`) where safe.
- DB indexes on all filter/sort columns.
- Paginate lists (12–24 per page).
- Avoid heavy client libraries on public pages.

---

## 15. SECURITY & PRIVACY

- Supabase RLS enabled on every table; deny by default.
- Service-role key only on Express; never in `NEXT_PUBLIC_*`.
- JWT verification on every protected route; check `profiles.status = 'active'`.
- Role checks server-side for every admin action.
- Zod validation and output sanitisation (DOMPurify on server for rendered HTML).
- `helmet`, strict CORS allowlist, rate limiting.
- Turnstile on signup, contact, comments.
- File upload: allow only image MIME types, max 5 MB, verify magic bytes, strip EXIF, random filenames.
- Password policy handled by Supabase (min 8, breach check optional).
- Email verification required before login.
- Admin MFA recommended (Supabase TOTP).
- Audit log for all admin mutations.
- Secrets in `.env` locally and in host dashboards; `.env*` in `.gitignore`.
- Privacy: collect minimal data; publish a Marathi privacy policy; allow account deletion request; DPDP Act 2023 awareness.
- Copyright: contributors must tick "I own this content and grant the site a non-exclusive licence" before submitting. Store acceptance timestamp.
- Backup: scheduled `pg_dump` via GitHub Actions to an encrypted artifact or private repo; document restore.

---

## 16. EMAIL NOTIFICATIONS (optional but recommended)

Using Resend free tier:
- Welcome + verify (Supabase handles verification email).
- Account approved / suspended.
- Post submitted (to admins).
- Post approved / rejected / changes requested (to contributor).
- Contact form (to owner).
- Weekly digest (optional).

Use React Email (open source) or simple HTML templates in Marathi. Queue sends so API responses stay fast. If Resend is not configured, fall back to in-app notifications only and log the email.

---

## 17. SEED CONTENT

Create a realistic, respectful seed set:

1. **Owner profile** using the verified table in §2. Mark unverified claims `[TO CONFIRM]` and hide them from public pages.
2. **About page** — 400–600 words in natural Marathi, based only on verified facts. Include a "माहिती अद्ययावत करत आहे" note if incomplete.
3. **3 news/achievement items** based on verified public sources:
   - Khandesh Sahitya Sangh leadership and first multilingual conference announcement (Jalgaon, 2021).
   - 6th Akhil Bharatiya Ahirani Sahitya Sammelan, Dhule — participation.
   - Maratha Seva Sangh 36th anniversary lecture, Dhule — talk on "मराठा सेवा संघ: काल, आज, उद्या".
   Each with `source_url` and a short original Marathi summary.
4. **2 sample articles** and **2 sample poems** written in natural Marathi (clearly marked as sample/demo if not by the owner). Include one Ahirani poem with an English/Marathi gloss.
5. **3 categories** minimum: कविता, कथा, अहिराणी.
6. **Placeholder images** from a free source (Unsplash/Pexels) or local abstract patterns. Do not use copyrighted photos of the person; leave a slot for the owner to upload.
7. **Legal pages** in Marathi (terms, privacy, copyright) with placeholders for jurisdiction/contact.

**Never** fabricate a book title, award, date, or quote. If a book list is not provided, show "पुस्तकांची यादी लवकरच" instead of inventing titles.

---

## 18. TESTING & ACCEPTANCE CRITERIA

### Automated
- `vitest` unit tests: slug/transliteration, reading time, Zod schemas, status-transition guards, role guards, content-limit validation.
- `supertest` API tests: auth required, contributor cannot publish, admin can, public cannot see drafts, rate limits, validation errors.
- `playwright` smoke tests: home loads, login, contributor submit, admin approve, post appears publicly, Marathi text renders.
- `tsc --noEmit`, ESLint, Prettier in CI.

### Manual acceptance checklist
- [ ] A visitor can read the site on a 320px phone with no horizontal scroll.
- [ ] Marathi and Ahirani text save, display, and search correctly.
- [ ] A new contributor can register, verify email, and sees "pending approval".
- [ ] A pending contributor cannot submit until an admin activates the account.
- [ ] An active contributor can create a draft within the character limits and submit it.
- [ ] The contributor cannot publish; the API rejects a forged `status: published`.
- [ ] An admin sees the submission, previews it, requests changes / rejects / approves.
- [ ] Approved post appears on the public site at the right time.
- [ ] Admin can create a news item, pin it, reorder homepage sections, and edit an older item.
- [ ] Every edit creates a revision; admin can restore an earlier version.
- [ ] Scheduled post publishes automatically at `publish_at`.
- [ ] Owner can edit contact details and social links from Settings without code.
- [ ] Images upload, validate type/size, and show alt text.
- [ ] Contact form is rate-limited and Turnstile-protected.
- [ ] Lighthouse mobile ≥ 90 across categories.
- [ ] Keyboard-only navigation works; focus is visible.
- [ ] `sitemap.xml`, `rss.xml`, `robots.txt`, OG tags, and JSON-LD validate.
- [ ] No secret key appears in the client bundle (`grep` the build output).
- [ ] `.env.example` lists every variable; README explains setup.
- [ ] Free-tier deploy works end-to-end.

---

## 19. DEPLOYMENT (FREE TIERS)

Follow `SETUP-GUIDE-FREE-HOSTING.md` in this folder for the human-facing steps. The agent must:

1. Create `.env.example` with all variables (see below).
2. Configure CORS to allow the Vercel domain and localhost.
3. Add `render.yaml` (or equivalent) and a health check at `/api/health`.
4. Add `vercel.json` if needed; set the web root to `apps/web`.
5. Add GitHub Actions for lint/test and a scheduled database backup.
6. Never print or commit real secrets.
7. Produce a `DEPLOYMENT.md` with exact dashboard steps and screenshots placeholders.
8. After deploy, run the smoke tests against production.

### Environment variables
```env
# Shared
NODE_ENV=production

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server only
SUPABASE_STORAGE_BUCKET=media

# API
DATABASE_URL=                     # Supabase Postgres pooled connection
DIRECT_URL=                       # direct connection for migrations
API_PORT=4000
CORS_ORIGINS=https://your-site.vercel.app,http://localhost:3000
JWT_AUDIENCE=authenticated

# Frontend
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
NEXT_PUBLIC_SITE_URL=https://your-site.vercel.app
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=             # server only

# Email (optional)
RESEND_API_KEY=
EMAIL_FROM=no-reply@yourdomain.com
OWNER_EMAIL=

# Uploads
MAX_UPLOAD_MB=5
```

---

## 20. BUILD ORDER (PHASES)

Work in phases. After each phase, run tests, summarise what changed, and ask the human before destructive steps.

1. **Phase 0 — Environment & scaffold:** verify Node 22 LTS, npm/pnpm, Git; create monorepo, TypeScript, ESLint, Prettier, Tailwind, shadcn; `.env.example`, README.
2. **Phase 1 — Database & auth:** Supabase schema, migrations, RLS, triggers, seed; auth pages; profile sync; role guards.
3. **Phase 2 — Public site shell:** layout, header/footer, home, about, typography, responsive, dark mode, 404.
4. **Phase 3 — Content:** writings list/detail, categories, tags, search, news, books, events, gallery, media, SEO.
5. **Phase 4 — Contributor portal:** register, dashboard, editor, limits, preview, submit, status, notifications.
6. **Phase 5 — Admin dashboard:** overview, review queue, CRUD, homepage composer, users, settings, revisions, audit.
7. **Phase 6 — Engagement:** comments, newsletter, contact, Turnstile, email.
8. **Phase 7 — Quality:** accessibility, performance, tests, security review, Marathi/Ahirani QA.
9. **Phase 8 — Deploy & handover:** Vercel + Render + Supabase, backups, docs, owner walkthrough, seed final content.

---

## 21. GUARDRAILS FOR THE AGENT

- Ask before: deleting data, changing schema destructively, rotating keys, deploying, or publishing real content.
- Prefer boring, well-supported libraries over novelty.
- Keep the code TypeScript-strict and documented.
- Write commit-sized changes with clear messages.
- Do not silently change the design system or scope.
- If a free tier cannot do something, explain the limitation and offer a free alternative.
- If information about the person is missing, use `[TO CONFIRM]` and ask — never invent.
- Keep the owner's non-technical usability in mind: every admin action should be obvious and reversible.

---

## 22. QUESTIONS TO ASK THE HUMAN BEFORE BUILDING

1. Preferred site name and tagline in Marathi and English?
2. Do you have a logo, portrait, and book covers? (Upload or provide links.)
3. Which social links should be public (Facebook, YouTube, Instagram, X, WhatsApp)?
4. Exact list of awards, books, and positions — with years and sources.
5. Exact role in the Akhil Bharatiya Marathi Sahitya Sammelan (to replace `[TO CONFIRM]`).
6. Should comments be enabled at launch? Moderated or open?
7. Should readers be able to create accounts, or only contributors?
8. Default numerals: Devanagari (१२३) or Arabic (123)?
9. Do you want an English version of the whole site, or only key pages?
10. Custom domain now, or start on a free `*.vercel.app` subdomain?
11. Owner email for notifications and the "from" address for Resend?
12. Who else needs admin access (name + email)?
13. Confirm the public contact details (phone, email, address) or hide some.
14. Any content that must **not** be published?

---

## 23. DEFINITION OF DONE

The project is done when:

- All acceptance criteria in §18 pass.
- The site is live on free tiers with a working custom or free subdomain.
- The owner can log in, publish/edit/reorder news, approve contributors, and upload images without developer help.
- A contributor can register, submit Marathi/Ahirani work, and see status.
- No secrets are exposed; RLS and role checks are verified.
- Marathi and Ahirani render correctly on mobile and desktop.
- README, DEPLOYMENT, CONTENT-GUIDE, and BACKUP docs exist.
- A short Marathi video/checklist walkthrough for the owner is recorded or written.
