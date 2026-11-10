'use strict';

const { renderMarkdown, readingTime, makeExcerpt } = require('./markdown');
const { slugify } = require('./helpers');

const POST_TYPES = ['article', 'poem', 'news', 'ghazal', 'story'];
const LANGUAGES = ['mr', 'ahr', 'hi', 'en'];

const POST_SELECT = `
  p.*,
  u.name AS author_name,
  u.email AS author_email,
  u.pen_name AS author_pen_name,
  u.avatar_url AS author_avatar,
  c.name_mr AS category_name,
  c.slug AS category_slug,
  c.kind AS category_kind
`;

const POST_JOINS = `
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN categories c ON c.id = p.category_id
`;

const PUBLISHED_WHERE = "p.status = 'published' AND p.published_at IS NOT NULL";

async function ensureUniqueSlug(db, base, excludeId = null) {
  const cleanBase = slugify(base) || 'lekh';
  let candidate = cleanBase;
  let counter = 1;
  for (;;) {
    const row = excludeId
      ? await db.get('SELECT id FROM posts WHERE slug = ? AND id <> ?', [candidate, Number(excludeId)])
      : await db.get('SELECT id FROM posts WHERE slug = ?', [candidate]);
    if (!row) return candidate;
    counter += 1;
    candidate = `${cleanBase}-${counter}`;
  }
}

function validatePostInput(input, limits = {}) {
  const titleLimit = Number(limits.title || 90);
  const excerptLimit = Number(limits.excerpt || 220);
  const bodyLimit = Number(limits.body || 12000);

  const errors = {};
  const title = String(input.title || '').trim();
  const bodyMd = String(input.body_md || '').trim();
  const excerpt = String(input.excerpt || '').trim();
  const type = POST_TYPES.includes(input.type) ? input.type : 'article';
  const language = LANGUAGES.includes(input.language) ? input.language : 'mr';
  const categoryId = input.category_id ? Number(input.category_id) : null;
  const tags = String(input.tags || '').trim();
  const coverUrl = String(input.cover_url || '').trim();
  const coverAlt = String(input.cover_alt || '').trim();

  if (!title) errors.title = 'शीर्षक आवश्यक आहे.';
  else if (title.length > titleLimit) {
    errors.title = `शीर्षक ${titleLimit} अक्षरांपेक्षा जास्त नसावे (सध्या ${title.length}).`;
  }

  if (!bodyMd) errors.body_md = 'मजकूर आवश्यक आहे.';
  else if (bodyMd.length > bodyLimit) {
    errors.body_md = `मजकूर ${bodyLimit} अक्षरांपेक्षा जास्त नसावा (सध्या ${bodyMd.length}).`;
  }

  if (excerpt.length > excerptLimit) {
    errors.excerpt = `सारांश ${excerptLimit} अक्षरांपेक्षा जास्त नसावा (सध्या ${excerpt.length}).`;
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    data: {
      title,
      body_md: bodyMd,
      excerpt,
      type,
      language,
      category_id: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : null,
      tags: tags || null,
      cover_url: coverUrl || null,
      cover_alt: coverAlt || null,
      seo_title: String(input.seo_title || '').trim() || null,
      seo_description: String(input.seo_description || '').trim() || null,
      source_name: String(input.source_name || '').trim() || null,
      source_url: String(input.source_url || '').trim() || null,
      is_featured: input.is_featured ? 1 : 0,
      is_pinned: input.is_pinned ? 1 : 0,
      pin_order: Number(input.pin_order || 0) || 0,
      publish_at: String(input.publish_at || '').trim() || null,
    },
  };
}

function derivePostFields(data) {
  const bodyHtml = renderMarkdown(data.body_md);
  const excerpt = data.excerpt || makeExcerpt(data.body_md, 220);
  return {
    bodyHtml,
    excerpt,
    readingTime: readingTime(data.body_md),
  };
}

function submitStatusFor(user) {
  if (!user) return 'pending_review';
  if (user.role === 'owner' || user.role === 'admin') return 'published';
  if (Number(user.auto_publish) === 1) return 'published';
  return 'pending_review';
}

module.exports = {
  POST_TYPES,
  LANGUAGES,
  POST_SELECT,
  POST_JOINS,
  PUBLISHED_WHERE,
  ensureUniqueSlug,
  validatePostInput,
  derivePostFields,
  submitStatusFor,
};
