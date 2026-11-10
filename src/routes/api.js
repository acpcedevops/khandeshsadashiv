'use strict';

const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { getDb } = require('../db');
const { POST_SELECT, POST_JOINS, PUBLISHED_WHERE } = require('../lib/posts');
const { renderMarkdown } = require('../lib/markdown');
const { notifyStaff } = require('../lib/notifications');
const { notifyNewComment } = require('../lib/email');

const router = express.Router();

const apiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

router.use(apiLimiter);

function clampLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 12;
  return Math.min(Math.max(Math.floor(n), 1), 50);
}

/* GET /api/posts */
router.get('/posts', async (req, res, next) => {
  try {
    const db = getDb();
    const limit = clampLimit(req.query.limit);
    const page = Math.max(1, Number(req.query.page) || 1);
    const offset = (page - 1) * limit;
    const type = ['article', 'poem', 'news', 'ghazal', 'story'].includes(req.query.type)
      ? req.query.type : '';
    const language = ['mr', 'ahr', 'hi', 'en'].includes(req.query.language)
      ? req.query.language : '';

    const where = [PUBLISHED_WHERE];
    const args = [];
    if (type) { where.push('p.type = ?'); args.push(type); }
    if (language) { where.push('p.language = ?'); args.push(language); }

    const whereSql = where.join(' AND ');
    const countRow = await db.get(
      `SELECT COUNT(*) AS count ${POST_JOINS} WHERE ${whereSql}`,
      args
    );
    const rows = await db.all(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.type, p.language, p.tags,
              p.cover_url, p.published_at, p.reading_time, p.view_count,
              u.name AS author_name, c.name_mr AS category_name
         ${POST_JOINS}
        WHERE ${whereSql}
        ORDER BY p.published_at DESC LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );

    res.json({
      ok: true,
      total: Number(countRow ? countRow.count : 0),
      page,
      limit,
      items: rows.map((row) => ({
        ...row,
        url: row.type === 'news' ? `/news/${row.slug}` : `/writings/${row.slug}`,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/* GET /api/posts/:slug */
router.get('/posts/:slug', async (req, res, next) => {
  try {
    const db = getDb();
    const post = await db.get(
      `SELECT ${POST_SELECT} ${POST_JOINS} WHERE p.slug = ? AND ${PUBLISHED_WHERE}`,
      [req.params.slug]
    );
    if (!post) return res.status(404).json({ ok: false, error: 'लेख सापडला नाही.' });
    return res.json({ ok: true, post });
  } catch (error) {
    return next(error);
  }
});

/* GET /api/categories */
router.get('/categories', async (req, res, next) => {
  try {
    const db = getDb();
    const categories = await db.all(
      'SELECT id, slug, name_mr, name_en, kind FROM categories WHERE is_active = 1 ORDER BY sort_order ASC'
    );
    res.json({ ok: true, items: categories });
  } catch (error) {
    next(error);
  }
});

/* GET /api/search */
router.get('/search', async (req, res, next) => {
  try {
    const db = getDb();
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (!q) return res.json({ ok: true, items: [] });
    const like = `%${q}%`;
    const rows = await db.all(
      `SELECT p.id, p.slug, p.title, p.excerpt, p.type, p.published_at,
              u.name AS author_name
         ${POST_JOINS}
        WHERE ${PUBLISHED_WHERE}
          AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.body_md LIKE ? OR p.tags LIKE ?)
        ORDER BY p.published_at DESC LIMIT 25`,
      [like, like, like, like]
    );
    return res.json({
      ok: true,
      items: rows.map((row) => ({
        ...row,
        url: row.type === 'news' ? `/news/${row.slug}` : `/writings/${row.slug}`,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

/* POST /api/newsletter */
router.post('/newsletter', async (req, res, next) => {
  try {
    const db = getDb();
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(422).json({ ok: false, error: 'वैध ईमेल पत्ता द्या.' });
    }
    await db.run(
      `INSERT INTO subscribers (email, name, status) VALUES (?, ?, 'subscribed')
       ON CONFLICT(email) DO UPDATE SET status = 'subscribed', name = excluded.name`,
      [email, name || null]
    );
    return res.json({ ok: true, message: 'नोंदणी यशस्वी.' });
  } catch (error) {
    return next(error);
  }
});

/* POST /api/comments */
router.post('/comments', async (req, res, next) => {
  try {
    const db = getDb();
    const postId = Number(req.body.post_id);
    const authorName = String(req.body.author_name || '').trim();
    const authorEmail = String(req.body.author_email || '').trim().toLowerCase();
    const body = String(req.body.body || '').trim();

    if (!postId || authorName.length < 2 || body.length < 3) {
      return res.status(422).json({ ok: false, error: 'नाव आणि टिप्पणी आवश्यक आहे.' });
    }
    if (body.length > 2000) {
      return res.status(422).json({ ok: false, error: 'टिप्पणी २००० अक्षरांपेक्षा जास्त नसावी.' });
    }

    const post = await db.get(
      "SELECT id, title, slug, type FROM posts WHERE id = ? AND status = 'published'",
      [postId]
    );
    if (!post) return res.status(404).json({ ok: false, error: 'लेख सापडला नाही.' });

    const result = await db.run(
      `INSERT INTO comments (post_id, user_id, author_name, author_email, body, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [post.id, req.user ? req.user.id : null, authorName, authorEmail || null, body]
    );

    await notifyNewComment(post, { author_name: authorName, body });
    await notifyStaff(db, {
      type: 'comment',
      title: 'नवीन टिप्पणी मंजुरीसाठी',
      body: `${authorName}: ${body.slice(0, 100)}`,
      link: '/admin/comments',
    });

    return res.status(201).json({
      ok: true,
      id: result.lastInsertRowid,
      message: 'टिप्पणी मंजुरीसाठी पाठवली आहे.',
    });
  } catch (error) {
    return next(error);
  }
});

/* POST /api/preview — Markdown preview for the editor */
router.post('/preview', (req, res) => {
  const body = String(req.body.body_md || '').slice(0, 30000);
  res.json({ ok: true, html: renderMarkdown(body) });
});

/* GET /api/health */
router.get('/health', async (req, res, next) => {
  try {
    const db = getDb();
    const row = await db.get('SELECT 1 AS ok');
    res.json({ ok: Boolean(row && row.ok === 1), time: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
