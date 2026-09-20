const root = document.documentElement;
const base = document.body.dataset.base || '/';
function updateThemeButton() {
  document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach(button => {
    button.setAttribute('aria-label', root.dataset.theme === 'dark' ? '切换亮色主题' : '切换深色主题');
    button.setAttribute('aria-pressed', String(root.dataset.theme === 'light'));
  });
}
updateThemeButton();
document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('bluehour-theme', root.dataset.theme); } catch { /* Storage may be disabled. */ }
  updateThemeButton();
  window.dispatchEvent(new Event('bluehour:theme'));
}));
document.querySelectorAll<HTMLButtonElement>('[data-close-dialog]').forEach(button => button.addEventListener('click', () => button.closest('dialog')?.close()));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog => dialog.addEventListener('click', event => {
  const rect = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
}));
document.querySelectorAll('[data-scroll-top]').forEach(button => button.addEventListener('click', () => window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})));

// Pagefind search runs locally. User queries are never inserted as HTML.
const dialog = document.querySelector<HTMLDialogElement>('#search-dialog')!;
const input = document.querySelector<HTMLInputElement>('#search-input')!;
const statusEl = document.querySelector<HTMLElement>('#search-status')!;
const results = document.querySelector<HTMLElement>('#search-results')!;
const openSearch = () => { if (!dialog.open) dialog.showModal(); input.focus(); };
document.querySelectorAll('[data-search-open]').forEach(button => button.addEventListener('click', openSearch));
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); dialog.open ? dialog.close() : openSearch(); }
});
let timer: ReturnType<typeof setTimeout>;
let request = 0;
let pagefindPromise: Promise<any> | undefined;
input.addEventListener('input', () => {
  clearTimeout(timer);
  const current = ++request;
  const query = input.value.trim();
  results.replaceChildren();
  if (!query) { statusEl.textContent = '输入关键词，搜索整个站点。'; return; }
  statusEl.textContent = '正在寻找…';
  timer = setTimeout(async () => {
    try {
      pagefindPromise ??= import(/* @vite-ignore */ `${base}pagefind/pagefind.js`);
      const pagefind = await pagefindPromise;
      await pagefind.options({baseUrl: base});
      const response = await pagefind.search(query);
      const matches = await Promise.all(response.results.slice(0, 12).map((result: {data:()=>Promise<any>}) => result.data()));
      if (current !== request) return;
      statusEl.textContent = matches.length ? `找到 ${response.results.length} 条结果` : '暂时没有找到，换个关键词试试。';
      matches.forEach(match => {
        const url = new URL(match.url, location.origin);
        if (url.origin !== location.origin) return;
        const link = document.createElement('a'); link.className = 'search-result'; link.href = url.href;
        const title = document.createElement('strong'); title.textContent = match.meta?.title || '未命名页面';
        const text = document.createElement('p');
        text.textContent = new DOMParser().parseFromString(match.excerpt || '', 'text/html').body.textContent;
        link.append(title, text); results.append(link);
      });
    } catch {
      pagefindPromise = undefined;
      if (current === request) statusEl.textContent = '搜索索引暂未就绪。本地请先运行 npm run build，再运行 npm run preview。';
    }
  }, 180);
});

const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-filter]'));
const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-post-card]'));
function filterPosts(tag: string, updateURL = true) {
  let visible = 0;
  cards.forEach(card => { card.hidden = !!tag && !(JSON.parse(card.dataset.tags || '[]') as string[]).includes(tag); if (!card.hidden) visible++; });
  filters.forEach(button => button.setAttribute('aria-pressed', String((button.dataset.filter || '') === tag)));
  document.querySelectorAll('[data-result-count]').forEach(el => el.textContent = String(visible));
  const empty = document.querySelector<HTMLElement>('[data-empty]'); if (empty) empty.hidden = visible !== 0;
  if (updateURL) { const url = new URL(location.href); tag ? url.searchParams.set('tag',tag) : url.searchParams.delete('tag'); history.replaceState(null,'',url); }
}
filters.forEach(button => button.addEventListener('click', () => filterPosts(button.dataset.filter || '')));
if (filters.length) filterPosts(new URL(location.href).searchParams.get('tag') || '', false);

document.querySelectorAll<HTMLElement>('[data-tabs]').forEach(tabs => {
  const buttons = Array.from(tabs.querySelectorAll<HTMLButtonElement>('[role=tab]'));
  const panels = Array.from(tabs.querySelectorAll<HTMLElement>('[role=tabpanel]'));
  const activate = (index: number, focus = false) => {
    buttons.forEach((button,i) => { button.setAttribute('aria-selected',String(i===index)); button.tabIndex=i===index?0:-1; });
    panels.forEach((panel,i) => panel.hidden=i!==index);
    if (focus) buttons[index].focus();
  };
  buttons.forEach((button,i) => {
    button.addEventListener('click', () => activate(i));
    button.addEventListener('keydown', event => {
      const next = event.key==='ArrowRight' ? (i+1)%buttons.length : event.key==='ArrowLeft' ? (i-1+buttons.length)%buttons.length : event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : -1;
      if (next>=0) { event.preventDefault(); activate(next,true); }
    });
  });
});
const lightbox = document.querySelector<HTMLDialogElement>('#lightbox')!;
document.querySelectorAll<HTMLButtonElement>('[data-lightbox]').forEach(button => button.addEventListener('click', () => {
  const image=lightbox.querySelector('img')!; image.src=button.dataset.lightbox!; image.alt=button.dataset.alt || '';
  lightbox.querySelector('p')!.textContent=image.alt; lightbox.showModal();
}));

const article=document.querySelector<HTMLElement>('[data-article]');
if(article) {
  const updateProgress=()=>{const height=article.offsetHeight-innerHeight; const progress=height>0?Math.max(0,Math.min(1,(scrollY-article.offsetTop)/height)):1;root.style.setProperty('--progress',`${progress*100}%`);};
  addEventListener('scroll',updateProgress,{passive:true}); addEventListener('resize',updateProgress); updateProgress();
  const links=Array.from(document.querySelectorAll<HTMLAnchorElement>('.toc a'));
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)links.forEach(link=>link.classList.toggle('current',link.getAttribute('href')===`#${entry.target.id}`));}),{rootMargin:'-15% 0px -65% 0px'});
  article.querySelectorAll('h2[id],h3[id]').forEach(heading=>observer.observe(heading));
}
const diagrams=Array.from(document.querySelectorAll<HTMLElement>('pre.mermaid'));
if(diagrams.length) {
  const sources=diagrams.map(el=>el.textContent || '');
  let rendering=false;
  async function renderDiagrams() {
    if(rendering) return;
    rendering=true;
    try {
      const {default:mermaid}=await import('mermaid');
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:root.dataset.theme==='dark'?'dark':'default',fontFamily:'system-ui, sans-serif'});
      for(let i=0;i<diagrams.length;i++) {
        try {const {svg}=await mermaid.render(`diagram-${i}-${Date.now()}`,sources[i]);diagrams[i].innerHTML=svg;diagrams[i].classList.add('rendered');}
        catch {diagrams[i].textContent=`流程图暂时无法渲染，请检查 Mermaid 语法。\n\n${sources[i]}`;}
      }
    } catch {
      diagrams.forEach((el,i)=>el.textContent=`图表加载失败，保留源文本：\n\n${sources[i]}`);
    } finally {rendering=false;}
  }
  void renderDiagrams(); window.addEventListener('bluehour:theme',()=>void renderDiagrams());
}
