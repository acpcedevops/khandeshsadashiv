'use strict';

/* ─────────────────────────────────────────────────────────────
   Devanagari helpers, Marathi formatting and view utilities
   ───────────────────────────────────────────────────────────── */

const MR_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
const MR_MONTHS = [
  'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर',
];
const MR_WEEKDAYS = ['रविवार', 'सोमवार', 'मंगळवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'];

const POST_TYPE_LABELS = {
  article: 'लेख',
  poem: 'कविता',
  news: 'बातमी',
  ghazal: 'गझल',
  story: 'कथा',
};

const LANGUAGE_LABELS = {
  mr: 'मराठी',
  ahr: 'अहिराणी',
  hi: 'हिंदी',
  en: 'इंग्रजी',
};

const STATUS_LABELS = {
  draft: 'मसुदा',
  pending_review: 'पुनरावलोकनासाठी सादर',
  approved: 'मंजूर',
  changes_requested: 'बदल आवश्यक',
  rejected: 'नामंजूर',
  published: 'प्रकाशित',
  archived: 'संग्रहित',
};

const ROLE_LABELS = {
  owner: 'मालक',
  admin: 'प्रशासक',
  editor: 'संपादक',
  contributor: 'लेखक',
  reader: 'वाचक',
};

const USER_STATUS_LABELS = {
  pending: 'मंजुरी प्रतीक्षेत',
  active: 'सक्रिय',
  suspended: 'स्थगित',
  blocked: 'प्रतिबंधित',
};

/* ── Devanagari → Latin transliteration for slugs ───────────── */
const DEV_MAP = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ॠ': 'rri', 'ऌ': 'li', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
  'ऍ': 'e', 'ऑ': 'o', 'ऎ': 'e', 'ऒ': 'o',
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh',
  'स': 's', 'ह': 'h', 'ळ': 'l', 'क्ष': 'ksh', 'ज्ञ': 'gy',
  'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o',
  'ं': 'n', 'ँ': 'n', 'ः': 'h', '्': '', '़': '', 'ऽ': '',
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
  '।': '', '॥': '', '₹': 'rs',
};

const DEV_CONSONANTS = new Set('कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसहळ');
const DEV_MATRAS = new Set('ा ि ी ु ू ृ े ै ो ौ ॅ ॉ'.split(' '));

function transliterate(input) {
  const chars = Array.from(String(input || ''));
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];

    if (ch === 'क' && next === '्' && chars[i + 2] === 'ष') { out += 'ksh'; i += 2; continue; }
    if (ch === 'ज' && next === '्' && chars[i + 2] === 'ञ') { out += 'gy'; i += 2; continue; }

    if (DEV_CONSONANTS.has(ch)) {
      out += DEV_MAP[ch] || '';
      if (!(next && (DEV_MATRAS.has(next) || next === '्' || next === '़'))) {
        out += 'a';
      }
      continue;
    }
    if (ch === '्') continue;
    if (Object.prototype.hasOwnProperty.call(DEV_MAP, ch)) {
      out += DEV_MAP[ch];
      continue;
    }
    out += ch;
  }
  return out;
}

function slugify(input, fallback = 'lekh') {
  const transliterated = transliterate(input);
  let slug = transliterated
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  if (!slug) {
    slug = `${fallback}-${Math.random().toString(36).slice(2, 7)}`;
  }
  return slug;
}

/* ── Marathi numbers and dates ─────────────────────────────── */
function toMarathiDigits(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => MR_DIGITS[Number(d)]);
}

function toEnglishDigits(value) {
  return String(value ?? '').replace(/[०-९]/g, (d) => String(MR_DIGITS.indexOf(d)));
}

function formatDateMr(value, options = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = toMarathiDigits(date.getDate());
  const month = MR_MONTHS[date.getMonth()];
  const year = toMarathiDigits(date.getFullYear());
  if (options.weekday) {
    return `${MR_WEEKDAYS[date.getDay()]}, ${day} ${month} ${year}`;
  }
  if (options.short) return `${day} ${month}`;
  if (options.noYear) return `${day} ${month}`;
  return `${day} ${month} ${year}`;
}

function formatDateTimeMr(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDateMr(date)}, ${toMarathiDigits(hours)}:${toMarathiDigits(minutes)}`;
}

function isoDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function timeAgoMr(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'आत्ताच';
  if (minutes < 60) return `${toMarathiDigits(minutes)} मिनिटांपूर्वी`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toMarathiDigits(hours)} तासांपूर्वी`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${toMarathiDigits(days)} दिवसांपूर्वी`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${toMarathiDigits(months)} महिन्यांपूर्वी`;
  return formatDateMr(date);
}

/* ── Labels ────────────────────────────────────────────────── */
function postTypeLabel(type) {
  return POST_TYPE_LABELS[type] || type || 'लेख';
}
function languageLabel(lang) {
  return LANGUAGE_LABELS[lang] || lang || 'मराठी';
}
function statusLabel(status) {
  return STATUS_LABELS[status] || status || '';
}
function roleLabel(role) {
  return ROLE_LABELS[role] || role || '';
}
function userStatusLabel(status) {
  return USER_STATUS_LABELS[status] || status || '';
}

function typeBadgeClass(type) {
  if (type === 'poem') return 'badge-poem';
  if (type === 'news') return 'badge-news';
  return 'badge';
}

function statusBadgeClass(status) {
  const safe = String(status || '').replace(/[^a-z_]/g, '');
  return `badge badge-status badge-status-${safe}`;
}

/* ── Text helpers ──────────────────────────────────────────── */
function truncate(text, length = 120) {
  const str = String(text || '').trim();
  if (str.length <= length) return str;
  return `${str.slice(0, length - 1).replace(/\s+\S*$/, '')}…`;
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return 'स';
  const letters = parts.slice(0, 2).map((part) => Array.from(part)[0]);
  return letters.join('');
}

function parseTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return String(value)
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function tagsToArray(value) {
  return parseTags(value);
}

function firstChar(value) {
  return Array.from(String(value || 'अ'))[0] || 'अ';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function safeJsonParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/* ── Pagination ────────────────────────────────────────────── */
function paginationMeta(total, page, perPage) {
  const safePerPage = Math.max(1, Number(perPage) || 10);
  const safeTotal = Math.max(0, Number(total) || 0);
  const pages = Math.max(1, Math.ceil(safeTotal / safePerPage));
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  return {
    total: safeTotal,
    page: safePage,
    perPage: safePerPage,
    pages,
    offset: (safePage - 1) * safePerPage,
    hasPrev: safePage > 1,
    hasNext: safePage < pages,
  };
}

function paginationLinks(page, pages, basePath, query = {}) {
  const makeUrl = (target) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query || {})) {
      if (key === 'page') continue;
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
    if (target > 1) params.set('page', String(target));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const items = [];
  if (page > 1) items.push({ label: '← मागील', href: makeUrl(page - 1), current: false });

  const start = Math.max(1, page - 2);
  const end = Math.min(pages, page + 2);

  if (start > 1) {
    items.push({ label: toMarathiDigits(1), href: makeUrl(1), current: page === 1 });
    if (start > 2) items.push({ ellipsis: true });
  }
  for (let p = start; p <= end; p += 1) {
    items.push({ label: toMarathiDigits(p), href: makeUrl(p), current: p === page });
  }
  if (end < pages) {
    if (end < pages - 1) items.push({ ellipsis: true });
    items.push({ label: toMarathiDigits(pages), href: makeUrl(pages), current: page === pages });
  }
  if (page < pages) items.push({ label: 'पुढील →', href: makeUrl(page + 1), current: false });

  return items;
}

/* ── Misc ──────────────────────────────────────────────────── */
function readingTimeLabel(minutes) {
  return `${toMarathiDigits(minutes || 1)} मिनिटे वाचन`;
}

function viewCountLabel(count) {
  return `${toMarathiDigits(count || 0)} वाचन`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function fileSizeLabel(bytes) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${toMarathiDigits(Math.round(bytes / 1024))} KB`;
  return `${toMarathiDigits((bytes / (1024 * 1024)).toFixed(1))} MB`;
}

function paginateQuery(query, overrides = {}) {
  return { ...query, ...overrides };
}

module.exports = {
  MR_DIGITS,
  MR_MONTHS,
  MR_WEEKDAYS,
  POST_TYPE_LABELS,
  LANGUAGE_LABELS,
  STATUS_LABELS,
  ROLE_LABELS,
  USER_STATUS_LABELS,
  transliterate,
  slugify,
  toMarathiDigits,
  toEnglishDigits,
  formatDateMr,
  formatDateTimeMr,
  isoDate,
  timeAgoMr,
  postTypeLabel,
  languageLabel,
  statusLabel,
  roleLabel,
  userStatusLabel,
  typeBadgeClass,
  statusBadgeClass,
  truncate,
  initials,
  parseTags,
  tagsToArray,
  firstChar,
  escapeHtml,
  jsonForScript,
  safeJsonParse,
  splitParagraphs,
  paginationMeta,
  paginationLinks,
  readingTimeLabel,
  viewCountLabel,
  clamp,
  fileSizeLabel,
  paginateQuery,
};
