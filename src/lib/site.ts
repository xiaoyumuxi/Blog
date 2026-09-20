import { getCollection } from 'astro:content';
export const site = {
  name: 'xiaoyumuxi', title: 'xiaoyumuxi · Bluehour', handle: '@xiaoyumuxi',
  description: '记录代码、思考，与值得分享的一切。一个持续生长的个人数字花园。',
  github: 'https://github.com/xiaoyumuxi', repository: 'https://github.com/xiaoyumuxi/Blog'
};
export function href(path = ''): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path)) throw new Error('Unsupported URL');
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}
export const posts = async () => (await getCollection('blog', p => !p.data.draft && p.data.date <= new Date()))
  .sort((a,b) => b.data.date.valueOf() - a.data.date.valueOf());
export const formatDate = (date: Date) => new Intl.DateTimeFormat('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(date);
export const readTime = (body = '') => Math.max(1, Math.ceil(body.replace(/\s/g, '').length / 500));
