import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:4321';
const base=process.env.BASE_PATH ?? '/Blog';
const url=path=>`${origin}${base.replace(/\/$/,'')}/${path}`;
await mkdir('test-results',{recursive:true});
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4321'],{stdio:'inherit'});
let browser;
const results=[];
try {
  let ready=false;
  for(let i=0;i<90;i++){try{if((await fetch(url(''))).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}
  assert(ready,'Preview server did not start.');
  browser=await chromium.launch({headless:true});
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
  await page.goto(url('blog/'),{waitUntil:'networkidle'});
  const filter=page.locator('[data-filter]:not([data-filter=""])').first();
  if(await filter.count()) {
    const tag=await filter.getAttribute('data-filter');
    await filter.click();
    assert(await page.locator('[data-post-card]:visible').count()>0);
    for(const card of await page.locator('[data-post-card]:visible').all()) assert(JSON.parse(await card.getAttribute('data-tags')).includes(tag));
    await page.locator('[data-filter=""]').click();
    results.push('Tag filtering works.');
  }
  const labResponse=await page.goto(url('blog/writing-lab/'),{waitUntil:'networkidle'});
  if(labResponse.ok()) {
    await page.waitForSelector('pre.mermaid svg',{timeout:30000});
    assert(await page.locator('.katex').count()>0);
    assert(await page.locator('.expressive-code').count()>0);
    await page.getByRole('tab',{name:'pnpm',exact:true}).click();
    assert((await page.getByRole('tabpanel').filter({visible:true}).innerText()).includes('pnpm'));
    await page.locator('[data-lightbox]').first().click();
    assert(await page.locator('#lightbox').isVisible());
    await page.keyboard.press('Escape');
    assert(!(await page.locator('#lightbox').isVisible()));
    await page.screenshot({path:'test-results/article.png',fullPage:true,animations:'disabled'});
    results.push('MDX, KaTeX, Mermaid, code blocks, tabs and image lightbox work.');
    const downloadPromise=page.waitForEvent('download');
    await page.locator('a[download][href$="writing-template.md"]').first().click();
    const download=await downloadPromise;
    assert.equal(await download.failure(),null);
    results.push('A file can actually be downloaded.');
    await page.getByRole('button',{name:'搜索文章',exact:true}).click();
    await page.locator('#search-input').fill('公式');
    await page.waitForSelector('.search-result',{timeout:20000});
    const searchHref=await page.locator('.search-result').first().getAttribute('href');
    assert(searchHref.includes(`${base}/blog/`),'Search result is missing the project base path.');
    await page.keyboard.press('Escape');
    results.push('Chinese full-text search returns correctly based links.');
  } else results.push('Writing lab was removed; sample-specific component checks skipped.');
  for(const [file,signature] of [['bluehour-sample.pdf','%PDF-'],['bluehour-starter.zip','PK'],['writing-template.md','---']]){
    const response=await page.request.get(url(`downloads/${file}`));
    assert(response.ok(),`Missing download: ${file}`);
    assert((await response.body()).toString().startsWith(signature),`Invalid file: ${file}`);
  }
  results.push('PDF, ZIP and Markdown attachment signatures are valid.');
  for(const route of ['blog/','resources/','about/','404.html','rss.xml','sitemap-index.xml']){
    const response=await page.request.get(url(route));
    assert(response.ok()||(route==='404.html'&&response.status()===404),`Route failed: ${route} (${response.status()})`);
  }
  results.push('Main routes, RSS and sitemap respond.');
  await page.setViewportSize({width:390,height:844});
  for(const route of ['','blog/writing-lab/','resources/']){
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
  results.push('390px mobile homepage, article and resources have no horizontal overflow.');
  assert.deepEqual(errors,[],'Browser JavaScript errors occurred.');
  results.push('No uncaught browser JavaScript errors.');
  await writeFile('test-results/verification.json',JSON.stringify({passed:true,checks:results},null,2));
  console.log(results.join('\n'));
} catch(error){
  await writeFile('test-results/verification.json',JSON.stringify({passed:false,checks:results,error:String(error)},null,2));
  throw error;
} finally {await browser?.close();server.kill('SIGTERM');}
