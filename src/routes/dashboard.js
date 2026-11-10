'use strict';

const express = require('express');
const { getDb } = require('../db');
const {
  requireAuth,
  isAdmin,
  canEditPost,
  hashPassword,
  verifyPassword,
} = require('../lib/auth');
const {
  POST_SELECT,
  POST_JOINS,
  ensureUniqueSlug,
  validatePostInput,
  derivePostFields,
  submitStatusFor,
} = require('../lib/posts');
const { upload, saveImage } = require('../lib/storage');
const { verifyCsrf } = require('../lib/csrf');
const { notifyStaff, logAudit } = require('../lib/notifications');
const { notifyOwnerNewSubmission } = require('../lib/email');
const { paginationMeta, paginationLinks, safeJsonParse, formatDateMr } = require('../lib/helpers');

const router = express.Router();

router.use(requireAuth);

function limitsFrom(settings) {
  return {
    title: Number(settings['limits.title'] || 90),
    excerpt: Number(settings['limits.excerpt'] || 220),
    body: Number(settings['limits.body'] || 12000),
  };
}

async function loadCategories(db) {
  return db.all('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC');
}

async function loadOwnPost(db, id, user) {
  const post = await db.get(`SELECT ${POST_SELECT} ${POST_JOINS} WHERE p.id = ?`, [Number(id)]);
  if (!post) return null;
  if (!canEditPost(user, post)) return null;
  return post;
}

function accountCanWrite(user) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return user.status === 'active';
}

/* ── Overview ─────────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const counts = await db.get(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN status = 'pending_review' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) AS drafts,
         SUM(CASE WHEN status = 'changes_requested' THEN 1 ELSE 0 END) AS changes,
         COALESCE(SUM(view_count), 0) AS views
       FROM posts WHERE author_id = ?`,
      [userId]
    );

    const recent = await db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE p.author_id = ? ORDER BY p.updated_at DESC LIMIT 6`,
      [userId]
    );

    const notifications = await db.all(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 6`,
      [userId]
    );

    res.render('dashboard/overview', {
      pageTitle: 'माझे डॅशबोर्ड',
      counts: {
        total: Number(counts.total || 0),
        published: Number(counts.published || 0),
        pending: Number(counts.pending || 0),
        drafts: Number(counts.drafts || 0),
        changes: Number(counts.changes || 0),
        views: Number(counts.views || 0),
      },
      recent,
      notifications,
      canWrite: accountCanWrite(req.user),
    });
  } catch (error) {
    next(error);
  }
});

/* ── My posts ─────────────────────────────────────────────── */
router.get('/posts', async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, Number(req.query.page) || 1);
    const perPage = 12;
    const status = ['draft', 'pending_review', 'changes_requested', 'published', 'rejected', 'approved', 'archived']
      .includes(req.query.status) ? req.query.status : '';

    const where = ['p.author_id = ?'];
    const args = [req.user.id];
    if (status) {
      where.push('p.status = ?');
      args.push(status);
    }

    const countRow = await db.get(
      `SELECT COUNT(*) AS count FROM posts p WHERE ${where.join(' AND ')}`,
      args
    );
    const meta = paginationMeta(countRow ? countRow.count : 0, page, perPage);

    const posts = await db.all(
      `SELECT ${POST_SELECT} ${POST_JOINS}
        WHERE ${where.join(' AND ')}
        ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      [...args, perPage, meta.offset]
    );

    res.render('dashboard/posts', {
      pageTitle: 'माझे लेख',
      posts,
      status,
      pagination: {
        ...meta,
        links: paginationLinks(meta.page, meta.pages, '/dashboard/posts', { status }),
      },
      canWrite: accountCanWrite(req.user),
    });
  } catch (error) {
    next(error);
  }
});

/* ── New post ─────────────────────────────────────────────── */
router.get('/posts/new', async (req, res, next) => {
  try {
    if (!accountCanWrite(req.user)) {
      res.flash('warning', 'तुमचे खाते अजून मंजूर झाले नाही. मंजुरीनंतर तुम्ही लेख सादर करू शकता.');
      return res.redirect('/dashboard');
    }
    const db = getDb();
    const categories = await loadCategories(db);
    res.render('dashboard/editor', {
      pageTitle: 'नवीन लेख',
      post: null,
      categories,
      form: {
        type: 'article',
        language: 'mr',
        category_id: categories.length ? categories[0].id : '',
      },
      errors: {},
      limits: limitsFrom(res.locals.settings),
      isStaff: isAdmin(req.user),
    });
  } catch (error) {
    next(error);
  }
});

function postPayloadFrom(body) {
  return {
    title: body.title,
    body_md: body.body_md,
    excerpt: body.excerpt,
    type: body.type,
    language: body.language,
    category_id: body.category_id,
    tags: body.tags,
    cover_url: body.cover_url,
    cover_alt: body.cover_alt,
    seo_title: body.seo_title,
    seo_description: body.seo_description,
    source_name: body.source_name,
    source_url: body.source_url,
    is_featured: body.is_featured,
    is_pinned: body.is_pinned,
    pin_order: body.pin_order,
    publish_at: body.publish_at,
  };
}

async function handleSave(req, res, next, post) {
  const db = getDb();
  const action = req.body.action === 'submit' ? 'submit' : 'draft';
  const limits = limitsFrom(res.locals.settings);
  const payload = postPayloadFrom(req.body);

  const validation = validatePostInput(payload, limits);
  const errors = { ...validation.errors };
  const data = validation.data;

  if (action === 'submit' && !data.body_md) {
    errors.body_md = errors.body_md || 'सादर करण्यापूर्वी मजकूर लिहा.';
  }

  if (Object.keys(errors).length) {
    const categories = await loadCategories(db);
    return res.status(422).render('dashboard/editor', {
      pageTitle: post ? 'लेख संपादन' : 'नवीन लेख',
      post,
      categories,
      form: { ...req.body, cover_url: data.cover_url },
      errors,
      limits,
      isStaff: isAdmin(req.user),
    });
  }

  let coverUrl = data.cover_url;
  if (req.file) {
    coverUrl = await saveImage(req.file, 'covers');
  }
  if (req.body.remove_cover === '1') {
    coverUrl = null;
  }

  const baseSlug = String(req.body.slug || '').trim() || data.title;
  const slug = await ensureUniqueSlug(db, baseSlug, post ? post.id : null);
  const derived = derivePostFields({ ...data, excerpt: data.excerpt });

  let status;
  if (action === 'submit') {
    status = submitStatusFor(req.user);
  } else {
    status = isAdmin(req.user) && post ? post.status : 'draft';
  }

  const now = new Date().toISOString();
  let publishedAt = post ? post.published_at : null;
  if (status === 'published') {
    publishedAt = publishedAt || now;
  } else {
    publishedAt = null;
  }

  let savedId = post ? post.id : null;

  if (post) {
    await db.run(
      `INSERT INTO post_revisions (post_id, title, body_md, edited_by)
       VALUES (?, ?, ?, ?)`,
      [post.id, post.title, post.body_md, req.user.id]
    );

    await db.run(
      `UPDATE posts SET
         slug = ?, title = ?, excerpt = ?, body_md = ?, body_html = ?,
         type = ?, language = ?, category_id = ?, cover_url = ?, cover_alt = ?,
         tags = ?, status = ?, rejection_reason = ?, is_featured = ?, is_pinned = ?,
         pin_order = ?, publish_at = ?, published_at = ?, reading_time = ?,
         seo_title = ?, seo_description = ?, source_url = ?, source_name = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        slug, data.title, derived.excerpt, data.body_md, derived.bodyHtml,
        data.type, data.language, data.category_id, coverUrl, data.cover_alt,
        data.tags, status, action === 'submit' ? null : post.rejection_reason,
        data.is_featured, data.is_pinned, data.pin_order, data.publish_at,
        publishedAt, derived.readingTime, data.seo_title, data.seo_description,
        data.source_url, data.source_name, now, post.id,
      ]
    );

    await logAudit(db, req, action === 'submit' ? 'post.submit' : 'post.update', 'post', post.id, {
      title: data.title, status,
    });
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
        data.is_featured, data.is_pinned, data.pin_order, data.publish_at,
        publishedAt, derived.readingTime, data.seo_title, data.seo_description,
        data.source_url, data.source_name,
      ]
    );

    await logAudit(db, req, action === 'submit' ? 'post.submit' : 'post.create', 'post', result.lastInsertRowid, {
      title: data.title, status,
    });
    savedId = result.lastInsertRowid;
  }

  if (action === 'submit' && status === 'pending_review') {
    const saved = await db.get(
      `SELECT ${POST_SELECT} ${POST_JOINS} WHERE p.id = ?`,
      [savedId]
    );
    await notifyStaff(db, {
      type: 'post_pending',
      title: 'नवीन लेख मंजुरीसाठी',
      body: `${req.user.name} यांनी "${data.title}" सादर केला आहे.`,
      link: `/admin/posts/${saved.id}`,
    });
    await notifyOwnerNewSubmission(saved, req.user);
  }

  if (action === 'submit') {
    res.flash(
      'success',
      status === 'published'
        ? 'तुमचा लेख प्रकाशित झाला आहे.'
        : 'तुमचा लेख मंजुरीसाठी सादर झाला आहे. मंजुरीनंतर तो प्रकाशित होईल.'
    );
  } else {
    res.flash('success', 'मसुदा जतन झाला.');
  }
  return res.redirect('/dashboard/posts');
}

router.post('/posts', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    if (!accountCanWrite(req.user)) {
      res.flash('warning', 'तुमचे खाते अजून मंजूर झाले नाही.');
      return res.redirect('/dashboard');
    }
    return await handleSave(req, res, next, null);
  } catch (error) {
    return next(error);
  }
});

/* ── Edit post ────────────────────────────────────────────── */
router.get('/posts/:id/edit', async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadOwnPost(db, req.params.id, req.user);
    if (!post) {
      return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    }
    const categories = await loadCategories(db);
    res.render('dashboard/editor', {
      pageTitle: 'लेख संपादन',
      post,
      categories,
      form: {
        ...post,
        tags: post.tags || '',
        social: safeJsonParse(post.social_json, {}),
      },
      errors: {},
      limits: limitsFrom(res.locals.settings),
      isStaff: isAdmin(req.user),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:id', upload.single('cover'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadOwnPost(db, req.params.id, req.user);
    if (!post) {
      return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    }
    if (!accountCanWrite(req.user) && post.status !== 'draft') {
      res.flash('warning', 'तुमचे खाते अजून मंजूर झाले नाही.');
      return res.redirect('/dashboard');
    }
    return await handleSave(req, res, next, post);
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/submit', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadOwnPost(db, req.params.id, req.user);
    if (!post) {
      return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    }
    if (!accountCanWrite(req.user)) {
      res.flash('warning', 'तुमचे खाते अजून मंजूर झाले नाही.');
      return res.redirect('/dashboard');
    }
    if (!post.title || !post.body_md) {
      res.flash('error', 'सादर करण्यापूर्वी शीर्षक आणि मजकूर आवश्यक आहे.');
      return res.redirect(`/dashboard/posts/${post.id}/edit`);
    }

    const status = submitStatusFor(req.user);
    const now = new Date().toISOString();
    await db.run(
      `UPDATE posts SET status = ?, rejection_reason = NULL,
         published_at = ?, updated_at = ? WHERE id = ?`,
      [status, status === 'published' ? (post.published_at || now) : null, now, post.id]
    );

    await logAudit(db, req, 'post.submit', 'post', post.id, { status });

    if (status === 'pending_review') {
      await notifyStaff(db, {
        type: 'post_pending',
        title: 'नवीन लेख मंजुरीसाठी',
        body: `${req.user.name} यांनी "${post.title}" सादर केला आहे.`,
        link: `/admin/posts/${post.id}`,
      });
      await notifyOwnerNewSubmission(post, req.user);
    }

    res.flash('success', status === 'published' ? 'लेख प्रकाशित झाला.' : 'लेख मंजुरीसाठी सादर झाला.');
    return res.redirect('/dashboard/posts');
  } catch (error) {
    return next(error);
  }
});

router.post('/posts/:id/delete', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const post = await loadOwnPost(db, req.params.id, req.user);
    if (!post) {
      return res.status(404).render('errors/404', { pageTitle: 'लेख सापडला नाही' });
    }
    if (post.status === 'published' && !isAdmin(req.user)) {
      res.flash('error', 'प्रकाशित लेख हटवण्यासाठी प्रशासकाशी संपर्क साधा.');
      return res.redirect('/dashboard/posts');
    }
    await db.run('DELETE FROM posts WHERE id = ?', [post.id]);
    await logAudit(db, req, 'post.delete', 'post', post.id, { title: post.title });
    res.flash('success', 'लेख हटवला गेला.');
    return res.redirect('/dashboard/posts');
  } catch (error) {
    return next(error);
  }
});

/* ── Profile ──────────────────────────────────────────────── */
router.get('/profile', async (req, res, next) => {
  try {
    const db = getDb();
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.render('dashboard/profile', {
      pageTitle: 'माझी माहिती',
      profile: user,
      social: safeJsonParse(user.social_json, {}),
      errors: {},
      passwordErrors: {},
    });
  } catch (error) {
    next(error);
  }
});

router.post('/profile', upload.single('avatar'), verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const name = String(req.body.name || '').trim();
    const penName = String(req.body.pen_name || '').trim();
    const bio = String(req.body.bio || '').trim();
    const city = String(req.body.city || '').trim();
    const phone = String(req.body.phone || '').trim();
    const social = {
      facebook: String(req.body.facebook || '').trim(),
      youtube: String(req.body.youtube || '').trim(),
      instagram: String(req.body.instagram || '').trim(),
      x: String(req.body.x || '').trim(),
      whatsapp: String(req.body.whatsapp || '').trim(),
    };

    const errors = {};
    if (name.length < 2) errors.name = 'कृपया पूर्ण नाव लिहा.';
    if (bio.length > 1200) errors.bio = 'परिचय १२०० अक्षरांपेक्षा जास्त नसावा.';

    if (Object.keys(errors).length) {
      const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
      return res.status(422).render('dashboard/profile', {
        pageTitle: 'माझी माहिती',
        profile: { ...user, name, pen_name: penName, bio, city, phone },
        social,
        errors,
        passwordErrors: {},
      });
    }

    let avatarUrl = req.user.avatar_url;
    if (req.file) avatarUrl = await saveImage(req.file, 'avatars');

    await db.run(
      `UPDATE users SET name = ?, pen_name = ?, bio = ?, city = ?, phone = ?,
         avatar_url = ?, social_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, penName || null, bio || null, city || null, phone || null, avatarUrl, JSON.stringify(social), req.user.id]
    );

    res.flash('success', 'तुमची माहिती जतन झाली.');
    return res.redirect('/dashboard/profile');
  } catch (error) {
    return next(error);
  }
});

router.post('/password', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    const current = String(req.body.current_password || '');
    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');

    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const passwordErrors = {};

    if (!verifyPassword(current, user.password_hash)) {
      passwordErrors.current_password = 'सध्याचा पासवर्ड चुकीचा आहे.';
    }
    if (password.length < 8) passwordErrors.password = 'नवीन पासवर्ड किमान ८ अक्षरांचा असावा.';
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      passwordErrors.password = 'पासवर्डमध्ये अक्षर आणि अंक दोन्ही असावेत.';
    }
    if (password !== confirm) passwordErrors.confirm = 'दोन्ही पासवर्ड जुळत नाहीत.';

    if (Object.keys(passwordErrors).length) {
      const profile = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
      return res.status(422).render('dashboard/profile', {
        pageTitle: 'माझी माहिती',
        profile,
        social: safeJsonParse(profile.social_json, {}),
        errors: {},
        passwordErrors,
      });
    }

    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [hashPassword(password), req.user.id]
    );

    res.flash('success', 'पासवर्ड बदलला गेला.');
    return res.redirect('/dashboard/profile');
  } catch (error) {
    return next(error);
  }
});

/* ── Notifications ────────────────────────────────────────── */
router.get('/notifications', async (req, res, next) => {
  try {
    const db = getDb();
    const notifications = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100',
      [req.user.id]
    );
    res.render('dashboard/notifications', {
      pageTitle: 'सूचना',
      notifications,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notifications/read', verifyCsrf, async (req, res, next) => {
  try {
    const db = getDb();
    await db.run(
      'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',
      [req.user.id]
    );
    res.flash('success', 'सर्व सूचना वाचल्या म्हणून चिन्हांकित केल्या.');
    return res.redirect('/dashboard/notifications');
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
