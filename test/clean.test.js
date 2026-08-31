'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { clean } = require('../src/clean');

const out = (url) => {
  const r = clean(url);
  assert.ok(r.ok, `expected ${url} to clean, got: ${r.error}`);
  return r;
};

test('YouTube /watch keeps only v', () => {
  const r = out(
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ&index=1&t=42s&si=abc&feature=share&pp=xyz'
  );
  assert.strictEqual(r.cleaned, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.deepStrictEqual(r.kept.map((k) => k.key), ['v']);
  assert.strictEqual(r.removed.length, 6);
});

test('YouTube v survives regardless of position', () => {
  const r = out('https://www.youtube.com/watch?list=PL1&v=abc123&index=4');
  assert.strictEqual(r.cleaned, 'https://www.youtube.com/watch?v=abc123');
});

test('youtu.be drops the whole query string', () => {
  const r = out('https://youtu.be/dQw4w9WgXcQ?si=xY12ab&t=30');
  assert.strictEqual(r.cleaned, 'https://youtu.be/dQw4w9WgXcQ');
  assert.deepStrictEqual(r.kept, []);
});

test('m.youtube.com gets the same rule as the desktop host', () => {
  const r = out('https://m.youtube.com/watch?v=abc&si=zz&list=PL9');
  assert.strictEqual(r.cleaned, 'https://m.youtube.com/watch?v=abc');
});

test('utm_* and click IDs go, real parameters stay', () => {
  const r = out(
    'https://example.com/post?utm_source=news&utm_medium=email&id=99&fbclid=IwAR1&page=2'
  );
  assert.strictEqual(r.cleaned, 'https://example.com/post?id=99&page=2');
  assert.deepStrictEqual(r.removed.map((x) => x.key), ['utm_source', 'utm_medium', 'fbclid']);
});

test('a link with nothing to remove is returned unchanged', () => {
  const url = 'https://shop.example.com/item?color=blue&size=m';
  const r = out(url);
  assert.strictEqual(r.cleaned, url);
  assert.strictEqual(r.changed, false);
  assert.deepStrictEqual(r.removed, []);
});

test('every removal explains itself', () => {
  const r = out('https://example.com/?gclid=1&mc_eid=2&utm_campaign=3');
  for (const item of r.removed) {
    assert.strictEqual(typeof item.reason, 'string');
    assert.ok(item.reason.length > 0, `${item.key} has no reason`);
  }
});

test('a missing scheme is assumed to be https', () => {
  const r = out('youtube.com/watch?v=abc123&list=PL999');
  assert.strictEqual(r.cleaned, 'https://youtube.com/watch?v=abc123');
});

test('host exceptions protect parameters the page needs', () => {
  const r = out('https://www.google.com/search?q=privacy&ved=2ahUKE&ei=xyz');
  assert.strictEqual(r.cleaned, 'https://www.google.com/search?q=privacy');
});

test('the fragment is left alone', () => {
  const r = out('https://example.com/doc?utm_source=x#section-3');
  assert.strictEqual(r.cleaned, 'https://example.com/doc#section-3');
});

test('paths and encoded values survive intact', () => {
  const r = out('https://example.com/a%20b/c?q=hello%20world&utm_source=x');
  assert.strictEqual(r.cleaned, 'https://example.com/a%20b/c?q=hello+world');
});

test('non-http schemes are refused', () => {
  for (const bad of ['ftp://example.com/x', 'javascript:alert(1)', 'data:text/html,hi']) {
    const r = clean(bad);
    assert.strictEqual(r.ok, false, `${bad} should be refused`);
  }
});

test('empty and oversized input are refused', () => {
  assert.strictEqual(clean('').ok, false);
  assert.strictEqual(clean('   ').ok, false);
  assert.strictEqual(clean(null).ok, false);
  assert.strictEqual(clean('https://example.com/?a=' + 'x'.repeat(5000)).ok, false);
});
