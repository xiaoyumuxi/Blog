import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublished } from './verify-published.mjs';
const options = { site: 'https://example.com/Blog/', slug: 'notes', expect: ['Current version'], minHighlights: 1 };
const page = '<h1>Notes</h1><article data-article><strong class="notion-red">Current version</strong></article>';
const index = '<a href="/Blog/blog/notes/">Notes</a>';
function serve(overrides = {}) {
  const routes = { '/Blog/blog/notes/': [200, page], '/Blog/blog/': [200, index], ...overrides };
  return async input => { const [status, body] = routes[new URL(input).pathname] || [404, 'Not found']; return new Response(body, { status }); };
}
test('current article and list succeed', async () => {
  const report = await verifyPublished(options, serve());
  assert.equal(report.passed, true); assert.equal(report.highlights, 1);
});
test('a stale page with HTTP 200 is rejected', async () => {
  await assert.rejects(verifyPublished(options, serve({ '/Blog/blog/notes/': [200, page.replace('Current', 'Old')] })), /Missing expected text/);
});
test('404 and redirect are not publication success', async () => {
  for (const status of [404, 302]) await assert.rejects(verifyPublished(options, serve({ '/Blog/blog/notes/': [status, ''] })), /Article HTTP/);
});
test('missing list entry is rejected', async () => {
  await assert.rejects(verifyPublished(options, serve({ '/Blog/blog/': [200, 'empty'] })), /missing from the live article list/);
});
test('missing semantic emphasis is rejected', async () => {
  await assert.rejects(verifyPublished(options, serve({ '/Blog/blog/notes/': [200, page.replace('notion-red', 'plain')] })), /highlights/);
});
test('deleted routes must disappear from both list and server', async () => {
  assert.equal((await verifyPublished({ ...options, removed: ['old'] }, serve())).passed, true);
  await assert.rejects(verifyPublished({ ...options, removed: ['old'] }, serve({ '/Blog/blog/old/': [200, page] })), /still accessible/);
  await assert.rejects(verifyPublished({ ...options, removed: ['old'] }, serve({ '/Blog/blog/': [200, index + '<a href="/Blog/blog/old/">Old</a>'] })), /still in list/);
});
test('credentials, unsafe paths and absent expectations are rejected before requests', async () => {
  const neverFetch = async () => { throw new Error('unexpected network request'); };
  for (const patch of [{ site: 'https://user:secret@example.com/' }, { slug: '../notes' }, { expect: [] }, { minHighlights: -1 }]) {
    await assert.rejects(verifyPublished({ ...options, ...patch }, neverFetch), error => !String(error).includes('unexpected network request'));
  }
});
test('special characters and multiple expectations are checked in visible text', async () => {
  await verifyPublished({ ...options, expect: ['Current version', '${x}', '<tag>'] }, serve({
    '/Blog/blog/notes/': [200, page + '<code>&#36;&#123;x&#125;</code><code>&lt;tag&gt;</code>']
  }));
  await assert.rejects(verifyPublished({ ...options, expect: ['Secret marker'] }, serve({
    '/Blog/blog/notes/': [200, page + '<script>"Secret marker"</script>']
  })), /Missing expected text/);
});
