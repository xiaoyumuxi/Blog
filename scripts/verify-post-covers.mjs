import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

export async function verifyPostCovers(page, url) {
  const files = await htmlFiles('dist/blog');
  const html = await Promise.all(files.map(file => readFile(file, 'utf8')));
  // Read real built pages, not mock metadata: every published article must be bound.
  const articles = await page.evaluate(documents => documents.map(source => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    const article = doc.querySelector('[data-article]');
    if (!article) return null;
    const image = doc.querySelector('.article-cover img[data-cover-image]');
    return {
      id: image?.closest('[data-post-cover]')?.getAttribute('data-post-cover'),
      title: doc.querySelector('h1')?.textContent,
      src: image?.getAttribute('src'),
      alt: image?.getAttribute('alt'),
      loading: image?.getAttribute('loading')
    };
  }).filter(Boolean), html);
  assert(articles.length > 0, 'No published articles were checked for covers.');
  const origin = new URL(url('')).origin;
  const generated = [];
  for (const article of articles) {
    assert(article.id && article.src && article.alt, `Unbound cover: ${article.title}`);
    assert.equal(article.loading, 'eager', 'Article hero should not be lazy loaded.');
    const src = new URL(article.src, url(''));
    if (src.origin !== origin) continue; // Do not make extra requests to third-party image hosts.
    const response = await page.request.get(src.href);
    assert(response.ok(), `Cover file missing: ${article.src}`);
    assert(/^image\//i.test(response.headers()['content-type'] || ''), `Not an image: ${article.src}`);
    if (src.pathname.includes('/covers/') && src.pathname.endsWith('.svg')) {
      const svg = await response.text();
      const parsed = await page.evaluate(source => {
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
        return {
          invalid: !!doc.querySelector('parsererror'),
          title: doc.querySelector('title')?.textContent,
          viewBox: doc.documentElement.getAttribute('viewBox'),
          active: !!doc.querySelector('script, foreignObject, image')
        };
      }, svg);
      assert(!parsed.invalid && !parsed.active, `Unsafe or invalid SVG: ${article.src}`);
      assert.equal(parsed.title, article.title.replace(/\s+/g, ' ').trim());
      assert.equal(parsed.viewBox, '0 0 1200 675');
      generated.push(article.src);
    }
  }
  assert.equal(new Set(generated).size, generated.length, 'Articles accidentally share a generated cover.');

  await page.goto(url('blog/'), { waitUntil: 'networkidle' });
  const cards = await page.locator('[data-post-card]').count();
  assert(cards > 0);
  assert.equal(await page.locator('[data-post-card] img[data-cover-image]').count(), cards);
  const cardCovers = await page.locator('[data-post-card] [data-post-cover]').evaluateAll(nodes => nodes.map(node => ({
    id: node.getAttribute('data-post-cover'),
    src: node.querySelector('img')?.getAttribute('src')
  })));
  for (const cover of cardCovers) {
    assert.equal(cover.src, articles.find(article => article.id === cover.id)?.src, `Card/hero cover mismatch: ${cover.id}`);
  }
  const image = page.locator('[data-post-card] img[data-cover-image]').first();
  await image.scrollIntoViewIfNeeded();
  assert(await image.evaluate(async el => { try { await el.decode(); return el.naturalWidth > 0; } catch { return false; } }), 'Cover does not decode in Chromium.');
  await page.screenshot({ path: 'test-results/covers-desktop.png', animations: 'disabled' });

  // Exercise the actual component's error handler without contacting any external host.
  const original = await image.getAttribute('src');
  await page.route('**/__missing-cover__.png', route => route.fulfill({ status: 404, body: '' }));
  await image.evaluate(el => {
    el.dataset.coverFallback = el.getAttribute('src');
    el.src = '__missing-cover__.png';
  });
  await page.waitForFunction(src => {
    const el = document.querySelector('[data-post-card] img[data-cover-image]');
    return el?.getAttribute('src') === src && el.complete && el.naturalWidth > 0 && el.dataset.coverFallbackUsed === 'true';
  }, original);
  assert.equal(await image.getAttribute('data-cover-fallback'), null, 'Fallback can loop.');

  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url(`blog/${articles[0].id}/`), { waitUntil: 'networkidle' });
  const hero = page.locator('.article-cover img[data-cover-image]');
  assert(await hero.evaluate(async el => { try { await el.decode(); return el.naturalWidth > 0; } catch { return false; } }));
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Cover overflows mobile.');
  await hero.scrollIntoViewIfNeeded();
  const box = await hero.boundingBox();
  assert(box && Math.abs(box.width / box.height - 16 / 9) < 0.02, 'Cover title may be cropped.');
  await page.screenshot({ path: 'test-results/covers-mobile.png', animations: 'disabled' });
  if (viewport) await page.setViewportSize(viewport);
  return `${articles.length} article covers verified; ${generated.length} unique SVGs; card/hero binding, decoding, fallback and mobile aspect ratio pass.`;
}

// Run after the existing site suite, on a separate local preview port.
const origin = 'http://127.0.0.1:4322';
const base = process.env.BASE_PATH ?? '/Blog';
const url = path => `${origin}${base.replace(/\/$/, '')}/${path}`;
await mkdir('test-results', { recursive: true });
// Astro 7 keeps a project-level preview process after the previous npm wrapper exits.
// Replace that local test preview explicitly; changing ports alone does not release its lock.
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4322', '--force'], { stdio: 'inherit' });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    try { if ((await fetch(url(''))).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert(ready, 'Cover preview server did not start.');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  // Never send analytics, comments or other third-party requests during this suite.
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url(''), { waitUntil: 'networkidle' });
  const result = await verifyPostCovers(page, url);
  assert.deepEqual(errors, [], 'Uncaught errors during cover verification.');
  await writeFile('test-results/cover-verification.json', JSON.stringify({ passed: true, result }, null, 2));
  console.log(result);
} catch (error) {
  await writeFile('test-results/cover-verification.json', JSON.stringify({ passed: false, error: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
