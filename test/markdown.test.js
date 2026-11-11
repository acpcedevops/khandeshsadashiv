'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  renderMarkdown,
  stripMarkdown,
  readingTime,
  makeExcerpt,
} = require('../src/lib/markdown');

test('renderMarkdown renders basic Markdown', () => {
  const html = renderMarkdown('# शीर्षक\n\nहा **ठळक** मजकूर आहे.');
  assert.match(html, /<h1[^>]*>शीर्षक<\/h1>/);
  assert.match(html, /<strong>ठळक<\/strong>/);
});

test('renderMarkdown preserves poem line breaks', () => {
  const html = renderMarkdown('ओळ एक\nओळ दोन');
  assert.match(html, /ओळ एक<br\s*\/?>\s*ओळ दोन/);
});

test('renderMarkdown sanitizes scripts and unsafe URLs', () => {
  const html = renderMarkdown(
    '<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<a href="javascript:alert(1)">y</a>'
  );
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('renderMarkdown adds rel to links and loading to images', () => {
  const html = renderMarkdown('[example](https://example.com)\n\n![alt](https://example.com/a.png)');
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /loading="lazy"/);
});

test('stripMarkdown removes formatting', () => {
  assert.equal(stripMarkdown('# शीर्षक\n\n**ठळक** [दुवा](https://example.com)'), 'शीर्षक ठळक दुवा');
});

test('readingTime is at least one minute', () => {
  assert.equal(readingTime(''), 1);
  assert.equal(readingTime('शब्द '.repeat(400)), 2);
});

test('makeExcerpt truncates at a word boundary with ellipsis', () => {
  const excerpt = makeExcerpt('शब्द '.repeat(100), 30);
  assert.ok(excerpt.length <= 30);
  assert.ok(excerpt.endsWith('…'));
});

test('makeExcerpt leaves short text unchanged', () => {
  assert.equal(makeExcerpt('छोटा मजकूर', 50), 'छोटा मजकूर');
});
