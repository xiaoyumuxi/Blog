import { getCollection } from 'astro:content';
export const site = {
  name: 'xiaoyumuxi', title: 'xiaoyumuxi · Bluehour', handle: '@xiaoyumuxi',
  description: 'xiaoyumuxi 的技术博客：Java 后端、系统工程、Rust 与 Agent Runtime 的实践记录。',
  github: 'https://github.com/xiaoyumuxi', repository: 'https://github.com/xiaoyumuxi/Blog'
};
export function href(path = ''): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('Unsupported URL');
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}

// Content dates are author-facing calendar dates. Build runners use UTC, while this
// blog publishes on UTC+8; shifting "now" avoids hiding a post during the first
// eight hours of its intended publication date.
const publicationNow = () => new Date(Date.now() + 8 * 60 * 60 * 1000);
export const posts = async () => (await getCollection('blog', p => !p.data.draft && p.data.date <= publicationNow()))
  .sort((a,b) => b.data.date.valueOf() - a.data.date.valueOf());
export const formatDate = (date: Date) => new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(date);
export const readTime = (body = '') => Math.max(1, Math.ceil(body.replace(/\s/g, '').length / 500));
