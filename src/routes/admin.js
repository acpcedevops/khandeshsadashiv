'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireAdmin, isOwner, isManager } = require('../lib/auth');
const {
  POST_SELECT,
  POST_JOINS,
  ensureUniqueSlug,
  validatePostInput,
  derivePostFields,
} = require('../lib/posts');
const { upload, saveImage, saveImages } = require('../lib/storage');
const { verifyCsrf } = require('../lib/csrf');
const { notifyUser, logAudit } = require('../lib/notifications');
const {
  notifyContributorStatus,
  notifyAccountApproved,
} = require('../lib/email');
const { invalidateSettingsCache } = require('../lib/settings');
const {
  paginationMeta,
  paginationLinks,
  safeJsonParse,
  toMarathiDigits,
  slugify,
} = require('../lib/helpers');

const router = express.Router();

router.use(requireAdmin);

const POST_STATUSES = ['draft', 'pending_review', 'approved', 'published', 'changes_requested', 'rejected', 'archived'];
const ROLES = ['owner', 'admin', 'editor', 'contributor', 'reader'];
const HOME_SECTIONS = ['hero', 'news', 'featured', 'latest', 'poem', 'timeline', 'books', 'events', 'newsletter'];

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function flag(value) {
  return value === '1' || value === 'on' || value === true ? 1 : 0;
}

function parsePage(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

async function setSetting(db, key, value) {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, typeof value === 'string' ? value : JSON.stringify(value)]
  );
}

async function loadPost(db, id) {
  return db.get(`SELECT ${POST_SELECT} ${POST_JOINS} WHERE p.id = ?`, [Number(id)]);
}

async function notifyAuthor(db, postId, status, reason) {
  const post = await loadPost(db, postId);
  if (!post) return;
  const label = {
    published: 'प्रकाशित',
    approved: 'मंजूर (नियोजित)',
    changes_requested: 'बदल आवश्यक',
    rejected: 'नामंजूर',
    archived: 'संग्रहित',
  }[status] || status;

  await notifyUser(db, post.author_id, {
    type: 'post_status',
    title: `तुमच्या लेखाची स्थिती: ${label}`,
    body: post.title,
    link: `/dashboard/posts/${post.id}/edit`,
  });
  await notifyContributorStatus(post, status, reason);
}

/* ── Overview ─────────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const [postStats, userStats, commentPending, subscriberCount, unreadMessages] = await Promise.all([
      db.get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
                SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
                COALESCE(SUM(view_count), 0) AS views
           FROM posts`
      ),
      db.get(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
           FROM users`
      ),
      db.get("SELECT COUNT(*) AS count FROM comments WHERE status = 'pending'"),
      db.get("SELECT COUNT(*) AS count FROM subscribers WHERE status = 'subscribed'"),
      db.get('SELECT COUNT(*) AS count FROM contact_messages WHERE is_read = 0'),
    ]);

    const pendingPosts = await db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE p.status = 'pending_review'
        ORDER BY p.updated_at ASC LIMIT 8`
    );
    const recentPosts = await db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        ORDER BY p.updated_at DESC LIMIT 8`
    );
    const pendingUsers = await db.all(
      "SELECT * FROM users WHERE status = 'pending' ORDER BY created_at ASC LIMIT 6"
    );
    const recentComments = await db.all(
      `SELECT cm.*, p.title AS post_title, p.slug AS post_slug
         FROM comments cm JOIN posts p ON p.id = cm.post_id
        WHERE cm.status = 'pending'
        ORDER BY cm.created_at ASC LIMIT 6`
    );
    const recentAudit = await db.all(
      `SELECT a.*, u.name AS actor_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT 10`
    );

    res.render('admin/overview', {
      pageTitle: 'प्रशासन डॅशबोर्ड',
      stats: {
        posts: Number(postStats.total || 0),
        published: Number(postStats.published || 0),
        pendingPosts: Number(postStats.pending || 0),
        views: Number(postStats.views || 0),
        users: Number(userStats.total || 0),
        pendingUsers: Number(userStats.pending || 0),
        pendingComments: Number(commentPending.count || 0),
        subscribers: Number(subscriberCount.count || 0),
        unreadMessages: Number(unreadMessages.count || 0),
      },
      pendingPosts,
      recentPosts,
      pendingUsers,
      recentComments,
      recentAudit,
    });
  } catch (error) {
    next(error);
  }
});

/* ── Posts list ───────────────────────────────────────────── */
router.get('/posts', async (req, res, next) => {
  try {
    const db = getDb();
    const page = parsePage(req.query.page);
    const perPage = 15;
    const status = POST_STATUSES.includes(req.query.status) ? req.query.status : '';
    const type = ['article', 'poem', 'news', 'ghazal', 'story'].includes(req.query.type)
      ? req.query.type : '';
    const q = String(req.query.q || '').trim().slice(0, 80);

    const where = ['1 = 1'];
    const args = [];
    if (status) { where.push('p.status = ?'); args.push(status); }
    if (type) { where.push('p.type = ?'); args.push(type); }
    if (q) {
      where.push('(p.title LIKE ? OR u.name LIKE ?)');
      args.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = where.join(' AND ');
    const countRow = await db.get(
      `SELECT COUNT(*) AS count ${POST_JOINS} WHERE ${whereSql}`,
      args
    );
    const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);

    const posts = await db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${whereSql}
        ORDER BY
          CASE p.status WHEN 'pending_review' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END,
          p.updated_at DESC
        LIMIT ? OFFSET ?`,
      [...args, perPage, meta.offset]
    );

    res.render('admin/posts', {
      pageTitle: 'लेख व्यवस्थापन',
      posts,
      filters: { status, type, q },
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/admin/posts', { status, type, q }),
      },
    });
  } catch (error) {
    next(error);
  }
});

/* ── Admin create/edit post ───────────────────────────────── */
async function loadCategories(db) {
  return db.all('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
}

function adminLimits(settings) {
  return {
    title: Number(settings['limits.title'] || 90),
    excerpt: Number(settings['limits.excerpt'] || 220),
    body: Number(settings['limits.body'] || 12000),
  };
}

router.get('/posts/new', async (req, res, next) => {
  try {
    const db = getDb();
    const categories = await loadCategories(db);
    res.render('dashboard/editor', {
      pageTitle: 'नवीन लेख / बातमी',
      post: null,
      categories,
      form: {
        type: req.query.type === 'news' ? 'news' : 'article',
        language: 'mr',
        category_id: categories.length ? categories[0].id : '',
        status: 'draft',
      },
      errors: {},
      limits: adminLimits(res.locals.settings),
      isStaff: true,
      formAction: '/admin/posts',
      cancelUrl: '/admin/posts',
      adminMode: true,
    });
  } catch (error) {
    next(error);
  }
});

async function saveAdminPost(req, res, next, post) {
  const db = getDb();
  const limits = adminLimits(res.locals.settings);
  const payload = {
    title: req.body.title,
    body_md: req.body.body_md,
    excerpt: req.body.excerpt,
    type: req.body.type,
    language: req.body.language,
    category_id: req.body.category_id,
    tags: req.body.tags,
    cover_url: req.body.cover_url,
    cover_alt: req.body.cover_alt,
    seo_title: req.body.seo_title,
    seo_description: req.body.seo_description,
    source_name: req.body.source_name,
    source_url: req.body.source_url,
    is_featured: req.body.is_featured,
    is_pinned: req.body.is_pinned,
    pin_order: req.body.pin_order,
    publish_at: req.body.publish_at,
  };

  const validation = validatePostInput(payload, limits);
  const errors = { ...validation.errors };
  const data = validation.data;

  if (Object.keys(errors).length) {
    const categories = await loadCategories(db);
    return res.status(422).render('dashboard/editor', {
      pageTitle: post ? 'लेख संपादन' : 'नवीन लेख',
      post,
      categories,
      form: { ...req.body, cover_url: data.cover_url },
      errors,
      limits,
      isStaff: true,
      formAction: post ? `/admin/posts/${post.id}` : '/admin/posts',
      cancelUrl: '/admin/posts',
      adminMode: true,
    });
  }

  let coverUrl = data.cover_url;
  if (req.file) coverUrl = await saveImage(req.file, 'covers');
  if (req.body.remove_cover === '1') coverUrl = null;

  let status = POST_STATUSES.includes(req.body.status) ? req.body.status : 'draft';
  const baseSlug = String(req.body.slug || '').trim() || data.title;
  const slug = await ensureUniqueSlug(db, baseSlug, post ? post.id : null);
  const derived = derivePostFields(data);

  const now = new Date().toISOString();
  let publishAt = data.publish_at;
  if (status === 'approved' && !publishAt) {
    status = 'published';
  }
  if (status === 'published' && !publishAt) publishAt = null;

  let publishedAt = post ? post.published_at : null;
  if (status === 'published') publishedAt = publishedAt || now;
  else publishedAt = null;

  let savedId = post ? post.id : null;

  if (post) {
    await db.run(
      `INSERT INTO post_revisions (post_id, title, body_md, edited_by) VALUES (?, ?, ?, ?)`,
      [post.id, post.title, post.body_md, req.user.id]
    );
    await db.run(
      `UPDATE posts SET
         slug = ?, title = ?, excerpt = ?, body_md = ?, body_html = ?,
         type = ?, language = ?, category_id = ?, cover_url = ?, cover_alt = ?,
         tags = ?, status = ?, rejection_reason = NULL, is_featured = ?, is_pinned = ?,
         pin_order = ?, publish_at = ?, published_at = ?, reading_time = ?,
         seo_title = ?, seo_description = ?, source_url = ?, source_name = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        slug, data.title, derived.excerpt, data.body_md, derived.bodyHtml,
        data.type, data.language, data.category_id, coverUrl, data.cover_alt,
        data.tags, status, flag(req.body.is_featured), flag(req.body.is_pinned),
        Number(req.body.pin_order || 0) || 0, publishAt, publishedAt, derived.readingTime,
        data.seo_title, data.seo_description, data.source_url, data.source_name,
        now, post.id,
      ]
    );
    await logAudit(db, req, 'admin.post.update', 'post', post.id, { status });
  } else {
    const result = await db.run(
      `INSERT INTO posts
        (slug, title, excerpt, body_md, body_html, type, language, category_id, author_id,
         cover_url, cover_alt, tags, status, rejection_reason, is_featured, is_pinned,
         pin_order, publish_at, published_at, reading_time, seo_title, seo_description,
         source_url, source_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        slug, data.title, derived.excerpt, data.body_md, derived.bodyHtml,
        data.type, data.language, data.category_id, req.user.id,
        coverUrl, data.cover_alt, data.tags, status,
        flag(req.body.is_featured), flag(req.body.is_pinned),
        Number(req.body.pin_order || 0) || 0, publishAt, publishedAt, derived.readingTime,
        data.seo_title, data.seo_description, data.source_url, data.source_name,
      ]
    );
    savedId = result.lastInsertRowid;
    await logAudit(db, req, 'admin.post.create', 'post', savedId, { status });
  }

  if (post && post.status !== status) {
    await notifyAuthor(db, savedId, status, null);
  }

  res.flash('success', 'लेख जतन झाला.');
  return res.redirect('/admin/posts');
}

router.post('/posts', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    return await saveAdminPost(req, res, next, null);
  } catch (error) {
    return next(error);
  }
});

router.get('/posts/:id/edit', async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    const categories = await loadCategories(db);
    res.render('dashboard/editor', {
      pageTitle: 'लेख संपादन',
      post,
      categories,
      form: { ...post, tags: post.tags || '' },
      errors: {},
      limits: adminLimits(res.locals.settings),
      isStaff: true,
      formAction: `/admin/posts/${post.id}`,
      cancelUrl: `/admin/posts/${post.id}`,
      adminMode: true,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:id', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    return await saveAdminPost(req, res, next, post);
  } catch (error) {
    return next(error);
  }
});

/* ── Review page ──────────────────────────────────────────── */
router.get('/posts/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    const revisions = await db.all(
      `SELECT r.*, u.name AS editor_name FROM post_revisions r
         LEFT JOIN users u ON u.id = r.edited_by
        WHERE r.post_id = ? ORDER BY r.created_at DESC LIMIT 10`,
      [post.id]
    );
    const comments = await db.all(
      `SELECT * FROM comments WHERE post_id = ? ORDER BY created_at DESC LIMIT 20`,
      [post.id]
    );
    res.render('admin/review', {
      pageTitle: 'लेख पुनरावलोकन',
      post,
      revisions,
      comments,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:id/approve', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });

    const now = new Date().toISOString();
    const scheduled = post.publish_at && new Date(post.publish_at) > new Date();
    const status = scheduled ? 'approved' : 'published';
    const publishedAt = scheduled ? null : now;

    await db.run(
      `UPDATE posts SET status = ?, published_at = ?, rejection_reason = NULL, updated_at = ?
        WHERE id = ?`,
      [status, publishedAt, now, post.id]
    );
    await logAudit(db, req, 'admin.post.approve', 'post', post.id, { status });
    await notifyAuthor(db, post.id, status, null);

    res.flash(
      'success',
      scheduled
        ? 'लेख मंजूर झाला आणि नियोजित वेळी प्रकाशित होईल.'
        : 'लेख प्रकाशित झाला.'
    );
    return res.redirect('/admin/posts');
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/request-changes', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 3) {
      res.flash('error', 'बदलांचे कारण लिहा.');
      return res.redirect(`/admin/posts/${post.id}`);
    }

    await db.run(
      `UPDATE posts SET status = 'changes_requested', rejection_reason = ?, updated_at = ?
        WHERE id = ?`,
      [reason, new Date().toISOString(), post.id]
    );
    await logAudit(db, req, 'admin.post.changes', 'post', post.id, { reason });
    await notifyAuthor(db, post.id, 'changes_requested', reason);
    res.flash('success', 'लेख बदलांसाठी लेखकाकडे परत पाठवला.');
    return res.redirect('/admin/posts');
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/reject', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    const reason = String(req.body.reason || '').trim();
    if (reason.length < 3) {
      res.flash('error', 'नामंजुरीचे कारण लिहा.');
      return res.redirect(`/admin/posts/${post.id}`);
    }

    await db.run(
      `UPDATE posts SET status = 'rejected', rejection_reason = ?, updated_at = ?
        WHERE id = ?`,
      [reason, new Date().toISOString(), post.id]
    );
    await logAudit(db, req, 'admin.post.reject', 'post', post.id, { reason });
    await notifyAuthor(db, post.id, 'rejected', reason);
    res.flash('success', 'लेख नामंजूर केला.');
    return res.redirect('/admin/posts');
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/quick', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });

    await db.run(
      `UPDATE posts SET is_featured = ?, is_pinned = ?, pin_order = ?, updated_at = ?
        WHERE id = ?`,
      [flag(req.body.is_featured), flag(req.body.is_pinned), Number(req.body.pin_order || 0) || 0,
        new Date().toISOString(), post.id]
    );
    await logAudit(db, req, 'admin.post.quick', 'post', post.id, {
      featured: flag(req.body.is_featured), pinned: flag(req.body.is_pinned),
      order: Number(req.body.pin_order || 0) || 0,
    });
    res.flash('success', 'क्रम आणि प्राधान्य जतन झाले.');
    return res.redirect(req.body.back || '/admin/posts');
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadPost(db, req.params.id);
    if (!post) return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    await db.run('DELETE FROM posts WHERE id = ?', [post.id]);
    await logAudit(db, req, 'admin.post.delete', 'post', post.id, { title: post.title });
    res.flash('success', 'लेख हटवला गेला.');
    return res.redirect('/admin/posts');
  } catch (error) {
    return next(error);
  }
});

/* ── Users ────────────────────────────────────────────────── */
router.get('/users', async (req, res, next) => {
  try {
    const db = getDb();
    const page = parsePage(req.query.page);
    const perPage = 20;
    const status = ['pending', 'active', 'suspended', 'blocked'].includes(req.query.status)
      ? req.query.status : '';
    const role = ROLES.includes(req.query.role) ? req.query.role : '';
    const q = String(req.query.q || '').trim().slice(0, 80);

    const where = ['1 = 1'];
    const args = [];
    if (status) { where.push('status = ?'); args.push(status); }
    if (role) { where.push('role = ?'); args.push(role); }
    if (q) {
      where.push('(name LIKE ? OR email LIKE ? OR city LIKE ?)');
      args.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSql = where.join(' AND ');
    const countRow = await db.get(`SELECT COUNT(*) AS count FROM users WHERE ${whereSql}`, args);
    const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);

    const users = await db.all(
      `SELECT u.*,
              (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS post_count
         FROM users u WHERE ${whereSql}
        ORDER BY CASE u.status WHEN 'pending' THEN 0 ELSE 1 END, u.created_at DESC
        LIMIT ? OFFSET ?`,
      [...args, perPage, meta.offset]
    );

    res.render('admin/users', {
      pageTitle: 'वापरकर्ते',
      users,
      filters: { status, role, q },
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/admin/users', { status, role, q }),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/users/:id/approve', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [parseId(req.params.id)]);
    if (!user) return res.status(404).render('errors/404', { pageTitle: 'वापरकर्ता सापडला नाही' });

    await db.run(
      "UPDATE users SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [user.id]
    );
    await notifyUser(db, user.id, {
      type: 'account_approved',
      title: 'तुमचे खाते मंजूर झाले',
      body: 'आता तुम्ही लेख आणि कविता सादर करू शकता.',
      link: '/dashboard',
    });
    await notifyAccountApproved(user);
    await logAudit(db, req, 'admin.user.approve', 'user', user.id, { email: user.email });
    res.flash('success', `${user.name} यांचे खाते मंजूर झाले.`);
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/reject', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [parseId(req.params.id)]);
    if (!user) return res.status(404).render('errors/404', { pageTitle: 'वापरकर्ता सापडला नाही' });
    if (user.role === 'owner') {
      res.flash('error', 'मालक खाते नाकारता येत नाही.');
      return res.redirect('/admin/users');
    }
    await db.run(
      "UPDATE users SET status = 'blocked', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [user.id]
    );
    await logAudit(db, req, 'admin.user.reject', 'user', user.id, { email: user.email });
    res.flash('success', 'नोंदणी नाकारली गेली.');
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/role', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [parseId(req.params.id)]);
    if (!user) return res.status(404).render('errors/404', { pageTitle: 'वापरकर्ता सापडला नाही' });
    const role = ROLES.includes(req.body.role) ? req.body.role : null;
    if (!role) {
      res.flash('error', 'अवैध भूमिका.');
      return res.redirect('/admin/users');
    }
    if (Number(user.id) === Number(req.user.id)) {
      res.flash('error', 'स्वतःची भूमिका बदलू शकत नाही.');
      return res.redirect('/admin/users');
    }
    if ((user.role === 'owner' || role === 'owner') && !isOwner(req.user)) {
      res.flash('error', 'मालक भूमिका बदलण्याची परवानगी फक्त मालकाला आहे.');
      return res.redirect('/admin/users');
    }
    await db.run('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [role, user.id]);
    await logAudit(db, req, 'admin.user.role', 'user', user.id, { role });
    res.flash('success', 'भूमिका बदलली.');
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/auto-publish', verifyCsrf, async (req, res, next) => {
  try {
    if (!isManager(req.user)) {
      res.flash('error', 'ही कृती फक्त प्रशासकासाठी आहे.');
      return res.redirect('/admin/users');
    }
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [parseId(req.params.id)]);
    if (!user) return res.status(404).render('errors/404', { pageTitle: 'वापरकर्ता सापडला नाही' });
    const next = Number(user.auto_publish) === 1 ? 0 : 1;
    await db.run('UPDATE users SET auto_publish = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next, user.id]);
    await logAudit(db, req, 'admin.user.auto_publish', 'user', user.id, { auto_publish: next });
    res.flash('success', next ? 'थेट प्रकाशन सक्षम केले.' : 'थेट प्रकाशन बंद केले.');
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

router.post('/users/:id/suspend', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [parseId(req.params.id)]);
    if (!user) return res.status(404).render('errors/404', { pageTitle: 'वापरकर्ता सापडला नाही' });
    if (user.role === 'owner' || Number(user.id) === Number(req.user.id)) {
      res.flash('error', 'हे खाते स्थगित करता येत नाही.');
      return res.redirect('/admin/users');
    }
    const next = user.status === 'suspended' ? 'active' : 'suspended';
    await db.run('UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [next, user.id]);
    await logAudit(db, req, 'admin.user.suspend', 'user', user.id, { status: next });
    res.flash('success', next === 'suspended' ? 'खाते स्थगित केले.' : 'खाते पुन्हा सक्रिय केले.');
    return res.redirect('/admin/users');
  } catch (error) {
    return next(error);
  }
});

/* ── Comments ─────────────────────────────────────────────── */
router.get('/comments', async (req, res, next) => {
  try {
    const db = getDb();
    const page = parsePage(req.query.page);
    const perPage = 20;
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status)
      ? req.query.status : 'pending';

    const countRow = await db.get('SELECT COUNT(*) AS count FROM comments WHERE status = ?', [status]);
    const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);

    const comments = await db.all(
      `SELECT cm.*, p.title AS post_title, p.slug AS post_slug, p.type AS post_type
         FROM comments cm JOIN posts p ON p.id = cm.post_id
        WHERE cm.status = ?
        ORDER BY cm.created_at DESC LIMIT ? OFFSET ?`,
      [status, perPage, meta.offset]
    );

    res.render('admin/comments', {
      pageTitle: 'टिप्पण्या',
      comments,
      status,
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/admin/comments', { status }),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/comments/:id/:action', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const id = parseId(req.params.id);
    const action = req.params.action;
    const comment = await db.get('SELECT * FROM comments WHERE id = ?', [id]);
    if (!comment) return res.status(404).render('errors/404', { pageTitle: 'टिप्पणी सापडली नाही' });

    if (action === 'approve') {
      await db.run("UPDATE comments SET status = 'approved' WHERE id = ?", [id]);
      res.flash('success', 'टिप्पणी मंजूर केली.');
    } else if (action === 'reject') {
      await db.run("UPDATE comments SET status = 'rejected' WHERE id = ?", [id]);
      res.flash('success', 'टिप्पणी नाकारली.');
    } else if (action === 'delete') {
      await db.run('DELETE FROM comments WHERE id = ?', [id]);
      res.flash('success', 'टिप्पणी हटवली.');
    } else {
      res.flash('error', 'अवैध कृती.');
    }

    await logAudit(db, req, `admin.comment.${action}`, 'comment', id, null);
    return res.redirect(req.body.back || '/admin/comments');
  } catch (error) {
    return next(error);
  }
});

/* ── Media mentions ───────────────────────────────────────── */
router.get('/media', async (req, res, next) => {
  try {
    const db = getDb();
    const media = await db.all('SELECT * FROM media ORDER BY sort_order ASC, published_on DESC');
    res.render('admin/media', { pageTitle: 'वृत्तपत्र उल्लेख', media });
  } catch (error) {
    next(error);
  }
});

function mediaFields(values = {}) {
  return [
    { name: 'title_mr', label: 'शीर्षक (मराठी)', type: 'text', required: true, value: values.title_mr || '' },
    { name: 'publication', label: 'वृत्तपत्र / वेबसाइट', type: 'text', value: values.publication || '' },
    { name: 'url', label: 'दुवा (URL)', type: 'url', value: values.url || '' },
    { name: 'published_on', label: 'प्रकाशन दिनांक', type: 'date', value: values.published_on || '' },
    { name: 'sort_order', label: 'क्रम', type: 'number', value: values.sort_order || 0 },
    { name: 'image', label: 'चित्र (पर्यायी)', type: 'file' },
  ];
}

router.get('/media/new', (req, res) => {
  res.render('admin/entity-form', {
    pageTitle: 'नवीन वृत्तपत्र उल्लेख',
    fields: mediaFields(),
    action: '/admin/media',
    cancelUrl: '/admin/media',
    enctype: 'multipart/form-data',
  });
});

router.post('/media', upload.single('image'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const title = String(req.body.title_mr || '').trim();
    if (!title) {
      res.flash('error', 'शीर्षक आवश्यक आहे.');
      return res.redirect('/admin/media/new');
    }
    const imageUrl = req.file ? await saveImage(req.file, 'media') : null;
    await db.run(
      `INSERT INTO media (title_mr, publication, url, published_on, image_url, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, req.body.publication || null, req.body.url || null, req.body.published_on || null,
        imageUrl, Number(req.body.sort_order || 0) || 0]
    );
    await logAudit(db, req, 'admin.media.create', 'media', null, { title });
    res.flash('success', 'उल्लेख जोडला.');
    return res.redirect('/admin/media');
  } catch (error) {
    return next(error);
  }
});

router.get('/media/:id/edit', async (req, res, next) => {
  try {
    const db = getDb();
    const item = await db.get('SELECT * FROM media WHERE id = ?', [parseId(req.params.id)]);
    if (!item) return res.status(404).render('errors/404', { pageTitle: 'उल्लेख सापडला नाही' });
    res.render('admin/entity-form', {
      pageTitle: 'उल्लेख संपादन',
      fields: mediaFields(item),
      action: `/admin/media/${item.id}`,
      cancelUrl: '/admin/media',
      enctype: 'multipart/form-data',
      currentImage: item.image_url,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/media/:id', upload.single('image'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const item = await db.get('SELECT * FROM media WHERE id = ?', [parseId(req.params.id)]);
    if (!item) return res.status(404).render('errors/404', { pageTitle: 'उल्लेख सापडला नाही' });
    const imageUrl = req.file ? await saveImage(req.file, 'media') : item.image_url;
    await db.run(
      `UPDATE media SET title_mr = ?, publication = ?, url = ?, published_on = ?,
         image_url = ?, sort_order = ? WHERE id = ?`,
      [String(req.body.title_mr || '').trim(), req.body.publication || null, req.body.url || null,
        req.body.published_on || null, imageUrl, Number(req.body.sort_order || 0) || 0, item.id]
    );
    await logAudit(db, req, 'admin.media.update', 'media', item.id, null);
    res.flash('success', 'उल्लेख जतन झाला.');
    return res.redirect('/admin/media');
  } catch (error) {
    return next(error);
  }
});

router.post('/media/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM media WHERE id = ?', [parseId(req.params.id)]);
    await logAudit(db, req, 'admin.media.delete', 'media', parseId(req.params.id), null);
    res.flash('success', 'उल्लेख हटवला.');
    return res.redirect('/admin/media');
  } catch (error) {
    return next(error);
  }
});

/* ── Books ────────────────────────────────────────────────── */
router.get('/books', async (req, res, next) => {
  try {
    const db = getDb();
    const books = await db.all('SELECT * FROM books ORDER BY sort_order ASC, id DESC');
    res.render('admin/books', { pageTitle: 'पुस्तके', books });
  } catch (error) {
    next(error);
  }
});

function bookFields(values = {}) {
  return [
    { name: 'title', label: 'पुस्तकाचे नाव', type: 'text', required: true, value: values.title || '' },
    { name: 'slug', label: 'स्लग (रिकामे ठेवल्यास स्वयंचलित)', type: 'text', value: values.slug || '' },
    { name: 'description_mr', label: 'परिचय', type: 'textarea', value: values.description_mr || '' },
    { name: 'publisher', label: 'प्रकाशक', type: 'text', value: values.publisher || '' },
    { name: 'year', label: 'प्रकाशन वर्ष', type: 'text', value: values.year || '' },
    { name: 'isbn', label: 'ISBN', type: 'text', value: values.isbn || '' },
    { name: 'buy_links_json', label: 'खरेदी दुवे (JSON)', type: 'textarea', value: values.buy_links_json || '', hint: 'उदा. {"amazon":"https://..."}' },
    { name: 'sort_order', label: 'क्रम', type: 'number', value: values.sort_order || 0 },
    { name: 'cover', label: 'मुखपृष्ठ', type: 'file' },
  ];
}

router.get('/books/new', (req, res) => {
  res.render('admin/entity-form', {
    pageTitle: 'नवीन पुस्तक',
    fields: bookFields(),
    action: '/admin/books',
    cancelUrl: '/admin/books',
    enctype: 'multipart/form-data',
  });
});

router.post('/books', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const title = String(req.body.title || '').trim();
    if (!title) {
      res.flash('error', 'पुस्तकाचे नाव आवश्यक आहे.');
      return res.redirect('/admin/books/new');
    }
    const slug = await ensureUniqueSlugFor(db, 'books', req.body.slug || title);
    const coverUrl = req.file ? await saveImage(req.file, 'books') : null;
    await db.run(
      `INSERT INTO books (slug, title, cover_url, description_mr, publisher, year, isbn, buy_links_json, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [slug, title, coverUrl, req.body.description_mr || null, req.body.publisher || null,
        req.body.year || null, req.body.isbn || null, req.body.buy_links_json || null,
        Number(req.body.sort_order || 0) || 0]
    );
    await logAudit(db, req, 'admin.book.create', 'book', null, { title });
    res.flash('success', 'पुस्तक जोडले.');
    return res.redirect('/admin/books');
  } catch (error) {
    return next(error);
  }
});

router.get('/books/:id/edit', async (req, res, next) => {
  try {
    const db = getDb();
    const book = await db.get('SELECT * FROM books WHERE id = ?', [parseId(req.params.id)]);
    if (!book) return res.status(404).render('errors/404', { pageTitle: 'पुस्तक सापडले नाही' });
    res.render('admin/entity-form', {
      pageTitle: 'पुस्तक संपादन',
      fields: bookFields(book),
      action: `/admin/books/${book.id}`,
      cancelUrl: '/admin/books',
      enctype: 'multipart/form-data',
      currentImage: book.cover_url,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/books/:id', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const book = await db.get('SELECT * FROM books WHERE id = ?', [parseId(req.params.id)]);
    if (!book) return res.status(404).render('errors/404', { pageTitle: 'पुस्तक सापडले नाही' });
    const coverUrl = req.file ? await saveImage(req.file, 'books') : book.cover_url;
    const slug = req.body.slug
      ? await ensureUniqueSlugFor(db, 'books', req.body.slug, book.id)
      : book.slug;
    await db.run(
      `UPDATE books SET slug = ?, title = ?, cover_url = ?, description_mr = ?, publisher = ?,
         year = ?, isbn = ?, buy_links_json = ?, sort_order = ? WHERE id = ?`,
      [slug, String(req.body.title || '').trim(), coverUrl, req.body.description_mr || null,
        req.body.publisher || null, req.body.year || null, req.body.isbn || null,
        req.body.buy_links_json || null, Number(req.body.sort_order || 0) || 0, book.id]
    );
    await logAudit(db, req, 'admin.book.update', 'book', book.id, null);
    res.flash('success', 'पुस्तक जतन झाले.');
    return res.redirect('/admin/books');
  } catch (error) {
    return next(error);
  }
});

router.post('/books/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM books WHERE id = ?', [parseId(req.params.id)]);
    await logAudit(db, req, 'admin.book.delete', 'book', parseId(req.params.id), null);
    res.flash('success', 'पुस्तक हटवले.');
    return res.redirect('/admin/books');
  } catch (error) {
    return next(error);
  }
});

async function ensureUniqueSlugFor(db, table, base, excludeId = null) {
  const cleanBase = slugify(base) || 'item';
  let candidate = cleanBase;
  let counter = 1;
  for (;;) {
    const row = excludeId
      ? await db.get(`SELECT id FROM ${table} WHERE slug = ? AND id <> ?`, [candidate, excludeId])
      : await db.get(`SELECT id FROM ${table} WHERE slug = ?`, [candidate]);
    if (!row) return candidate;
    counter += 1;
    candidate = `${cleanBase}-${counter}`;
  }
}

/* ── Events ───────────────────────────────────────────────── */
router.get('/events', async (req, res, next) => {
  try {
    const db = getDb();
    const events = await db.all('SELECT * FROM events ORDER BY starts_at DESC');
    res.render('admin/events', { pageTitle: 'कार्यक्रम', events });
  } catch (error) {
    next(error);
  }
});

function eventFields(values = {}) {
  return [
    { name: 'title', label: 'कार्यक्रमाचे नाव', type: 'text', required: true, value: values.title || '' },
    { name: 'slug', label: 'स्लग (रिकामे ठेवल्यास स्वयंचलित)', type: 'text', value: values.slug || '' },
    { name: 'description_mr', label: 'तपशील', type: 'textarea', value: values.description_mr || '' },
    { name: 'venue', label: 'स्थळ', type: 'text', value: values.venue || '' },
    { name: 'starts_at', label: 'प्रारंभ', type: 'datetime-local', value: toLocalInput(values.starts_at) },
    { name: 'ends_at', label: 'समाप्ती', type: 'datetime-local', value: toLocalInput(values.ends_at) },
    { name: 'status', label: 'स्थिती', type: 'select', value: values.status || 'upcoming', options: [
      { value: 'upcoming', label: 'आगामी' },
      { value: 'completed', label: 'पार पडला' },
      { value: 'cancelled', label: 'रद्द' },
    ] },
    { name: 'map_url', label: 'नकाशा दुवा', type: 'url', value: values.map_url || '' },
    { name: 'cover', label: 'चित्र', type: 'file' },
  ];
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

router.get('/events/new', (req, res) => {
  res.render('admin/entity-form', {
    pageTitle: 'नवीन कार्यक्रम',
    fields: eventFields(),
    action: '/admin/events',
    cancelUrl: '/admin/events',
    enctype: 'multipart/form-data',
  });
});

router.post('/events', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const title = String(req.body.title || '').trim();
    if (!title) {
      res.flash('error', 'कार्यक्रमाचे नाव आवश्यक आहे.');
      return res.redirect('/admin/events/new');
    }
    const slug = await ensureUniqueSlugFor(db, 'events', req.body.slug || title);
    const coverUrl = req.file ? await saveImage(req.file, 'events') : null;
    await db.run(
      `INSERT INTO events (slug, title, description_mr, venue, starts_at, ends_at, cover_url, map_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [slug, title, req.body.description_mr || null, req.body.venue || null,
        req.body.starts_at || null, req.body.ends_at || null, coverUrl, req.body.map_url || null,
        req.body.status || 'upcoming']
    );
    await logAudit(db, req, 'admin.event.create', 'event', null, { title });
    res.flash('success', 'कार्यक्रम जोडला.');
    return res.redirect('/admin/events');
  } catch (error) {
    return next(error);
  }
});

router.get('/events/:id/edit', async (req, res, next) => {
  try {
    const db = getDb();
    const event = await db.get('SELECT * FROM events WHERE id = ?', [parseId(req.params.id)]);
    if (!event) return res.status(404).render('errors/404', { pageTitle: 'कार्यक्रम सापडला नाही' });
    res.render('admin/entity-form', {
      pageTitle: 'कार्यक्रम संपादन',
      fields: eventFields(event),
      action: `/admin/events/${event.id}`,
      cancelUrl: '/admin/events',
      enctype: 'multipart/form-data',
      currentImage: event.cover_url,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/events/:id', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const event = await db.get('SELECT * FROM events WHERE id = ?', [parseId(req.params.id)]);
    if (!event) return res.status(404).render('errors/404', { pageTitle: 'कार्यक्रम सापडला नाही' });
    const coverUrl = req.file ? await saveImage(req.file, 'events') : event.cover_url;
    const slug = req.body.slug
      ? await ensureUniqueSlugFor(db, 'events', req.body.slug, event.id)
      : event.slug;
    await db.run(
      `UPDATE events SET slug = ?, title = ?, description_mr = ?, venue = ?, starts_at = ?,
         ends_at = ?, cover_url = ?, map_url = ?, status = ? WHERE id = ?`,
      [slug, String(req.body.title || '').trim(), req.body.description_mr || null,
        req.body.venue || null, req.body.starts_at || null, req.body.ends_at || null,
        coverUrl, req.body.map_url || null, req.body.status || 'upcoming', event.id]
    );
    await logAudit(db, req, 'admin.event.update', 'event', event.id, null);
    res.flash('success', 'कार्यक्रम जतन झाला.');
    return res.redirect('/admin/events');
  } catch (error) {
    return next(error);
  }
});

router.post('/events/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM events WHERE id = ?', [parseId(req.params.id)]);
    await logAudit(db, req, 'admin.event.delete', 'event', parseId(req.params.id), null);
    res.flash('success', 'कार्यक्रम हटवला.');
    return res.redirect('/admin/events');
  } catch (error) {
    return next(error);
  }
});

/* ── Gallery ──────────────────────────────────────────────── */
router.get('/gallery', async (req, res, next) => {
  try {
    const db = getDb();
    const albums = await db.all(
      `SELECT a.*, (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count
         FROM albums a ORDER BY a.created_at DESC`
    );
    res.render('admin/gallery', { pageTitle: 'छायाचित्र दालन', albums });
  } catch (error) {
    next(error);
  }
});

router.post('/gallery', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const title = String(req.body.title_mr || '').trim();
    if (!title) {
      res.flash('error', 'दालनाचे नाव आवश्यक आहे.');
      return res.redirect('/admin/gallery');
    }
    const slug = await ensureUniqueSlugFor(db, 'albums', req.body.slug || title);
    const result = await db.run(
      'INSERT INTO albums (slug, title_mr, description_mr) VALUES (?, ?, ?)',
      [slug, title, req.body.description_mr || null]
    );
    await logAudit(db, req, 'admin.album.create', 'album', result.lastInsertRowid, { title });
    res.flash('success', 'दालन तयार झाले.');
    return res.redirect(`/admin/gallery/${result.lastInsertRowid}`);
  } catch (error) {
    return next(error);
  }
});

router.get('/gallery/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const album = await db.get('SELECT * FROM albums WHERE id = ?', [parseId(req.params.id)]);
    if (!album) return res.status(404).render('errors/404', { pageTitle: 'दालन सापडले नाही' });
    const photos = await db.all(
      'SELECT * FROM photos WHERE album_id = ? ORDER BY sort_order ASC, id ASC',
      [album.id]
    );
    res.render('admin/album', { pageTitle: 'दालन व्यवस्थापन', album, photos });
  } catch (error) {
    next(error);
  }
});

router.post('/gallery/:id/photos', upload.array('photos', 12), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const album = await db.get('SELECT * FROM albums WHERE id = ?', [parseId(req.params.id)]);
    if (!album) return res.status(404).render('errors/404', { pageTitle: 'दालन सापडले नाही' });
    const urls = await saveImages(req.files || [], 'gallery');
    const caption = String(req.body.caption_mr || '').trim();
    let order = Number(req.body.sort_order || 0) || 0;
    for (const url of urls) {
      await db.run(
        'INSERT INTO photos (album_id, url, alt_mr, caption_mr, sort_order) VALUES (?, ?, ?, ?, ?)',
        [album.id, url, caption || null, caption || null, order]
      );
      order += 1;
    }
    if (!album.cover_url && urls.length) {
      await db.run('UPDATE albums SET cover_url = ? WHERE id = ?', [urls[0], album.id]);
    }
    await logAudit(db, req, 'admin.album.photos', 'album', album.id, { count: urls.length });
    res.flash('success', `${toMarathiDigits(urls.length)} छायाचित्रे जोडली.`);
    return res.redirect(`/admin/gallery/${album.id}`);
  } catch (error) {
    return next(error);
  }
});

router.post('/gallery/:id/photos/:photoId/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM photos WHERE id = ? AND album_id = ?', [
      parseId(req.params.photoId), parseId(req.params.id),
    ]);
    res.flash('success', 'छायाचित्र हटवले.');
    return res.redirect(`/admin/gallery/${req.params.id}`);
  } catch (error) {
    return next(error);
  }
});

router.post('/gallery/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM albums WHERE id = ?', [parseId(req.params.id)]);
    await logAudit(db, req, 'admin.album.delete', 'album', parseId(req.params.id), null);
    res.flash('success', 'दालन हटवले.');
    return res.redirect('/admin/gallery');
  } catch (error) {
    return next(error);
  }
});

/* ── Messages ─────────────────────────────────────────────── */
router.get('/messages', async (req, res, next) => {
  try {
    const db = getDb();
    const page = parsePage(req.query.page);
    const perPage = 20;
    const countRow = await db.get('SELECT COUNT(*) AS count FROM contact_messages');
    const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);
    const messages = await db.all(
      'SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [perPage, meta.offset]
    );
    res.render('admin/messages', {
      pageTitle: 'संपर्क संदेश',
      messages,
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/admin/messages', {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/messages/:id/read', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [parseId(req.params.id)]);
    return res.redirect('/admin/messages');
  } catch (error) {
    return next(error);
  }
});

router.post('/messages/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM contact_messages WHERE id = ?', [parseId(req.params.id)]);
    res.flash('success', 'संदेश हटवला.');
    return res.redirect('/admin/messages');
  } catch (error) {
    return next(error);
  }
});

/* ── Subscribers ──────────────────────────────────────────── */
router.get('/subscribers', async (req, res, next) => {
  try {
    const db = getDb();
    const subscribers = await db.all(
      'SELECT * FROM subscribers ORDER BY created_at DESC LIMIT 500'
    );
    res.render('admin/subscribers', { pageTitle: 'वृत्तपत्र ग्राहक', subscribers });
  } catch (error) {
    next(error);
  }
});

router.get('/subscribers.csv', async (req, res, next) => {
  try {
    const db = getDb();
    const subscribers = await db.all(
      "SELECT email, name, status, created_at FROM subscribers WHERE status = 'subscribed' ORDER BY created_at DESC"
    );
    const rows = [
      ['email', 'name', 'status', 'created_at'],
      ...subscribers.map((s) => [s.email, s.name || '', s.status, s.created_at]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');
    res.type('text/csv').attachment('subscribers.csv').send(csv);
  } catch (error) {
    next(error);
  }
});

router.post('/subscribers/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run('DELETE FROM subscribers WHERE id = ?', [parseId(req.params.id)]);
    res.flash('success', 'ग्राहक हटवला.');
    return res.redirect('/admin/subscribers');
  } catch (error) {
    return next(error);
  }
});

/* ── Settings ─────────────────────────────────────────────── */
router.get('/settings', async (req, res, next) => {
  try {
    const settings = res.locals.settings;
    const sections = safeJsonParse(settings['home.sections'], HOME_SECTIONS)
      .filter((name) => HOME_SECTIONS.includes(name));
    res.render('admin/settings', {
      pageTitle: 'साइट सेटिंग्ज',
      settings,
      sections,
      sectionLabels: {
        hero: 'मुख्य परिचय (Hero)',
        news: 'ताज्या बातम्या',
        featured: 'विशेष लेख',
        latest: 'नवीन साहित्य',
        poem: 'कविता',
        timeline: 'कालरेषा',
        books: 'पुस्तके',
        events: 'कार्यक्रम',
        newsletter: 'वृत्तपत्र नोंदणी',
      },
      homeSections: HOME_SECTIONS,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/settings', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const textKeys = [
      'site.name', 'site.name_en', 'site.tagline', 'site.description',
      'site.owner_name', 'site.owner_name_en', 'site.contact_email',
      'site.contact_phone', 'site.address', 'site.facebook', 'site.youtube',
      'site.instagram', 'site.x', 'site.whatsapp', 'home.quote',
    ];
    for (const key of textKeys) {
      if (Object.prototype.hasOwnProperty.call(req.body, key.replace(/\./g, '_'))) {
        await setSetting(db, key, String(req.body[key.replace(/\./g, '_')] || '').trim());
      }
    }

    for (const feature of ['comments', 'newsletter', 'gallery', 'events']) {
      const field = `features_${feature}`;
      await setSetting(db, `features.${feature}`, req.body[field] ? '1' : '0');
    }

    const titleLimit = Math.min(Math.max(Number(req.body.limits_title) || 90, 20), 200);
    const excerptLimit = Math.min(Math.max(Number(req.body.limits_excerpt) || 220, 40), 600);
    const bodyLimit = Math.min(Math.max(Number(req.body.limits_body) || 12000, 500), 60000);
    await setSetting(db, 'limits.title', String(titleLimit));
    await setSetting(db, 'limits.excerpt', String(excerptLimit));
    await setSetting(db, 'limits.body', String(bodyLimit));

    invalidateSettingsCache();
    await logAudit(db, req, 'admin.settings.update', 'settings', null, null);
    res.flash('success', 'सेटिंग्ज जतन झाल्या.');
    return res.redirect('/admin/settings');
  } catch (error) {
    return next(error);
  }
});

router.post('/settings/section-move', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const section = String(req.body.section || '');
    const direction = req.body.direction === 'up' ? -1 : 1;
    const current = safeJsonParse(res.locals.settings['home.sections'], HOME_SECTIONS)
      .filter((name) => HOME_SECTIONS.includes(name));

    const index = current.indexOf(section);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= current.length) {
      return res.redirect('/admin/settings');
    }

    [current[index], current[target]] = [current[target], current[index]];
    await setSetting(db, 'home.sections', JSON.stringify(current));
    invalidateSettingsCache();
    await logAudit(db, req, 'admin.settings.section_move', 'settings', null, { section, direction });
    return res.redirect('/admin/settings');
  } catch (error) {
    return next(error);
  }
});

/* ── Audit log ────────────────────────────────────────────── */
router.get('/audit', async (req, res, next) => {
  try {
    const db = getDb();
    const page = parsePage(req.query.page);
    const perPage = 40;
    const countRow = await db.get('SELECT COUNT(*) AS count FROM audit_logs');
    const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);
    const logs = await db.all(
      `SELECT a.*, u.name AS actor_name
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
        ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      [perPage, meta.offset]
    );
    res.render('admin/audit', {
      pageTitle: 'ऑडिट लॉग',
      logs,
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/admin/audit', {}),
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
