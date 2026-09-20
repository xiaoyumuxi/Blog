// The public counter is read-only; no API token or invented local counter is used.
export function goatcounterOrigin(code) {
  if (typeof code !== 'string') throw new Error('GoatCounter site code must be a string.');
  const value = code.trim();
  if (!value) return '';
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value)) {
    throw new Error('Use the lowercase site code, not a URL or an API token.');
  }
  return `https://${value}.goatcounter.com`;
}

export function counterURL(origin, path) {
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.goatcounter\.com$/.test(origin)) {
    throw new Error('Invalid GoatCounter origin.');
  }
  if (!path.startsWith('/') || path.startsWith('//') || /[?#]/.test(path)) {
    throw new Error('Counter path must be the canonical pathname, without query or hash.');
  }
  return `${origin}/counter/${encodeURIComponent(path)}.json`;
}

export function counterValue(data) {
  const value = data && typeof data === 'object' ? data.count : undefined;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  // GoatCounter returns a formatted string, including narrow/thin spaces as separators.
  if (typeof value === 'string' && /^\d(?:[\d,\s.]*\d)?$/.test(value.trim())) return value.trim();
  throw new Error('Counter response did not contain a valid count.');
}

export function initPageViews(scope = document) {
  scope.querySelectorAll('[data-page-views]').forEach(element => {
    if (element.dataset.initialized) return;
    element.dataset.initialized = 'true';
    const label = element.querySelector('[data-views-value]');
    if (!label) return;
    const show = (state, text, hint) => {
      element.dataset.state = state;
      label.textContent = text;
      element.title = hint;
    };
    const origin = element.dataset.counterOrigin || '';
    if (!origin) {
      show('disabled', '阅读统计待启用', '尚未配置 GoatCounter；不是 0 次阅读。');
      return;
    }
    if (element.dataset.track !== 'true' || location.origin !== element.dataset.siteOrigin ||
        location.protocol !== 'https:' || window.self !== window.top) {
      show('preview', '预览不计数', '本地、预览与自动化测试不向真实统计站点上报。');
      return;
    }
    if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) {
      show('privacy', '阅读统计已停用', '已尊重浏览器的隐私设置。');
      return;
    }
    let endpoint;
    try { endpoint = counterURL(origin, element.dataset.path || ''); }
    catch {
      show('error', '阅读量暂不可用', '统计配置无效。');
      return;
    }
    // One automatic count.js integration, never an additional manual count().
    if (!document.querySelector('script[data-bluehour-goatcounter]')) {
      const script = document.createElement('script');
      script.src = 'https://gc.zgo.at/count.js';
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.dataset.bluehourGoatcounter = '';
      script.dataset.goatcounter = `${origin}/count`;
      let referrer = '';
      try { referrer = document.referrer ? new URL(document.referrer).origin : ''; } catch { /* No referrer. */ }
      script.dataset.goatcounterSettings = JSON.stringify({
        path: element.dataset.path, title: document.title, referrer, no_events: true,
      });
      document.head.appendChild(script);
    }
    show('loading', '阅读量加载中', '按文章路径统计访问；公开计数可能延迟更新。');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    fetch(endpoint, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer'})
      .then(async response => {
        if (response.status === 404) {
          show('empty', '暂无阅读数据', '路径尚未有可用记录；不将缺失数据当成 0。');
          return;
        }
        if (!response.ok) throw new Error(`Counter HTTP ${response.status}`);
        const value = counterValue(await response.json());
        show('ready', `${value} 次阅读`, 'GoatCounter 访问次数；不是实时在线人数，公开计数可能缓存最多约四小时。');
      })
      .catch(() => show('error', '阅读量暂不可用', '请检查统计站点的公开计数设置、网络或内容拦截规则。'))
      .finally(() => clearTimeout(timer));
  });
}
