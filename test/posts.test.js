'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validatePostInput,
  derivePostFields,
  submitStatusFor,
} = require('../src/lib/posts');

test('validatePostInput accepts a valid post', () => {
  const result = validatePostInput({
    title: 'मराठी कविता',
    body_md: 'ओळ एक\nओळ दोन',
    excerpt: 'छोटा सारांश',
    type: 'poem',
    language: 'mr',
    tags: 'कविता, मराठी',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, {});
  assert.equal(result.data.title, 'मराठी कविता');
  assert.equal(result.data.type, 'poem');
  assert.equal(result.data.language, 'mr');
  assert.equal(result.data.tags, 'कविता, मराठी');
});

test('validatePostInput requires a title and body', () => {
  const result = validatePostInput({ title: '   ', body_md: '' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.title);
  assert.ok(result.errors.body_md);
});

test('validatePostInput enforces configured limits', () => {
  const result = validatePostInput(
    { title: 'अ'.repeat(20), body_md: 'ब'.repeat(50), excerpt: 'क'.repeat(20) },
    { title: 10, body: 30, excerpt: 10 }
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.title);
  assert.ok(result.errors.body_md);
  assert.ok(result.errors.excerpt);
});

test('validatePostInput falls back to safe type and language', () => {
  const result = validatePostInput({
    title: 'शीर्षक',
    body_md: 'मजकूर',
    type: 'not-a-type',
    language: 'xx',
  });
  assert.equal(result.data.type, 'article');
  assert.equal(result.data.language, 'mr');
});

test('validatePostInput normalises optional fields', () => {
  const result = validatePostInput({
    title: 'शीर्षक',
    body_md: 'मजकूर',
    category_id: '0',
    cover_url: '',
    is_featured: '1',
    is_pinned: '',
  });
  assert.equal(result.data.category_id, null);
  assert.equal(result.data.cover_url, null);
  assert.equal(result.data.is_featured, 1);
  assert.equal(result.data.is_pinned, 0);
});

test('derivePostFields produces html, excerpt and reading time', () => {
  const fields = derivePostFields({ body_md: '# शीर्षक\n\nमजकूर', excerpt: '' });
  assert.match(fields.bodyHtml, /<h1/);
  assert.equal(fields.excerpt, 'शीर्षक मजकूर');
  assert.equal(fields.readingTime, 1);
});

test('submitStatusFor requires review for contributors', () => {
  assert.equal(submitStatusFor(null), 'pending_review');
  assert.equal(submitStatusFor({ role: 'contributor', auto_publish: 0 }), 'pending_review');
  assert.equal(submitStatusFor({ role: 'contributor', auto_publish: 1 }), 'published');
  assert.equal(submitStatusFor({ role: 'admin', auto_publish: 0 }), 'published');
  assert.equal(submitStatusFor({ role: 'owner', auto_publish: 0 }), 'published');
});
