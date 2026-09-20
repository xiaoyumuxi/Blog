import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const decode = text => text.replace(/&(?:amp|lt|gt|quot|apos|#39|#x[\da-f]+|#\d+);/gi, value => {
  const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'" };
  if (named[value.toLowerCase()]) return named[value.toLowerCase()];
  const hex = /^&#x/i.test(value);
  const number = Number.parseInt(value.slice(hex ? 3 : 2, -1), hex ? 16 : 10);
  return Number.isFinite(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : value;
});
const textOnly = html => decode(html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const links = html => Array.from(html.matchAll(/\bhref=["']([^"']+)["']/gi), match => decode(match[1]));

/** Read-only verification. It never posts comments, creates resources or changes GitHub. */
export async function verifyPublished({ site, slug, expect = [], removed = [], minHighlights = 0 }, fetchImpl = fetch) {
  const base = new URL(site);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  assert(base.protocol === 'https:' || (base.protocol === 'http:' && loopback), 'Use HTTPS, or HTTP on localhost for testing.');
  assert(!base.username && !base.password && !base.search && !base.hash, 'Site must not contain credentials, query or fragment.');
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  assert(slugPattern.test(slug || ''), 'A safe, stable --slug is required.');
  assert(expect.length > 0 && expect.every(value => typeof value === 'string' && value.trim()), 'Supply at least one --expect identifying this version.');
  assert(Number.isInteger(minHighlights) && minHighlights >= 0, 'min-highlights must be a nonnegative integer.');
  for (const id of removed) assert(slugPattern.test(id) && id !== slug, 'Invalid --removed slug.');

  const checks = [];
  async function get(path) {
    const target = new URL(path, base);
    target.searchParams.set('verify', String(Date.now()));
    const response = await fetchImpl(target, { cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(15000) });
    return { response, html: await response.text(), url: target.href };
  }
  const targetPath = new URL(`blog/${slug}/`, base).pathname;
  function hasLink(html, path) {
    return links(html).some(link => {
      try { const value = new URL(link, base); return value.origin === base.origin && value.pathname === path; }
      catch { return false; }
    });
  }
  const article = await get(`blog/${slug}/`);
  assert.equal(article.response.status, 200, `Article HTTP ${article.response.status}`);
  assert(/<h1\b/i.test(article.html) && /\bdata-article(?:\s|=|>)/i.test(article.html), 'Response is not the actual article page.');
  const text = textOnly(article.html);
  for (const expected of expect) assert(text.includes(expected.replace(/\s+/g, ' ')), `Missing expected text: ${expected}`);
  const highlights = Array.from(article.html.matchAll(/\bclass=["']([^"']+)["']/gi)).filter(match => match[1].split(/\s+/).includes('notion-red')).length;
  assert(highlights >= minHighlights, `Expected at least ${minHighlights} highlights; received ${highlights}.`);
  checks.push('Article HTTP 200, article markup and expected version text verified.');

  const index = await get('blog/');
  assert.equal(index.response.status, 200, `Article list HTTP ${index.response.status}`);
  assert(hasLink(index.html, targetPath), 'Article missing from the live article list.');
  checks.push('Live article list links to the target slug.');

  for (const id of removed) {
    const path = new URL(`blog/${id}/`, base).pathname;
    assert(!hasLink(index.html, path), `Deleted article still in list: ${id}`);
    const old = await get(`blog/${id}/`);
    assert([404, 410].includes(old.response.status), `Deleted article still accessible: ${id} (HTTP ${old.response.status})`);
    checks.push(`Deleted article absent and returns 404/410: ${id}`);
  }
  return { passed: true, article: new URL(`blog/${slug}/`, base).href, checkedAt: new Date().toISOString(), highlights, checks };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: {
      site: { type: 'string', default: 'https://xiaoyumuxi.github.io/Blog/' },
      slug: { type: 'string' }, expect: { type: 'string', multiple: true },
      removed: { type: 'string', multiple: true }, 'min-highlights': { type: 'string', default: '0' },
      help: { type: 'boolean', short: 'h' }
    } });
    if (values.help) {
      console.log('node verify-published.mjs --site https://host/Blog/ --slug article-id --expect "new content" [--min-highlights 2] [--removed old-id]');
    } else {
      const report = await verifyPublished({ site: values.site, slug: values.slug, expect: values.expect, removed: values.removed, minHighlights: Number(values['min-highlights']) });
      console.log(JSON.stringify(report, null, 2));
    }
  } catch (error) {
    console.error(JSON.stringify({ passed: false, error: error instanceof Error ? error.message : String(error) }, null, 2));
    process.exitCode = 1;
  }
}
