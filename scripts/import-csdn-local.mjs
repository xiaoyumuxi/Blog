#!/usr/bin/env node
import { chromium } from '@playwright/test';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const USER = 'fancyfor';
const PROFILE = 'https://blog.csdn.net/' + USER;
const USER_DATA_DIR = resolve('.cache/csdn-browser');
const CONTENT_DIR = resolve('src/content/blog');
const IMAGE_ROOT = resolve('public/images/csdn');
const FENCE = String.fromCharCode(96).repeat(3);

const KNOWN_ARTICLE_IDS = [
  '163421557','163421176','163421160','163421128','163420934',
  '163398923','163398520','163398250','163398088','161797165',
  '161779694','161648730','161648373','161232752','161232647',
  '161232552','161232443','161196737','161196445','161172871',
  '161172556','160157511','160157491','160157465','158462929',
  '158462452','158462270','158040989','158006798','158006742',
  '158006632','156618273','156240993','156199320','156198988',
  '156198476','155134179','154289549','152822984','152818735',
  '150586940'
];

const SERIES_SLUGS = new Map([
  ['后端八股','backend-fundamentals'],
  ['AI','ai'],
  ['个人项目相关','projects'],
  ['语言快速入门','language-crash-course'],
  ['算法和数据结构','algorithms-data-structures'],
  ['一些稀奇古怪的问题的解决方案记录','troubleshooting'],
  ['面试记录和复盘','interview-reviews'],
  ['Mit6.S081 2022版本','mit6-s081-2022'],
  ['MIT6.S081 2022版本','mit6-s081-2022']
]);

const SERIES_TAGS = new Map([
  ['后端八股','后端'],
  ['AI','AI'],
  ['个人项目相关','项目'],
  ['语言快速入门','语言'],
  ['算法和数据结构','算法'],
  ['一些稀奇古怪的问题的解决方案记录','问题排查'],
  ['面试记录和复盘','面试'],
  ['Mit6.S081 2022版本','系统'],
  ['MIT6.S081 2022版本','系统']
]);

function hasArg(name) {
  return process.argv.includes(name);
}

function argValue(name, fallback) {
  const prefix = name + '=';
  const item = process.argv.find(arg => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

function numberArg(name, fallback = 0) {
  const value = Number(argValue(name, String(fallback)));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function sleep(ms) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms));
}

function json(value) {
  return JSON.stringify(value);
}

function yamlJson(value) {
  return JSON.stringify(value);
}

function articleId(url) {
  const match = url.match(/\/article\/details\/(\d+)/);
  return match ? match[1] : null;
}

function safeDate(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function slugForSeries(name, href) {
  if (SERIES_SLUGS.has(name)) return SERIES_SLUGS.get(name);
  const id = String(href || '').match(/category_(\d+)/);
  return id ? 'csdn-column-' + id[1] : 'csdn-series';
}

function broadTag(seriesName) {
  return SERIES_TAGS.get(seriesName) || null;
}

async function promptForVerification(page) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\nCSDN 没有返回文章正文。');
    console.log('请在刚打开的浏览器里完成登录/验证码，保持当前文章页，然后回到终端按 Enter。');
    await rl.question('');
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
  } finally {
    rl.close();
  }
}

async function discoverArticleUrls(page) {
  const fallback = KNOWN_ARTICLE_IDS.map(id => PROFILE + '/article/details/' + id);
  if (hasArg('--known-only')) {
    console.log('使用已核对的 CSDN 文章清单：' + fallback.length + ' 篇');
    return fallback;
  }
  console.log('打开 CSDN 主页：' + PROFILE);
  await page.goto(PROFILE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1800);

  const urls = new Set();
  let stable = 0;
  let previousSize = 0;

  for (let i = 0; i < 30; i += 1) {
    const found = await page.locator('a[href*="/' + USER + '/article/details/"]').evaluateAll(
      (links, user) => links
        .map(link => link.href)
        .filter(href => href.includes('/' + user + '/article/details/'))
        .map(href => href.split('?')[0].split('#')[0]),
      USER
    );

    found.forEach(url => urls.add(url));

    const more = page.getByText(/加载更多|查看更多/).last();
    if (await more.count()) {
      try {
        if (await more.isVisible()) await more.click({ timeout: 1500 });
      } catch {}
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(700);

    if (urls.size === previousSize) stable += 1;
    else stable = 0;
    previousSize = urls.size;
    if (stable >= 4) break;
  }

  const merged = unique([...urls, ...fallback]);
  console.log('识别到文章：' + merged.length + ' 篇');
  return merged;
}

async function extractArticle(page, url, headed) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1000 + attempt * 1800);
    if (response && response.status() !== 521) break;
  }

  let hasBody = await page.locator('#content_views, .article_content, article').count();
  if (!hasBody && headed) {
    await promptForVerification(page);
    hasBody = await page.locator('#content_views, .article_content, article').count();
  }
  if (!hasBody) throw new Error('没有找到文章正文');

  return page.evaluate(({ url, fence }) => {
    const body = document.querySelector('#content_views') ||
      document.querySelector('.article_content') ||
      document.querySelector('article');
    if (!body) throw new Error('article body missing');

    const clone = body.cloneNode(true);
    clone.querySelectorAll([
      'script','style','iframe','noscript','.hide-preCode-box','.hljs-button',
      '.look-more-preCode','.recommend-box','.article-copyright',
      '.passport-login-container','.toolbar-box','.article-bar-top'
    ].join(',')).forEach(node => node.remove());

    function absolute(value) {
      if (!value) return '';
      try { return new URL(value, location.href).href; } catch { return value; }
    }

    function cleanText(value) {
      return String(value || '').replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
    }

    function inline(node) {
      if (node.nodeType === Node.TEXT_NODE) return cleanText(node.nodeValue);
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();

      if (tag === 'br') return '\n';
      if (tag === 'strong' || tag === 'b') return '**' + children(node) + '**';
      if (tag === 'em' || tag === 'i') return '*' + children(node) + '*';
      if (tag === 'del' || tag === 's') return '~~' + children(node) + '~~';
      if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
        const tick = String.fromCharCode(96);
        return tick + cleanText(node.textContent) + tick;
      }
      if (tag === 'a') {
        const text = children(node).trim() || cleanText(node.textContent).trim();
        const href = absolute(node.getAttribute('href'));
        if (!href || href.startsWith('javascript:') || href.startsWith('#')) return text;
        return '[' + text + '](' + href + ')';
      }
      if (tag === 'img') {
        const src = absolute(
          node.getAttribute('data-src') ||
          node.getAttribute('data-original') ||
          node.getAttribute('src')
        );
        if (!src) return '';
        const alt = cleanText(node.getAttribute('alt') || '图片').replace(/[\[\]]/g, '');
        return '![' + alt + '](' + src + ')';
      }
      return children(node);
    }

    function children(node) {
      return Array.from(node.childNodes).map(child => inline(child)).join('');
    }

    function renderList(list, depth) {
      const ordered = list.tagName.toLowerCase() === 'ol';
      const items = Array.from(list.children).filter(el => el.tagName?.toLowerCase() === 'li');
      return items.map((item, index) => {
        const prefix = ordered ? String(index + 1) + '. ' : '- ';
        const nested = Array.from(item.children).filter(el => ['ul','ol'].includes(el.tagName.toLowerCase()));
        nested.forEach(el => el.remove());
        let line = children(item).trim().replace(/\n+/g, ' ');
        let result = '  '.repeat(depth) + prefix + line;
        for (const sub of nested) result += '\n' + renderList(sub, depth + 1);
        return result;
      }).join('\n') + '\n\n';
    }

    function renderTable(table) {
      const rows = Array.from(table.querySelectorAll('tr'));
      if (!rows.length) return '';
      const matrix = rows.map(row => Array.from(row.querySelectorAll('th,td'))
        .map(cell => cleanText(cell.innerText).trim().replace(/\|/g, '\\|')));
      const width = Math.max(...matrix.map(row => row.length));
      if (!width) return '';
      const pad = row => Array.from({ length: width }, (_, i) => row[i] || '');
      const out = [];
      out.push('| ' + pad(matrix[0]).join(' | ') + ' |');
      out.push('| ' + Array(width).fill('---').join(' | ') + ' |');
      for (const row of matrix.slice(1)) out.push('| ' + pad(row).join(' | ') + ' |');
      return out.join('\n') + '\n\n';
    }

    function block(node, depth = 0) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = cleanText(node.nodeValue).trim();
        return value ? value + '\n\n' : '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        const level = Number(tag[1]);
        return '#'.repeat(level) + ' ' + children(node).trim() + '\n\n';
      }
      if (tag === 'p') return children(node).trim() + '\n\n';
      if (tag === 'pre') {
        const code = node.querySelector('code') || node;
        const className = String(code.className || '');
        const match = className.match(/(?:language-|lang-)([\w+-]+)/);
        const language = match ? match[1] : '';
        return fence + language + '\n' + code.textContent.replace(/\n+$/, '') + '\n' + fence + '\n\n';
      }
      if (tag === 'blockquote') {
        const value = Array.from(node.childNodes).map(child => block(child, depth)).join('').trim();
        return value.split('\n').map(line => '> ' + line).join('\n') + '\n\n';
      }
      if (tag === 'ul' || tag === 'ol') return renderList(node, depth);
      if (tag === 'table') return renderTable(node);
      if (tag === 'hr') return '---\n\n';
      if (tag === 'img' || tag === 'a' || tag === 'strong' || tag === 'b' || tag === 'em' || tag === 'i') {
        return inline(node).trim() + '\n\n';
      }

      const blocks = Array.from(node.childNodes).map(child => {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const childTag = child.tagName.toLowerCase();
          if (['p','pre','blockquote','ul','ol','table','hr','h1','h2','h3','h4','h5','h6','div','section','figure'].includes(childTag)) {
            return block(child, depth);
          }
        }
        return inline(child);
      }).join('');

      return blocks + (['div','section','figure'].includes(tag) ? '\n\n' : '');
    }

    const markdown = block(clone)
      .replace(/\n[ \t]+\n/g, '\n\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    const titleNode = document.querySelector('h1.title-article') || document.querySelector('h1');
    let title = titleNode?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.content?.replace(/-CSDN博客$/, '').trim() ||
      '未命名文章';

    const bodyText = document.body.innerText || '';
    const firstPublished = bodyText.match(/于\s*(\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}:\d{2}\s*首次发布/);
    let date = firstPublished?.[1] || null;
    if (!date) {
      const metaDate =
        document.querySelector('meta[itemprop="datePublished"]')?.content ||
        document.querySelector('meta[property="article:published_time"]')?.content ||
        document.querySelector('meta[name="date"]')?.content ||
        '';
      date = (String(metaDate).match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    }

    const tags = [];
    document.querySelectorAll(
      '.blog-tags-box a,.tags-box a,.article-info-box a[href*="so.csdn.net"],a[href*="so.csdn.net"][class*="tag"]'
    ).forEach(node => {
      const value = node.textContent.trim().replace(/^#/, '');
      if (value && value.length <= 40 && !['查看详情', '订阅专栏'].includes(value) && !tags.includes(value)) tags.push(value);
    });

    let series = null;
    const categoryLinks = Array.from(document.querySelectorAll('a[href*="/fancyfor/category_"]'));
    for (const link of categoryLinks) {
      let cursor = link;
      let matched = false;
      for (let i = 0; i < 7 && cursor; i += 1, cursor = cursor.parentElement) {
        if ((cursor.textContent || '').includes('收录于')) {
          matched = true;
          break;
        }
      }
      if (!matched) continue;

      const name = link.textContent
        .replace(/\s+/g, ' ')
        .replace(/\s*\d+\s*篇.*$/, '')
        .trim();
      if (!name || name === '查看详情' || name === '订阅专栏') continue;
      series = { name, href: absolute(link.getAttribute('href')) };
      break;
    }

    const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
    let description = metaDescription.replace(/\s+/g, ' ').trim();
    if (description.startsWith(title)) {
      description = description.slice(title.length).replace(/^[\s_|\-：:]+/, '');
    }
    if (!description) {
      description = clone.querySelector('p')?.innerText?.replace(/\s+/g, ' ').trim() || title;
    }
    if (description.length > 180) description = description.slice(0, 176).trim() + '…';

    return { url, title, date, tags: tags.slice(0, 8), series, description, markdown };
  }, { url, fence: FENCE });
}

function extensionFor(url, contentType) {
  const byType = new Map([
    ['image/jpeg','.jpg'],
    ['image/png','.png'],
    ['image/gif','.gif'],
    ['image/webp','.webp'],
    ['image/svg+xml','.svg']
  ]);
  const cleanType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (byType.has(cleanType)) return byType.get(cleanType);
  const ext = extname(new URL(url).pathname).toLowerCase();
  return ['.jpg','.jpeg','.png','.gif','.webp','.svg'].includes(ext) ? (ext === '.jpeg' ? '.jpg' : ext) : '.jpg';
}

async function selfHostImages(markdown, context, id, referer, basePath, budget) {
  const regex = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)(?:\s+"[^"]*")?\)/g;
  const urls = unique([...markdown.matchAll(regex)].map(match => match[2]));
  if (!urls.length) return markdown;

  const dir = join(IMAGE_ROOT, id);
  await mkdir(dir, { recursive: true });

  let output = markdown;
  let index = 0;

  for (const url of urls) {
    if (budget.used >= budget.max) break;
    index += 1;
    try {
      const response = await context.request.get(url, {
        headers: { Referer: referer },
        timeout: 30000
      });
      if (!response.ok()) continue;

      const buffer = await response.body();
      if (buffer.length > 5 * 1024 * 1024) continue;
      if (budget.used + buffer.length > budget.max) break;

      const ext = extensionFor(url, response.headers()['content-type']);
      const file = String(index).padStart(2, '0') + ext;
      await writeFile(join(dir, file), buffer);
      budget.used += buffer.length;

      const publicUrl = basePath.replace(/\/$/, '') + '/images/csdn/' + id + '/' + file;
      output = output.split(url).join(publicUrl);
    } catch (error) {
      console.warn('图片保留远程地址：' + url + ' (' + error.message + ')');
    }
  }

  return output;
}

function assignSeriesOrder(articles) {
  const groups = new Map();
  for (const article of articles) {
    if (!article.series) continue;
    const slug = article.series.slug;
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(article);
  }

  for (const group of groups.values()) {
    group.sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));
      return dateCompare || String(a.id).localeCompare(String(b.id));
    });
    group.forEach((article, index) => {
      article.series.order = index + 1;
    });
  }
}

async function writeArticle(article) {
  const tags = [...article.tags];
  if (article.series) {
    const tag = broadTag(article.series.name);
    if (tag && !tags.includes(tag)) tags.unshift(tag);
  }

  const frontmatter = [
    '---',
    'title: ' + yamlJson(article.title),
    'description: ' + yamlJson(article.description || article.title),
    'date: ' + article.date,
    'tags: ' + yamlJson(unique(tags).slice(0, 8)),
    'draft: false',
    'featured: false',
    'sample: false',
    'art: code'
  ];

  if (article.series) {
    frontmatter.push('series: ' + yamlJson(article.series));
  }
  frontmatter.push('source: ' + yamlJson({ platform: 'CSDN', url: article.url }));
  frontmatter.push('---', '');

  const sourceNote = [
    '',
    '---',
    '',
    '> 本文由我的 CSDN 博客迁移而来：[查看原文](' + article.url + ')。',
    '',
    '<!-- imported-from-csdn:' + article.id + ' -->',
    ''
  ].join('\n');

  const files = await readdir(CONTENT_DIR);
  let file = join(CONTENT_DIR, 'csdn-' + article.id + '.md');
  for (const name of files.filter(item => /\.(md|mdx)$/.test(item))) {
    const candidate = join(CONTENT_DIR, name);
    const content = await readFile(candidate, 'utf8');
    if (content.includes('article/details/' + article.id)) {
      file = candidate;
      break;
    }
  }
  await writeFile(file, frontmatter.join('\n') + article.markdown.trim() + sourceNote, 'utf8');
}

async function maybeGitCommit(push) {
  const addPaths = ['src/content/blog'];
  if (existsSync(IMAGE_ROOT)) addPaths.push('public/images/csdn');
  execFileSync('git', ['add', ...addPaths], { stdio: 'inherit' });
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  if (!status) {
    console.log('没有新的迁移变更需要提交。');
    return;
  }

  execFileSync('git', ['commit', '-m', 'content: import CSDN blog archive'], { stdio: 'inherit' });
  if (push) execFileSync('git', ['push'], { stdio: 'inherit' });
}

async function main() {
  const headless = hasArg('--headless');
  const downloadImages = !hasArg('--no-images');
  const doCommit = hasArg('--commit') || hasArg('--push');
  const doPush = hasArg('--push');
  const runCheck = hasArg('--check');
  const offset = numberArg('--offset');
  const limit = numberArg('--limit');
  const basePath = argValue('--base', process.env.BASE_PATH || '/Blog');
  const maxImageMb = Number(argValue('--max-image-mb', '80')) || 80;
  const budget = { used: 0, max: maxImageMb * 1024 * 1024 };

  await mkdir(USER_DATA_DIR, { recursive: true });
  await mkdir(CONTENT_DIR, { recursive: true });
  if (downloadImages) await mkdir(IMAGE_ROOT, { recursive: true });

  console.log('启动本地 Chromium（' + (headless ? '无界面' : '有界面') + '）...');
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width: 1440, height: 960 },
    locale: 'zh-CN',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36'
  });

  const page = context.pages()[0] || await context.newPage();
  const urls = await discoverArticleUrls(page);
  const selected = limit > 0 ? urls.slice(offset, offset + limit) : urls.slice(offset);
  const articles = [];

  for (let i = 0; i < selected.length; i += 1) {
    const url = selected[i];
    const id = articleId(url);
    console.log('[' + (i + 1) + '/' + selected.length + '] ' + url);

    try {
      const data = await extractArticle(page, url, !headless);
      const date = safeDate(data.date);
      if (!date) throw new Error('无法识别原始发布日期');

      const series = data.series ? {
        name: data.series.name,
        slug: slugForSeries(data.series.name, data.series.href)
      } : null;

      let markdown = data.markdown;
      if (downloadImages && id) {
        markdown = await selfHostImages(markdown, context, id, url, basePath, budget);
      }

      articles.push({
        id,
        url,
        title: data.title,
        description: data.description,
        date,
        tags: data.tags,
        series,
        markdown
      });
    } catch (error) {
      console.error('迁移失败：' + url);
      console.error(error.message);
      if (headless) continue;
    }

    await sleep(1600);
  }

  const minimum = Math.max(1, Math.floor(selected.length * 0.8));
  if (articles.length < minimum) {
    await context.close();
    throw new Error('只成功解析 ' + articles.length + '/' + selected.length + ' 篇，为避免残缺迁移已停止写入。');
  }

  assignSeriesOrder(articles);
  for (const article of articles) await writeArticle(article);

  await context.close();

  console.log('\n迁移完成：' + articles.length + ' 篇');
  console.log('系列数量：' + new Set(articles.filter(a => a.series).map(a => a.series.slug)).size);
  console.log('图片写入：' + (budget.used / 1024 / 1024).toFixed(1) + ' MiB');

  if (runCheck) {
    console.log('\n运行 Astro 检查...');
    execFileSync('npm', ['run', 'check'], { stdio: 'inherit' });
  }

  if (doCommit) maybeGitCommit(doPush);
  else {
    console.log('\n下一步：npm run check');
    console.log('确认无误后：git add . && git commit -m "content: import CSDN blog archive" && git push');
  }
}

main().catch(error => {
  console.error('\nCSDN 迁移失败：' + error.message);
  if (String(error.message).includes('Executable')) {
    console.error('先运行：npx playwright install chromium');
  }
  process.exitCode = 1;
});
