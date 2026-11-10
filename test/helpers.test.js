'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  toMarathiDigits,
  toEnglishDigits,
  formatDateMr,
  slugify,
  truncate,
  escapeHtml,
  safeJsonParse,
  paginationMeta,
  paginationLinks,
} = require('../src/lib/helpers');

test('toMarathiDigits converts Latin digits', () => {
  assert.equal(toMarathiDigits('2026-11-09'), '२०२६-११-०९');
  assert.equal(toMarathiDigits(42), '४२');
});

test('toEnglishDigits converts Devanagari digits', () => {
  assert.equal(toEnglishDigits('२०२६'), '2026');
  assert.equal(toEnglishDigits('४२'), '42');
});

test('formatDateMr renders a Marathi date', () => {
  const date = new Date(2026, 10, 9); // 9 November 2026
  assert.equal(formatDateMr(date), '९ नोव्हेंबर २०२६');
  assert.equal(formatDateMr(date, { short: true }), '९ नोव्हेंबर');
  assert.equal(formatDateMr('not-a-date'), '');
});

test('slugify creates URL-safe slugs and transliterates Devanagari', () => {
  assert.equal(slugify('Hello World!'), 'hello-world');
  assert.equal(slugify('मराठी कविता'), 'maraathee-kavitaa');
  assert.match(slugify('   '), /^lekh-[a-z0-9]+$/);
  assert.match(slugify('', 'fallback'), /^fallback-[a-z0-9]+$/);
});

test('truncate respects length and word boundaries', () => {
  assert.equal(truncate('short', 20), 'short');
  const out = truncate('एक दोन तीन चार पाच', 10);
  assert.ok(out.length <= 10);
  assert.ok(out.endsWith('…'));
});

test('escapeHtml escapes special characters', () => {
  assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
});

test('safeJsonParse falls back on invalid JSON', () => {
  assert.deepEqual(safeJsonParse('["a","b"]', []), ['a', 'b']);
  assert.deepEqual(safeJsonParse('{bad', ['fallback']), ['fallback']);
  assert.deepEqual(safeJsonParse('', ['empty']), ['empty']);
});

test('paginationMeta clamps page and computes offsets', () => {
  const meta = paginationMeta(95, 3, 10);
  assert.equal(meta.pages, 10);
  assert.equal(meta.page, 3);
  assert.equal(meta.offset, 20);
  assert.equal(meta.hasPrev, true);
  assert.equal(meta.hasNext, true);

  const clamped = paginationMeta(5, 99, 10);
  assert.equal(clamped.pages, 1);
  assert.equal(clamped.page, 1);
});

test('paginationLinks builds previous/next and page links', () => {
  const links = paginationLinks(2, 4, '/writings', { type: 'poem' });
  assert.ok(links.length > 0);
  const prev = links.find((item) => item.label.includes('मागील'));
  assert.ok(prev);
  assert.equal(prev.href, '/writings?type=poem');
  const current = links.find((item) => item.current);
  assert.equal(current.label, '२');
});
