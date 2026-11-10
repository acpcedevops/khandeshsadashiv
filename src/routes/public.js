'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const config = require('../config');
const { getDb } = require('../db');
const {
  POST_SELECT,
  POST_JOINS,
  PUBLISHED_WHERE,
} = require('../lib/posts');
const {
  paginationMeta,
  paginationLinks,
  safeJsonParse,
  parseTags,
  truncate,
  toMarathiDigits,
  escapeHtml,
  formatDateMr,
} = require('../lib/helpers');
const { isAdmin } = require('../lib/auth');
const { notifyStaff, notifyUser } = require('../lib/notifications');
const { sendMail, notifyNewComment } = require('../lib/email');

const router = express.Router();

const HOME_SECTIONS = [
  'hero', 'news', 'featured', 'latest', 'poem', 'timeline', 'books', 'events', 'newsletter',
];

const formLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'खूप विनंत्या आल्या आहेत. कृपया काही वेळानंतर प्रयत्न करा.',
});

function parsePage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function postPath(post) {
  return post.type === 'news' ? `/news/${post.slug}` : `/writings/${post.slug}`;
}

async function loadPublishedBySlug(db, slug) {
  return db.get(
    `SELECT ${POST_SELECT} ${POST_JOINS} WHERE p.slug = ?`,
    [slug]
  );
}

/* ── Home ─────────────────────────────────────────────────── */
router.get('/', async (req, res) => {
  const db = getDb();
  const settings = res.locals.settings;

  const [news, featured, latest, poem, books, events, media, timeline] = await Promise.all([
    db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${PUBLISHED_WHERE} AND p.type = 'news'
        ORDER BY p.is_pinned DESC, p.pin_order ASC, p.published_at DESC
        LIMIT 3`
    ),
    db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${PUBLISHED_WHERE} AND p.is_featured = 1
        ORDER BY p.published_at DESC LIMIT 3`
    ),
    db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${PUBLISHED_WHERE} AND p.type <> 'news'
        ORDER BY p.published_at DESC LIMIT 6`
    ),
    db.get(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${PUBLISHED_WHERE} AND p.type = 'poem'
        ORDER BY p.published_at DESC LIMIT 1`
    ),
    db.all('SELECT * FROM books ORDER BY sort_order ASC, id DESC LIMIT 4'),
    db.all("SELECT * FROM events WHERE status = 'upcoming' ORDER BY starts_at ASC LIMIT 3"),
    db.all('SELECT * FROM media ORDER BY sort_order ASC, published_on DESC LIMIT 3'),
    db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${PUBLISHED_WHERE} AND p.type = 'news'
        ORDER BY p.published_at DESC LIMIT 4`
    ),
  ]);

  const configured = safeJsonParse(settings['home.sections'], HOME_SECTIONS);
  const sections = Array.isArray(configured)
    ? configured.filter((name) => HOME_SECTIONS.includes(name))
    : HOME_SECTIONS;

  res.render('public/home', {
    pageTitle: null,
    sections,
    news,
    featured,
    latest,
    poem,
    books,
    events,
    media,
    timeline,
    metaDescription: settings['site.description'],
  });
});

/* ── About ────────────────────────────────────────────────── */
router.get('/about', async (req, res) => {
  const db = getDb();
  const owner = await db.get("SELECT * FROM users WHERE role = 'owner' ORDER BY id ASC LIMIT 1");
  const achievements = await db.all(
    `SELECT ${POST_SELECT} ${POST_JOINS}
      WHERE ${PUBLISHED_WHERE} AND p.type = 'news'
      ORDER BY p.published_at DESC LIMIT 6`
  );
  const books = await db.all('SELECT * FROM books ORDER BY sort_order ASC, id DESC');
  res.render('public/about', {
    pageTitle: 'परिचय',
    owner,
    achievements,
    books,
    metaDescription: 'प्रा. डॉ. सदाशिव श्रीराम सुर्यवंशी — परिचय, साहित्यिक कार्य आणि सामाजिक योगदान.',
  });
});

/* ── Writings list ────────────────────────────────────────── */
async function renderPostList(req, res, options = {}) {
  const db = getDb();
  const { basePath, fixedType = null, title, subtitle, view = 'public/writings' } = options;

  const page = parsePage(req.query.page);
  const perPage = 9;
  const q = String(req.query.q || '').trim().slice(0, 80);
  const category = String(req.query.category || '').trim();
  const language = ['mr', 'ahr', 'hi', 'en'].includes(req.query.language) ? req.query.language : '';
  const type = ['article', 'poem', 'ghazal', 'story', 'news'].includes(req.query.type)
    ? req.query.type
    : '';
  const sort = req.query.sort === 'popular' ? 'popular' : 'latest';

  const where = [PUBLISHED_WHERE];
  const args = [];

  if (fixedType) {
    where.push('p.type = ?');
    args.push(fixedType);
  } else {
    where.push("p.type <> 'news'");
  }

  if (type && !fixedType) {
    where.push('p.type = ?');
    args.push(type);
  }
  if (language) {
    where.push('p.language = ?');
    args.push(language);
  }
  if (category) {
    where.push('c.slug = ?');
    args.push(category);
  }
  if (q) {
    where.push('(p.title LIKE ? OR p.excerpt LIKE ? OR p.body_md LIKE ?)');
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const whereSql = where.join(' AND ');
  const orderSql = sort === 'popular'
    ? 'p.view_count DESC, p.published_at DESC'
    : 'p.is_pinned DESC, p.pin_order ASC, p.published_at DESC';

  const countRow = await db.get(
    `SELECT COUNT(*) AS count ${POST_JOINS} WHERE ${whereSql}`,
    args
  );
  const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);

  const posts = await db.all(
    `SELECT ${POST_SELECT} ${POST_JOINS}
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ? OFFSET ?`,
    [...args, perPage, meta.offset]
  );

  const categories = await db.all(
    'SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC'
  );

  res.render(view, {
    pageTitle: title,
    subtitle,
    posts,
    categories,
    filters: { q, category, language, type, sort },
    pagination: {
      ...meta,
      links: paginationLinks(meta.page, meta.pages, basePath, {
        q, category, language, type, sort,
      }),
    },
    basePath,
    fixedType,
  });
}

router.get('/writings', async (req, res, next) => {
  try {
    await renderPostList(req, res, {
      basePath: '/writings',
      title: 'साहित्य',
      subtitle: 'लेख, कविता, गझल, कथा आणि अहिराणी साहित्य',
    });
  } catch (error) {
    next(error);
  }
});

router.get('/news', async (req, res, next) => {
  try {
    await renderPostList(req, res, {
      basePath: '/news',
      fixedType: 'news',
      title: 'बातम्या आणि कामगिरी',
      subtitle: 'डॉ. सुर्यवंशी यांच्या साहित्यिक आणि सामाजिक कार्यातील ताज्या घडामोडी',
    });
  } catch (error) {
    next(error);
  }
});

/* ── Single post ──────────────────────────────────────────── */
async function renderPost(req, res, next) {
  try {
    const db = getDb();
    const post = await loadPublishedBySlug(db, req.params.slug);
    if (!post) {
      return res.status(404).render('errors/404', {
        pageTitle: 'पान सापडले नाही',
      });
    }

    const isPublished = post.status === 'published' && post.published_at;
    const canPreview = req.user && (isAdmin(req.user) || Number(req.user.id) === Number(post.author_id));
    if (!isPublished && !canPreview) {
      return res.status(404).render('errors/404', {
        pageTitle: 'पान सापडले नाही',
      });
    }

    if (isPublished) {
      await db.run('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [post.id]);
      post.view_count = Number(post.view_count || 0) + 1;
    }

    const [comments, prev, next, related] = await Promise.all([
      db.all(
        `SELECT id, author_name, body, created_at
           FROM comments
          WHERE post_id = ? AND status = 'approved'
          ORDER BY created_at ASC`,
        [post.id]
      ),
      post.published_at
        ? db.get(
            `SELECT p.title, p.slug, p.type FROM posts p
              WHERE ${PUBLISHED_WHERE} AND p.published_at < ?
              ORDER BY p.published_at DESC LIMIT 1`,
            [post.published_at]
          )
        : null,
      post.published_at
        ? db.get(
            `SELECT p.title, p.slug, p.type FROM posts p
              WHERE ${PUBLISHED_WHERE} AND p.published_at > ?
              ORDER BY p.published_at ASC LIMIT 1`,
            [post.published_at]
          )
        : null,
      db.all(
        `SELECT ${POST_SELECT} ${POST_JOINS}
          WHERE ${PUBLISHED_WHERE} AND p.id <> ?
            AND (p.category_id = ? OR p.type = ?)
          ORDER BY p.published_at DESC LIMIT 3`,
        [post.id, post.category_id || 0, post.type]
      ),
    ]);

    res.render('public/post', {
      pageTitle: post.title,
      post,
      comments,
      prev,
      next,
      related,
      tags: parseTags(post.tags),
      backPath: post.type === 'news' ? '/news' : '/writings',
      backLabel: post.type === 'news' ? 'सर्व बातम्या' : 'सर्व साहित्य',
      metaDescription: post.seo_description || post.excerpt,
      ogImage: post.cover_url || null,
      ogType: 'article',
      isPreview: !isPublished,
    });
  } catch (error) {
    next(error);
  }
}

router.get('/writings/:slug', renderPost);
router.get('/news/:slug', renderPost);

/* ── Books ────────────────────────────────────────────────── */
router.get('/books', async (req, res, next) => {
  try {
    const db = getDb();
    const books = await db.all('SELECT * FROM books ORDER BY sort_order ASC, id DESC');
    res.render('public/books', {
      pageTitle: 'पुस्तके',
      books,
      metaDescription: 'डॉ. सदाशिव सुर्यवंशी यांची पुस्तके आणि प्रकाशने.',
    });
  } catch (error) {
    next(error);
  }
});

/* ── Events ───────────────────────────────────────────────── */
router.get('/events', async (req, res, next) => {
  try {
    const db = getDb();
    const upcoming = await db.all(
      "SELECT * FROM events WHERE status = 'upcoming' ORDER BY starts_at ASC"
    );
    const past = await db.all(
      "SELECT * FROM events WHERE status <> 'upcoming' ORDER BY starts_at DESC LIMIT 20"
    );
    res.render('public/events', {
      pageTitle: 'कार्यक्रम',
      upcoming,
      past,
      metaDescription: 'आगामी आणि झालेले साहित्यिक कार्यक्रम.',
    });
  } catch (error) {
    next(error);
  }
});

/* ── Gallery ──────────────────────────────────────────────── */
router.get('/gallery', async (req, res, next) => {
  try {
    const db = getDb();
    const albums = await db.all('SELECT * FROM albums ORDER BY created_at DESC');
    const photos = await db.all('SELECT * FROM photos ORDER BY sort_order ASC, id ASC');
    const grouped = new Map();
    for (const photo of photos) {
      if (!grouped.has(photo.album_id)) grouped.set(photo.album_id, []);
      grouped.get(photo.album_id).push(photo);
    }
    res.render('public/gallery', {
      pageTitle: 'छायाचित्र दालन',
      albums,
      photosByAlbum: grouped,
      metaDescription: 'साहित्यिक कार्यक्रम आणि क्षणांची छायाचित्रे.',
    });
  } catch (error) {
    next(error);
  }
});

/* ── Media mentions ───────────────────────────────────────── */
router.get('/media', async (req, res, next) => {
  try {
    const db = getDb();
    const media = await db.all('SELECT * FROM media ORDER BY sort_order ASC, published_on DESC');
    res.render('public/media', {
      pageTitle: 'वृत्तपत्रांत',
      media,
      metaDescription: 'वृत्तपत्रे आणि वेबसाइटवरील बातम्या, मुलाखती आणि उल्लेख.',
    });
  } catch (error) {
    next(error);
  }
});

/* ── Contact ──────────────────────────────────────────────── */
router.get('/contact', (req, res) => {
  res.render('public/contact', {
    pageTitle: 'संपर्क',
    form: {},
    errors: {},
    metaDescription: 'डॉ. सदाशिव सुर्यवंशी यांच्याशी संपर्क साधा.',
  });
});

router.post('/contact', formLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();
    const errors = {};

    if (name.length < 2) errors.name = 'कृपया नाव लिहा.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'कृपया वैध ईमेल पत्ता लिहा.';
    if (message.length < 10) errors.message = 'कृपया किमान १० अक्षरी संदेश लिहा.';
    if (message.length > 4000) errors.message = 'संदेश ४००० अक्षरांपेक्षा जास्त नसावा.';

    if (Object.keys(errors).length) {
      return res.status(422).render('public/contact', {
        pageTitle: 'संपर्क',
        form: { name, email, subject, message },
        errors,
      });
    }

    await db.run(
      `INSERT INTO contact_messages (name, email, subject, message)
       VALUES (?, ?, ?, ?)`,
      [name, email, subject || null, message]
    );

    await notifyStaff(db, {
      type: 'contact',
      title: 'नवीन संपर्क संदेश',
      body: `${name}: ${truncate(message, 120)}`,
      link: '/admin/messages',
    });

    await sendMail({
      to: config.ownerEmail,
      subject: `संपर्क संदेश — ${subject || name}`,
      text: `नाव: ${name}\nईमेल: ${email}\nविषय: ${subject || '-'}\n\n${message}`,
      html: `<p><strong>नाव:</strong> ${escapeHtml(name)}</p>
        <p><strong>ईमेल:</strong> ${escapeHtml(email)}</p>
        <p><strong>विषय:</strong> ${escapeHtml(subject || '-')}</p>
        <p style="white-space:pre-wrap">${escapeHtml(message)}</p>`,
    });

    res.flash('success', 'तुमचा संदेश पाठवला गेला आहे. धन्यवाद!');
    return res.redirect('/contact');
  } catch (error) {
    return next(error);
  }
});

/* ── Search ───────────────────────────────────────────────── */
router.get('/search', async (req, res, next) => {
  try {
    const db = getDb();
    const q = String(req.query.q || '').trim().slice(0, 80);
    const page = parsePage(req.query.page);
    const perPage = 10;
    let posts = [];
    let meta = paginationMeta(0, page, perPage);

    if (q) {
      const like = `%${q}%`;
      const countRow = await db.get(
        `SELECT COUNT(*) AS count ${POST_JOINS}
          WHERE ${PUBLISHED_WHERE}
            AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.body_md LIKE ? OR p.tags LIKE ?)`,
        [like, like, like, like]
      );
      meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);
      posts = await db.all(
        `SELECT ${POST_SELECT} ${POST_JOINS}
          WHERE ${PUBLISHED_WHERE}
            AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.body_md LIKE ? OR p.tags LIKE ?)
          ORDER BY p.published_at DESC LIMIT ? OFFSET ?`,
        [like, like, like, like, perPage, meta.offset]
      );
    }

    res.render('public/search', {
      pageTitle: q ? `शोध: ${q}` : 'शोध',
      q,
      posts,
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/search', { q }),
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── Comments (public submission) ─────────────────────────── */
router.post('/comments', formLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const postId = Number(req.body.post_id);
    const authorName = String(req.body.author_name || '').trim();
    const authorEmail = String(req.body.author_email || '').trim().toLowerCase();
    const body = String(req.body.body || '').trim();

    const post = await db.get(
      `SELECT id, title, slug, type FROM posts WHERE id = ? AND status = 'published'`,
      [postId]
    );
    if (!post) {
      return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    }

    const target = post.type === 'news' ? `/news/${post.slug}` : `/writings/${post.slug}`;

    if (authorName.length < 2 || body.length < 3) {
      res.flash('error', 'कृपया नाव आणि टिप्पणी लिहा.');
      return res.redirect(`${target}#comments`);
    }
    if (body.length > 2000) {
      res.flash('error', 'टिप्पणी २००० अक्षरांपेक्षा जास्त नसावी.');
      return res.redirect(`${target}#comments`);
    }

    const result = await db.run(
      `INSERT INTO comments (post_id, user_id, author_name, author_email, body, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [post.id, req.user ? req.user.id : null, authorName, authorEmail || null, body]
    );

    await notifyNewComment(post, { author_name: authorName, body });
    await notifyStaff(db, {
      type: 'comment',
      title: 'नवीन टिप्पणी मंजुरीसाठी',
      body: `${authorName}: ${truncate(body, 100)}`,
      link: '/admin/comments',
    });

    res.flash('success', 'तुमची टिप्पणी मंजुरीसाठी पाठवली आहे. धन्यवाद!');
    return res.redirect(`${target}#comments`);
  } catch (error) {
    return next(error);
  }
});

/* ── Newsletter ───────────────────────────────────────────── */
router.post('/newsletter', formLimiter, async (req, res, next) => {
  try {
    const db = getDb();
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const back = String(req.body.redirect || '/').startsWith('/') ? req.body.redirect : '/';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.flash('error', 'कृपया वैध ईमेल पत्ता लिहा.');
      return res.redirect(back);
    }

    await db.run(
      `INSERT INTO subscribers (email, name, status) VALUES (?, ?, 'subscribed')
       ON CONFLICT(email) DO UPDATE SET status = 'subscribed', name = excluded.name`,
      [email, name || null]
    );

    res.flash('success', 'तुमची नोंदणी झाली. नवीन लेख थेट तुमच्या ईमेलवर येतील.');
    return res.redirect(back);
  } catch (error) {
    return next(error);
  }
});

/* ── RSS / sitemap / robots ───────────────────────────────── */
router.get('/rss.xml', async (req, res, next) => {
  try {
    const db = getDb();
    const posts = await db.all(
      `SELECT p.title, p.slug, p.type, p.excerpt, p.published_at, p.body_html,
              u.name AS author_name
         FROM posts p JOIN users u ON u.id = p.author_id
        WHERE ${PUBLISHED_WHERE}
        ORDER BY p.published_at DESC LIMIT 30`
    );

    const items = posts.map((post) => {
      const url = `${config.siteUrl}${post.type === 'news' ? '/news/' : '/writings/'}${post.slug}`;
      return `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(url)}</link>
      <guid isPermaLink="true">${escapeHtml(url)}</guid>
      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>
      <author>${escapeHtml(post.author_name)}</author>
      <description>${escapeHtml(post.excerpt || '')}</description>
      <content:encoded><![CDATA[${post.body_html || ''}]]></content:encoded>
    </item>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(res.locals.settings['site.name'])}</title>
    <link>${escapeHtml(config.siteUrl)}</link>
    <description>${escapeHtml(res.locals.settings['site.description'])}</description>
    <language>mr</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeHtml(config.siteUrl)}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;

    res.type('application/rss+xml').send(xml);
  } catch (error) {
    next(error);
  }
});

router.get('/sitemap.xml', async (req, res, next) => {
  try {
    const db = getDb();
    const posts = await db.all(
      `SELECT p.slug, p.type, p.updated_at FROM posts p WHERE ${PUBLISHED_WHERE} ORDER BY p.published_at DESC`
    );
    const staticPages = [
      '/', '/about', '/writings', '/news', '/books', '/events', '/gallery', '/media', '/contact',
    ];
    const urls = [
      ...staticPages.map((path) => ({ loc: `${config.siteUrl}${path}`, lastmod: null })),
      ...posts.map((post) => ({
        loc: `${config.siteUrl}${post.type === 'news' ? '/news/' : '/writings/'}${post.slug}`,
        lastmod: post.updated_at ? new Date(post.updated_at).toISOString() : null,
      })),
    ];

    const body = urls.map((url) => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${url.lastmod}</lastmod>` : ''}
  </url>`).join('\n');

    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`);
  } catch (error) {
    next(error);
  }
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /dashboard
Disallow: /api

Sitemap: ${config.siteUrl}/sitemap.xml
`);
});

router.get('/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

module.exports = { router, postPath, toMarathiDigits, formatDateMr, notifyUser };
