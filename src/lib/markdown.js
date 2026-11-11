const MarkdownIt = require('markdown-it');
const sanitizeHtml = require('sanitize-html');

// markdown-it is used instead of marked because marked v5+ is ESM-only and
// Vercel's Node.js runtime cannot `require()` ESM modules from CommonJS.
const markdown = new MarkdownIt({ html: true, linkify: false, breaks: true });

const ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  'img', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'del', 'ins', 'mark', 'hr',
]);

function renderMarkdown(md) {
  const raw = markdown.render(String(md || ''));
  return sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
      a: ['href', 'title', 'target', 'rel'],
      '*': ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: 'noopener noreferrer' },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, loading: 'lazy' },
      }),
    },
  });
}

function stripMarkdown(md) {
  return String(md || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readingTime(md) {
  const words = stripMarkdown(md).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function makeExcerpt(md, length = 220) {
  const text = stripMarkdown(md);
  if (text.length <= length) return text;
  return text.slice(0, length - 1).replace(/\s+\S*$/, '') + '…';
}

module.exports = { renderMarkdown, stripMarkdown, readingTime, makeExcerpt };
