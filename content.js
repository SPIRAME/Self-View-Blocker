let blockingEnabled = document.documentElement.dataset.svbEnabled !== 'false';
window.addEventListener('__buganizerBlockingState__', (e) => {
  blockingEnabled = e.detail === 'true';
});

const lastGoodResponse = {};

function parseBuganizerBody(text) {
  try { return JSON.parse(text.replace(/^\s*\)\]\}'\s*/, '')); }
  catch (e) { return null; }
}

function extractViews(data, email) {
  if (!data) return null;

  function isOwnIssue(issue) {
    if (!email) return true;
    try {
      const inner = issue[2];
      const reporter = Array.isArray(inner[6]) ? (inner[6][0] || '').toLowerCase() : '';
      if (reporter === email) return true;
      const ccs = Array.isArray(inner[9]) ? inner[9] : [];
      for (const cc of ccs) {
        if (Array.isArray(cc) && (cc[0] || '').toLowerCase() === email) return true;
      }
    } catch(e) {}
    return false;
  }

  try {
    const pages = data[0][6];
    if (Array.isArray(pages)) {
      const results = [];
      for (const page of pages) {
        if (!Array.isArray(page)) continue;
        for (const issue of page) {
          const id = issue[1]; if (!id) continue;
          if (!isOwnIssue(issue)) continue;
          const title = Array.isArray(issue[2]) && issue[2][5] ? issue[2][5] : String(id);
          const slot  = issue[46];
          const views7d = (Array.isArray(slot) && slot[1] != null) ? slot[1] : 0;
          results.push({ id, title, views7d });
        }
      }
      if (results.length) return results;
    }
  } catch(e) {}

  try {
    const flat = data[0][2][0];
    if (Array.isArray(flat)) {
      const results = [];
      for (const issue of flat) {
        const id = issue[1]; if (!id) continue;
        if (!isOwnIssue(issue)) continue;
        const title = Array.isArray(issue[2]) && issue[2][5] ? issue[2][5] : String(id);
        const slot  = issue[46];
        const views7d = (Array.isArray(slot) && slot[1] != null) ? slot[1] : 0;
        results.push({ id, title, views7d });
      }
      if (results.length) return results;
    }
  } catch(e) {}

  return null;
}

function pathKey(url) {
  try { return new URL(url, location.href).pathname; }
  catch { return url; }
}

function detectEmail() {
  try {
    if (window.buganizerSessionJspb &&
        Array.isArray(window.buganizerSessionJspb) &&
        Array.isArray(window.buganizerSessionJspb[0])) {
      const email = window.buganizerSessionJspb[0][0];
      if (email && email.includes('@')) return email.toLowerCase();
    }
  } catch(e) {}

  try {
    const scripts = document.querySelectorAll('script:not([src])');
    for (const s of scripts) {
      const m = s.textContent.match(/buganizerSessionJspb\s*=\s*\[\s*\[\s*"([^"]+@[^"]+)"/);
      if (m) return m[1].toLowerCase();
    }
  } catch(e) {}

  return null;
}

function handleResponse(url, responseText, status) {
  if (status !== 200) return;
  const key = pathKey(url);
  const data = parseBuganizerBody(responseText);
  const email = detectEmail();
  if (!email) return;
  const views = extractViews(data, email);
  if (views && views.length) {
    lastGoodResponse[key] = responseText;
    window.dispatchEvent(new CustomEvent('__buganizerViewData__', {
      detail: JSON.stringify({ views, email })
    }));
  }
}

function isRelevantUrl(url) {
  return url && (url.includes('action/issues/list') || url.includes('action/issues/batch'));
}

(function() {
  const NativeXHR = window.XMLHttpRequest;
  class InterceptedXHR extends NativeXHR {
    open(method, url, ...rest) {
      this._svbUrl = url;
      return super.open(method, url, ...rest);
    }
    send(body) {
      const url = this._svbUrl || '';
      if (blockingEnabled && url && url.includes('read_timestamp') && body) {
        try {
          const parsed = JSON.parse(body);
          if (parsed[3]) { parsed[3][1] = 1; parsed[3][2] = 0; body = JSON.stringify(parsed); }
        } catch(e) {}
      }
      if (isRelevantUrl(url)) {
        this.addEventListener('readystatechange', () => {
          if (this.readyState === 4) handleResponse(url, this.responseText, this.status);
        });
      }
      return super.send(body);
    }
  }
  Object.defineProperty(InterceptedXHR, 'name', { value: 'XMLHttpRequest' });
  for (const key of Object.keys(NativeXHR)) {
    try { InterceptedXHR[key] = NativeXHR[key]; } catch(e) {}
  }
  window.XMLHttpRequest = InterceptedXHR;
})();

const origFetch = window.fetch;
window.fetch = function(...args) {
  const req = args[0];
  const url = typeof req === 'string' ? req : (req && req.url ? req.url : '');
  let opts = args[1] || {};
  if (blockingEnabled && url.includes('read_timestamp') && opts.body) {
    try {
      const parsed = JSON.parse(opts.body);
      if (parsed[3]) {
        parsed[3][1] = 1; parsed[3][2] = 0;
        opts = Object.assign({}, opts, { body: JSON.stringify(parsed) });
        args[1] = opts;
      }
    } catch(e) {}
  }
  if (isRelevantUrl(url)) {
    return origFetch.apply(this, args).then(response => {
      response.clone().text()
        .then(text => handleResponse(url, text, response.status))
        .catch(() => {});
      return response;
    });
  }
  return origFetch.apply(this, args);
};

window.addEventListener('__svbFetchViews__', (e) => {
  const key = pathKey(e.detail);
  const cached = lastGoodResponse[key];
  const email = detectEmail();
  if (!email) {
    window.dispatchEvent(new CustomEvent('__svbFetchViewsResult__', {
      detail: JSON.stringify({ views: [], email: null })
    }));
    return;
  }
  const views = cached ? (extractViews(parseBuganizerBody(cached), email) || []) : [];
  window.dispatchEvent(new CustomEvent('__svbFetchViewsResult__', {
    detail: JSON.stringify({ views, email })
  }));
});
