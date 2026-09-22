/** Article covers are rendered at build time: no remote image service or client canvas. */
export interface CoverPost {
  id: string;
  data: {
    title: string;
    tags: string[];
    cover?: string;
    coverAlt?: string;
    series?: { name: string; slug: string; order?: number };
  };
}

type Diagram = 'code' | 'database' | 'network' | 'layers' | 'notes';
interface Theme {
  key: string;
  label: string;
  background: string;
  surface: string;
  accent: string;
  secondary: string;
  diagram: Diagram;
}
const themes = {
  java: { key: 'java', label: 'JAVA / BACKEND', background: '#0d1930', surface: '#182e50', accent: '#82b8ff', secondary: '#b9a1ff', diagram: 'code' },
  redis: { key: 'redis', label: 'REDIS / CACHE', background: '#26151f', surface: '#482238', accent: '#ffaaa2', secondary: '#f4cd9a', diagram: 'database' },
  database: { key: 'database', label: 'DATABASE / STORAGE', background: '#0d2428', surface: '#16414a', accent: '#80dfd5', secondary: '#8bb8ff', diagram: 'database' },
  systems: { key: 'systems', label: 'SYSTEMS / INTERNALS', background: '#17172d', surface: '#2b2a50', accent: '#b8abff', secondary: '#83baff', diagram: 'layers' },
  ai: { key: 'ai', label: 'AI / AGENT', background: '#20162f', surface: '#38244f', accent: '#d5a4ff', secondary: '#83dfdf', diagram: 'network' },
  rust: { key: 'rust', label: 'RUST / ENGINEERING', background: '#291b17', surface: '#493124', accent: '#f5bd8e', secondary: '#f1ddaf', diagram: 'layers' },
  network: { key: 'network', label: 'NETWORK / DISTRIBUTED', background: '#10212f', surface: '#173b50', accent: '#82d5ef', secondary: '#9caaff', diagram: 'network' },
  notes: { key: 'notes', label: 'NOTES / EXPLORING', background: '#23221e', surface: '#3c3930', accent: '#e4d092', secondary: '#aac6bd', diagram: 'notes' }
} satisfies Record<string, Theme>;

/** Match specific article subjects before broad series/tags (e.g. MySQL in a Java series). */
function matchTheme(text: string): Theme | undefined {
  if (/redis|缓存/i.test(text)) return themes.redis;
  if (/mysql|sql\b|数据库|b\+?\s*树|索引|mvcc/i.test(text)) return themes.database;
  if (/\brust\b|cargo|所有权|借用检查/i.test(text)) return themes.rust;
  if (/\bai\b|agent|rag\b|llm|人工智能|大模型|机器学习/i.test(text)) return themes.ai;
  if (/java|jdk|jvm|spring/i.test(text)) return themes.java;
  if (/xv6|mit\s*6[.s]|操作系统|linux|内核|页表|内存|进程|系统调用|\bc\+\+/i.test(text)) return themes.systems;
  if (/tcp|udp|http|网络|rpc|分布式|一致性|netty/i.test(text)) return themes.network;
  if (/java|jdk|jvm|spring|集合|线程|锁|volatile|后端|八股/i.test(text)) return themes.java;
  return undefined;
}
export function coverTheme(post: CoverPost): Theme {
  return matchTheme(post.data.title)
    ?? matchTheme(`${post.data.series?.name ?? ''} ${post.data.tags.join(' ')}`)
    ?? themes.notes;
}

/** Paths are site-relative; callers apply href() exactly once for GitHub Pages' base. */
export function generatedCoverPath(id: string): string {
  return `covers/${id.split('/').map(encodeURIComponent).join('/')}.svg`;
}
export function postCover(post: CoverPost) {
  const fallback = generatedCoverPath(post.id);
  return {
    src: post.data.cover?.trim() || fallback,
    alt: post.data.coverAlt?.trim() || `${post.data.title}的文章封面`,
    fallback
  };
}

/** Only public image files or credential-free HTTP(S) image URLs are accepted. */
export function isValidCoverSource(value: string): boolean {
  if (!value || value !== value.trim() || /[\s\\\u0000-\u001f]/u.test(value) || value.startsWith('//')) return false;
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      return Boolean(url.hostname) && !url.username && !url.password;
    } catch { return false; }
  }
  if (/[?#:]/u.test(value)) return false;
  try {
    const decoded = decodeURIComponent(value);
    return !/[\\\u0000-\u001f]/u.test(decoded)
      && !decoded.startsWith('//')
      && !decoded.split('/').some(part => part === '.' || part === '..')
      && /\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(decoded);
  } catch { return false; }
}

const cleanText = (value: string) => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/gu, '')
  .replace(/\s+/gu, ' ').trim();
export function escapeXml(value: string): string {
  return cleanText(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[char]!);
}
const charWidth = (char: string) => /[\u0000-\u007f]/u.test(char)
  ? (/[MW@#%]/.test(char) ? 0.9 : 0.6) : 1;
const textWidth = (text: string) => Array.from(text).reduce((sum, char) => sum + charWidth(char), 0);

/** Unicode-safe wrapping. Long titles shrink first, then ellipsize within the safe area. */
export function wrapCoverText(value: string, width: number, maxLines: number): string[] {
  if (width < 2 || maxLines < 1) throw new Error('Invalid cover text bounds');
  // Keep ordinary Latin identifiers intact (MySQL, volatile, MIT6.S081).
  // Oversized identifiers still split so they cannot escape the image bounds.
  const tokens = (cleanText(value).match(/[A-Za-z0-9][A-Za-z0-9_+.#-]*|[^\x00-\x7f]|./gu) || [])
    .flatMap(token => textWidth(token) > width ? Array.from(token) : [token]);
  const lines: string[] = [];
  let line = '';
  for (const token of tokens) {
    if (line && textWidth(line + token) > width) {
      if (lines.length === maxLines - 1) {
        while (line && textWidth(line + '…') > width) line = Array.from(line).slice(0, -1).join('');
        lines.push(`${line.trimEnd()}…`);
        return lines;
      }
      lines.push(line.trim());
      line = '';
    }
    if (line || token !== ' ') line += token;
  }
  if (line) lines.push(line.trim());
  return lines;
}

function hashId(value: string): number {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619);
  return hash >>> 0;
}

/** All diagram markup is trusted, local geometry; source text is never interpolated here. */
function diagramSvg(theme: Theme, seed: number): string {
  const { accent, secondary, surface, diagram } = theme;
  const shell = `<rect x="810" y="168" width="318" height="330" rx="30" fill="${surface}" stroke="${accent}" stroke-opacity=".22"/>`;
  let drawing: string;
  if (diagram === 'database') {
    drawing = [236, 304, 372].map((y, index) => `<path d="M868 ${y}v42c0 32 204 32 204 0v-42" fill="${surface}" stroke="${accent}" stroke-width="3"/><ellipse cx="970" cy="${y}" rx="102" ry="28" fill="${surface}" stroke="${accent}" stroke-width="3"/><circle cx="1042" cy="${y + 38}" r="4" fill="${secondary}"/><path d="M895 ${y + 40}h${30 + index * 14}" stroke="${secondary}" stroke-width="4" stroke-linecap="round"/>`).join('');
  } else if (diagram === 'network') {
    const points = [[970, 222], [1056, 284], [1042, 393], [910, 412], [864, 298]];
    drawing = points.map(([x, y]) => `<path d="M970 324L${x} ${y}" stroke="${accent}" stroke-width="3" stroke-opacity=".6"/>`).join('')
      + `<path d="M970 222L1056 284L1042 393L910 412L864 298Z" fill="none" stroke="${secondary}" stroke-opacity=".28" stroke-width="2" stroke-dasharray="6 9"/>`
      + points.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="${index === seed % 5 ? 19 : 13}" fill="${surface}" stroke="${index % 2 ? secondary : accent}" stroke-width="3"/>`).join('')
      + `<rect x="934" y="288" width="72" height="72" rx="22" fill="${accent}"/><path d="M950 324h40m-20-20v40" stroke="${theme.background}" stroke-width="4" stroke-linecap="round"/>`;
  } else if (diagram === 'layers') {
    drawing = [260, 330, 400].map((y, index) => `<path d="M970 ${y - 46}l115 46-115 46-115-46Z" fill="${surface}" stroke="${index === 1 ? secondary : accent}" stroke-width="3"/><path d="M855 ${y}v18l115 46 115-46v-18M970 ${y + 46}v18" fill="none" stroke="${accent}" stroke-opacity=".5" stroke-width="2"/>`).join('');
  } else if (diagram === 'code') {
    drawing = `<rect x="843" y="219" width="252" height="224" rx="16" fill="${theme.background}" stroke="${accent}" stroke-opacity=".5" stroke-width="2"/><path d="M843 258h252" stroke="${accent}" stroke-opacity=".25"/>`
      + [865, 885, 905].map((x, i) => `<circle cx="${x}" cy="239" r="5" fill="${i === 1 ? secondary : accent}" opacity=".8"/>`).join('')
      + `<path d="M906 294l-28 28 28 28m126-56 28 28-28 28m-52-70-24 84" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
      + `<path d="M873 388h104m-104 22h66m120-22h15" stroke="${secondary}" stroke-opacity=".65" stroke-width="6" stroke-linecap="round"/>`;
  } else {
    drawing = `<rect x="874" y="224" width="183" height="227" rx="15" transform="rotate(-9 966 337)" fill="${surface}" stroke="${secondary}" stroke-opacity=".45" stroke-width="2"/><rect x="891" y="216" width="180" height="222" rx="15" fill="${theme.background}" stroke="${accent}" stroke-width="3"/><path d="M917 263h56m-56 42h126m-126 31h108m-108 31h126m-126 31h72" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-opacity=".8"/>`;
  }
  return shell + drawing;
}

export function renderPostCover(post: CoverPost): string {
  const theme = coverTheme(post);
  const seed = hashId(post.id);
  const title = cleanText(post.data.title) || '未命名文章';
  let fontSize = 64;
  for (const size of [64, 56, 48, 42]) {
    fontSize = size;
    if (wrapCoverText(title, 638 / size, 4).every(line => !line.endsWith('…'))) break;
  }
  const lines = wrapCoverText(title, 638 / fontSize, 4);
  const lineHeight = fontSize * 1.38;
  const titleY = 330 - (lines.length - 1) * lineHeight / 2;
  const context = wrapCoverText(post.data.series?.name || post.data.tags.slice(0, 2).join(' · ') || '学习与实践', 28, 1)[0] || '';
  const chapter = post.data.series?.order;
  const edition = chapter ? `CHAPTER ${String(chapter).padStart(2, '0')}` : theme.label;
  const fingerprint = seed.toString(16).padStart(8, '0').slice(0, 4).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-labelledby="cover-title cover-desc" data-cover-theme="${theme.key}">
<title id="cover-title">${escapeXml(title)}</title>
<desc id="cover-desc">${escapeXml(`${title} · ${context} · xiaoyumuxi`)}</desc>
<defs>
  <linearGradient id="background" x2="1" y2="1"><stop stop-color="${theme.background}"/><stop offset="1" stop-color="${theme.surface}"/></linearGradient>
  <radialGradient id="halo"><stop stop-color="${theme.accent}" stop-opacity=".13"/><stop offset="1" stop-color="${theme.accent}" stop-opacity="0"/></radialGradient>
  <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="${theme.accent}" stroke-opacity=".055"/></pattern>
</defs>
<rect width="1200" height="675" fill="url(#background)"/>
<rect width="1200" height="675" fill="url(#grid)"/>
<circle cx="1010" cy="280" r="360" fill="url(#halo)"/>
<path d="M72 134H1128M72 549H1128" stroke="${theme.accent}" stroke-opacity=".2"/>
<g font-family="'PingFang SC','Microsoft YaHei','Noto Sans CJK SC',system-ui,sans-serif">
  <rect x="72" y="65" width="9" height="27" rx="4" fill="${theme.accent}"/>
  <text x="99" y="87" fill="${theme.accent}" font-size="22" font-weight="650" letter-spacing="2">${escapeXml(edition)}</text>
  <text x="1128" y="86" text-anchor="end" fill="${theme.secondary}" font-size="16" letter-spacing="3">BLUEHOUR</text>
  ${lines.map((line, index) => `<text x="72" y="${Math.round(titleY + index * lineHeight)}" font-size="${fontSize}" font-weight="750" fill="#f4f6ff">${escapeXml(line)}</text>`).join('\n  ')}
  <text x="74" y="508" fill="${theme.secondary}" font-size="23">${escapeXml(context)}</text>
  <text x="72" y="605" fill="#f4f6ff" font-size="22" font-weight="600">xiaoyumuxi<tspan fill="${theme.secondary}" font-weight="400"> / 技术与思考</tspan></text>
  <text x="1128" y="605" text-anchor="end" fill="${theme.secondary}" font-size="17" letter-spacing="2">FIELD NOTES · ${fingerprint}</text>
</g>
${diagramSvg(theme, seed)}
</svg>`;
}
