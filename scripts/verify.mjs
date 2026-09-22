import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { verifyFixedFilters } from './verify-fixed-filters.mjs';
import { verifyArticleExtras, verifyPageViewStates } from './verify-article-extras.mjs';
import { verifyPostCovers } from './verify-post-covers.mjs';
const origin='http://127.0.0.1:4321';
const base=process.env.BASE_PATH ?? '/Blog';
const url=path=>`${origin}${base.replace(/\/$/,'')}/${path}`;
execFileSync(process.execPath, ['--test', '.agents/skills/publish-blog/scripts/verify-published.test.mjs', 'scripts/page-views.test.mjs'], {stdio:'inherit'});
await mkdir('test-results',{recursive:true});
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4321'],{stdio:'inherit'});
let browser;
const results=[];
try {
  let ready=false;
  for(let i=0;i<90;i++){try{if((await fetch(url(''))).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
  assert(ready,'Preview server did not start.');
  browser=await chromium.launch({headless:true});
  await verifyPageViewStates(browser);
  results.push('Nine counter states pass with mocked responses; no live analytics requests.');
  const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url(''),{waitUntil:'networkidle'});
  assert(await page.locator('h1').isVisible());
  await page.screenshot({path:'test-results/home-desktop.png',fullPage:true,animations:'disabled'});
  results.push('Desktop homepage and article cards render.');
  await page.getByRole('button',{name:'切换亮色主题'}).click();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  await page.screenshot({path:'test-results/home-light.png',fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'切换深色主题'}).click();
  results.push('Theme switch and persisted preference work.');
  await verifyFixedFilters(page, url);
  results.push('Both pages use the fixed configuration; empty categories remain visible and metadata-only tags remain queryable.');
  const articleResponse=await page.goto(url('blog/backend-interview-basics/'),{waitUntil:'networkidle'});
  assert(articleResponse.ok(),'Published interview article is missing.');
  assert(await page.getByRole('heading',{name:'基础八股速通：后端开发核心面试题整理'}).isVisible());
  assert(await page.locator('details').count()>100,'Interview article folding content is incomplete.');
  assert(await page.locator('.notion-red').count()>100,'Notion emphasis markers are missing.');
  await page.getByRole('button',{name:'全部展开'}).click();
  assert(await page.locator('details[open]').count()>100,'Expand-all control did not open the interview notes.');
  await verifyArticleExtras(page);
  results.push('149 source highlights keep their colors with zero inline margins, including mobile; reading status is visible.');
  await page.getByRole('button',{name:'全部折叠'}).click();
  await page.screenshot({path:'test-results/article.png',fullPage:true,animations:'disabled'});
  results.push('Published MDX interview article, emphasis and folding controls render.');

  await page.getByRole('button',{name:'搜索文章',exact:true}).click();
  await page.locator('#search-input').fill('MVCC');
  await page.waitForSelector('.search-result',{timeout:20000});
  const searchHref=await page.locator('.search-result').first().getAttribute('href');
  assert(searchHref.includes(`${base}/blog/`),'Search result is missing the project base path.');
  await page.keyboard.press('Escape');
  results.push('Chinese full-text search returns correctly based links.');
  for(const [file,signature] of [['bluehour-sample.pdf','%PDF-']]){
    const response=await page.request.get(url(`downloads/${file}`));
    assert(response.ok(),`Missing download: ${file}`);
    assert((await response.body()).toString().startsWith(signature),`Invalid file: ${file}`);
  }
  results.push('PDF attachment signature is valid.');
  for(const route of ['blog/','series/','resources/','about/','404.html','rss.xml','sitemap-index.xml']){
    const response=await page.request.get(url(route));
    assert(response.ok()||(route==='404.html'&&response.status()===404),`Route failed: ${route} (${response.status()})`);
  }
  results.push('Main routes, RSS and sitemap respond.');
  await page.setViewportSize({width:390,height:844});
  for(const route of ['','blog/backend-interview-basics/','series/','resources/']){
    await page.goto(url(route),{waitUntil:'networkidle'});
    const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1);
    if(!fits) {
      const overflow=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,elements:Array.from(document.querySelectorAll('body *')).filter(el=>el.getBoundingClientRect().right>innerWidth+1).map(el=>({tag:el.tagName,class:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})).slice(0,30)}));
      console.error('Overflow details:',JSON.stringify(overflow));
      await page.screenshot({path:'test-results/mobile-overflow.png',fullPage:true,animations:'disabled'});
    }
    assert(fits,`Horizontal overflow on mobile: ${route}`);
  }
  await page.goto(url(''),{waitUntil:'networkidle'});
  await page.screenshot({path:'test-results/home-mobile.png',fullPage:true,animations:'disabled'});
  results.push('390px mobile homepage, published article and resources have no horizontal overflow.');
  assert.deepEqual(errors,[],'Browser JavaScript errors occurred.');
  results.push('No uncaught browser JavaScript errors.');
  // Share this suite's preview server; isolate cover routes and state in a fresh context.
  const coverContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    await coverContext.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const coverPage = await coverContext.newPage();
    const coverErrors = [];
    coverPage.on('pageerror', error => coverErrors.push(error.message));
    await coverPage.goto(url(''), { waitUntil: 'networkidle' });
    const result = await verifyPostCovers(coverPage, url);
    assert.deepEqual(coverErrors, [], 'Uncaught errors during cover verification.');
    results.push(result);
    await writeFile('test-results/cover-verification.json', JSON.stringify({ passed: true, result }, null, 2));
  } catch (error) {
    await writeFile('test-results/cover-verification.json', JSON.stringify({ passed: false, error: String(error) }, null, 2));
    throw error;
  } finally {
    await coverContext.close();
  }
  await writeFile('test-results/verification.json',JSON.stringify({passed:true,checks:results},null,2));
  console.log(results.join('\n'));
} catch(error){
  await writeFile('test-results/verification.json',JSON.stringify({passed:false,checks:results,error:String(error)},null,2));
  throw error;
} finally {await browser?.close();server.kill('SIGTERM');}
