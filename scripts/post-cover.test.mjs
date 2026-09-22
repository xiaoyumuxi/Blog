import assert from 'node:assert/strict';
import test from 'node:test';
import { coverTheme, escapeXml, generatedCoverPath, isValidCoverSource, postCover, renderPostCover, wrapCoverText } from '../src/lib/post-cover.ts';

const post = (title, tags = [], extra = {}) => ({ id: 'sample-post', data: { title, tags, ...extra } });
test('every article has its own stable local cover; custom covers take priority', () => {
  const article = post('Java 集合源码');
  assert.equal(postCover(article).src, 'covers/sample-post.svg');
  assert.equal(postCover({ ...article, id: 'another-post' }).src, 'covers/another-post.svg');
  assert.equal(postCover(post('自定义', [], { cover: '/images/cover.webp', coverAlt: '说明文字' })).src, '/images/cover.webp');
  assert.equal(postCover(post('自定义', [], { coverAlt: '说明文字' })).alt, '说明文字');
  assert.equal(postCover(post('空白', [], { cover: ' ' })).src, 'covers/sample-post.svg');
  assert.equal(generatedCoverPath('series/中文 & title'), 'covers/series/%E4%B8%AD%E6%96%87%20%26%20title.svg');
});
test('title subjects override broad tags; series is a secondary signal', () => {
  for (const [title, key] of [['Redis 集群', 'redis'], ['B树 vs B+树(MySQL为什么选择了B+树)', 'database'], ['Rust 所有权', 'rust'], ['AI Agent Runtime', 'ai'], ['xv6 页表', 'systems'], ['TCP 三次握手', 'network'], ['JDK17 集合源码', 'java'], ['随笔与记录', 'notes']]) {
    assert.equal(coverTheme(post(title)).key, key, title);
  }
  assert.equal(coverTheme(post('MySQL 索引', ['Java', '后端'])).key, 'database');
  assert.equal(coverTheme(post('第一篇', [], { series: { name: 'Rust 入门', slug: 'rust' } })).key, 'rust');
});
test('manual paths reject executable schemes, credentials and local path traversal', () => {
  for (const source of ['/images/a.webp', 'images/a.svg', '/uploads/a.PNG', 'https://example.com/cover?id=1', 'http://example.com/a.png']) assert(isValidCoverSource(source), source);
  for (const source of ['', ' ', '//example.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml,bad', 'file:///a.png', '../a.png', '/images/../a.png', '/images/%2e%2e/a.png', '/%2fexample.com/a.svg', '/a\\b.png', '/a%5cb.png', '/a%00.png', 'https://user:pass@example.com/a.png', 'https://', '/images/a.html', '/bad%.svg']) assert(!isValidCoverSource(source), source);
});
test('SVG safely encodes all source text and has no active/remote content', () => {
  const title = '<script>alert("x")</script> & 中文';
  const svg = renderPostCover(post(title, ['<image onload="evil">']));
  assert(svg.includes(`<title id="cover-title">${escapeXml(title)}</title>`));
  assert(!/<script|<foreignObject|<[^>]*\s(?:on\w+|href)\s*=/i.test(svg));
  assert(!svg.includes('<image'));
  assert.equal(escapeXml('A\u0000&B <C>'), 'A&amp;B &lt;C&gt;');
  assert(svg.includes('width="1200" height="675"'));
});
test('long CJK, Latin and emoji titles fit bounded lines without broken surrogate pairs', () => {
  for (const title of ['后端开发核心面试题整理'.repeat(30), 'AnExtremelyLongUnbrokenIdentifier'.repeat(15), '学习🧑‍💻开发🚀'.repeat(30)]) {
    const lines = wrapCoverText(title, 12, 4);
    assert(lines.length <= 4);
    assert(lines.at(-1).endsWith('…'));
    assert(!lines.some(line => line.includes('\ufffd')));
    assert(!renderPostCover(post(title)).includes('NaN'));
  }
  assert.deepEqual(wrapCoverText('Hello', 12, 4), ['Hello']);
  assert(wrapCoverText('为什么必须使用 volatile？', 10, 4).some(line => line.includes('volatile')));
  assert(wrapCoverText('B树 vs B+树(MySQL为什么选择了B+树)', 10, 4).some(line => line.includes('MySQL')));
  assert.throws(() => wrapCoverText('test', 0, 0));
});
test('rendering is deterministic, unique by article and preserves full titles for accessibility', () => {
  const article = post('基础八股速通：后端开发核心面试题整理', ['后端']);
  assert.equal(renderPostCover(article), renderPostCover(article));
  assert.notEqual(renderPostCover(article), renderPostCover({ ...article, id: 'different' }));
  assert(renderPostCover(article).includes(article.data.title));
  assert(renderPostCover(post('第一章', [], { series: { name: '系统笔记', slug: 'systems', order: 2 } })).includes('CHAPTER 02'));
});
