import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

export async function verifyArticleExtras(page) {
  const viewport = page.viewportSize();
  const initialTheme = await page.locator('html').getAttribute('data-theme');
  const acid = page.locator('details').filter({has:page.locator('summary', {hasText:'ACID 是什么？'})}).last();
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    const highlights = await page.locator('[data-article] details .notion-red').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return {left:style.marginLeft, right:style.marginRight, color:style.color, display:style.display};
    }));
    assert(highlights.length >= 149, 'Source emphasis was lost.');
    for (const item of highlights) {
      assert.equal(item.left, '0px', 'Inline highlights must not receive answer-block indentation.');
      assert.equal(item.right, '0px');
      assert.equal(item.display, 'inline');
      assert.equal(item.color, theme === 'light' ? 'rgb(200, 61, 94)' : 'rgb(255, 125, 152)');
    }
    await acid.screenshot({path:`test-results/acid-${theme}.png`, animations:'disabled'});
  }
  await page.setViewportSize({width:390, height:844});
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await acid.screenshot({path:'test-results/acid-mobile.png', animations:'disabled'});
  await page.setViewportSize(viewport);
  await page.evaluate(value => { document.documentElement.dataset.theme = value; }, initialTheme);
  const widget = page.locator('[data-page-views]');
  assert(await widget.isVisible(), 'Article metadata must contain the reading-count status.');
  const configured = Boolean(await widget.getAttribute('data-counter-origin'));
  assert.equal(await widget.getAttribute('data-state'), configured ? 'preview' : 'disabled');
}

// Isolated mock origins: no requests reach GoatCounter, no production visits are generated.
export async function verifyPageViewStates(browser) {
  const source = (await readFile(new URL('../src/scripts/page-views.mjs', import.meta.url), 'utf8'))
    .replace(/^export /gm, '');
  const cases = [
    {name:'disabled', configured:false, expected:'disabled', text:'阅读统计待启用'},
    {name:'formatted', expected:'ready', body:{count:'1,234'}, text:'1,234 次阅读'},
    {name:'zero', expected:'ready', body:{count:'0'}, text:'0 次阅读'},
    {name:'new-path', status:404, expected:'empty', text:'暂无阅读数据'},
    {name:'private-count', status:403, expected:'error', text:'阅读量暂不可用'},
    {name:'invalid', body:{unexpected:123}, expected:'error', text:'阅读量暂不可用'},
    {name:'offline', abort:true, expected:'error', text:'阅读量暂不可用'},
    {name:'preview', configured:true, siteOrigin:'https://production.invalid', expected:'preview', text:'预览不计数'},
    {name:'privacy', privacy:true, expected:'privacy', text:'阅读统计已停用'},
  ];
  for (const item of cases) {
    const context = await browser.newContext();
    try {
      const requests = [];
      const configured = item.configured !== false;
      const html = `<html><head><title>Counter test</title></head><body><span data-page-views data-track="true" data-counter-origin="${configured ? 'https://bluehour-test.goatcounter.com' : ''}" data-site-origin="${item.siteOrigin || 'https://blog-test.invalid'}" data-path="/Blog/blog/example/"><span data-views-value></span></span></body></html>`;
      await context.addInitScript(privacy => {
        Object.defineProperty(navigator, 'doNotTrack', {get:() => privacy ? '1' : null});
        Object.defineProperty(navigator, 'globalPrivacyControl', {get:() => false});
      }, Boolean(item.privacy));
      await context.route('**/*', async route => {
        const address = route.request().url();
        if (address.startsWith('https://blog-test.invalid/')) {
          await route.fulfill({contentType:'text/html', body:html});
        } else if (address === 'https://gc.zgo.at/count.js') {
          requests.push(address);
          await route.fulfill({contentType:'application/javascript', body:'window.__mockTrackerLoaded = true;'});
        } else if (address.startsWith('https://bluehour-test.goatcounter.com/counter/')) {
          requests.push(address);
          if (item.abort) await route.abort();
          else await route.fulfill({status:item.status || 200, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(item.body || {})});
        } else {
          throw new Error(`Unexpected outbound request in counter test: ${address}`);
        }
      });
      const page = await context.newPage();
      await page.goto('https://blog-test.invalid/Blog/blog/example/?preview=1');
      await page.addScriptTag({content:source+'\ninitPageViews(); initPageViews();'});
      await page.waitForFunction(state => document.querySelector('[data-page-views]').dataset.state === state, item.expected);
      assert.equal(await page.locator('[data-views-value]').textContent(), item.text);
      if (['disabled','preview','privacy'].includes(item.expected)) {
        assert.equal(requests.length, 0);
      } else {
        await page.waitForFunction(() => window.__mockTrackerLoaded === true);
        assert.equal(requests.filter(address => address.endsWith('/count.js')).length, 1);
        const counters = requests.filter(address => address.includes('/counter/'));
        assert.deepEqual(counters, ['https://bluehour-test.goatcounter.com/counter/%2FBlog%2Fblog%2Fexample%2F.json']);
        const settings = JSON.parse(await page.locator('script[data-bluehour-goatcounter]').getAttribute('data-goatcounter-settings'));
        assert.equal(settings.path, '/Blog/blog/example/');
        assert.equal(settings.no_events, true);
      }
    } finally { await context.close(); }
  }
}
