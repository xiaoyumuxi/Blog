import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function verifyFixedFilters(page, url) {
  const configured = JSON.parse(await readFile(new URL('../src/data/article-filters.json', import.meta.url), 'utf8'));
  assert(configured.length && configured[0].tag === '', 'First fixed filter must be the all-articles entry.');
  assert.equal(new Set(configured.map(item => item.tag)).size, configured.length, 'Duplicate filter values.');
  assert(configured.every(item => typeof item.label === 'string' && item.label.trim() && typeof item.tag === 'string'));
  const labels = configured.map(item => item.label);
  for (const route of ['', 'blog/']) {
    const response = await page.goto(url(route), { waitUntil: 'networkidle' });
    assert(response?.ok(), `Missing page: ${route}`);
    const bar = page.locator('[data-fixed-filters]');
    assert.equal(await bar.count(), 1, 'Pages must use the shared fixed filter component.');
    const buttons = bar.locator('button[data-filter]');
    assert.deepEqual(await buttons.allTextContents(), labels, 'Fixed labels/order changed with article metadata.');
    const cardTags = await page.locator('[data-post-card]').evaluateAll(cards => cards.map(card => JSON.parse(card.dataset.tags || '[]')));
    for (let i = 0; i < configured.length; i++) {
      const { tag } = configured[i];
      const expected = cardTags.filter(tags => !tag || tags.includes(tag)).length;
      await buttons.nth(i).click();
      assert.equal(await page.locator('[data-post-card]:visible').count(), expected, `Incorrect filtering: ${tag}`);
      assert.equal(await buttons.nth(i).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-empty]').isVisible(), expected === 0, 'Empty category must keep its button and show empty state.');
      assert.deepEqual(await buttons.allTextContents(), labels, 'Filtering mutated the fixed menu.');
    }
  }
  // Non-navigation metadata tags remain queryable without becoming new buttons.
  await page.goto(url('blog/'), { waitUntil: 'networkidle' });
  const allTags = await page.locator('[data-post-card]').evaluateAll(cards => cards.map(card => JSON.parse(card.dataset.tags || '[]')));
  const extra = allTags.flat().find(tag => !configured.some(item => item.tag === tag));
  if (extra) {
    await page.goto(url(`blog/?tag=${encodeURIComponent(extra)}`), { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-post-card]:visible').count(), allTags.filter(tags => tags.includes(extra)).length);
    assert.deepEqual(await page.locator('[data-fixed-filters] button').allTextContents(), labels);
  }
  await page.goto(url('blog/'), { waitUntil: 'networkidle' });
}
