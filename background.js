const MAX_CHANGELOG = 200;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const WATCHED_PATHS = ['/action/issues/list', '/action/issues/batch'];
const URL_FILTER    = { urls: ['*://issuetracker.google.com/*'] };

const pending = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method !== 'POST') return;
    const path = new URL(details.url).pathname;
    if (WATCHED_PATHS.some(p => path.endsWith(p))) {
      pending.set(details.requestId, { url: details.url, tabId: details.tabId });
    }
  },
  URL_FILTER
);

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!pending.has(details.requestId)) return;
    const { url, tabId } = pending.get(details.requestId);
    pending.delete(details.requestId);
    if (tabId >= 0) askContentScriptToFetch(url, tabId);
  },
  URL_FILTER
);

chrome.webRequest.onErrorOccurred.addListener(
  (details) => pending.delete(details.requestId),
  URL_FILTER
);

function askContentScriptToFetch(url, tabId) {
  chrome.tabs.sendMessage(tabId, { type: 'FETCH_VIEWS', url }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && Array.isArray(response.views) && response.email) {
      processViewData(response.views, response.email);
    }
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'VIEW_DATA' && Array.isArray(msg.issueViews) && msg.email) {
    processViewData(msg.issueViews, msg.email)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function processViewData(issueViews, email) {
  if (!issueViews || !issueViews.length) return;

  const now          = Date.now();
  const store        = await chrome.storage.local.get(['snapshots', 'changelog', 'accounts']);
  const allSnapshots = store.snapshots || {};
  const changelog    = store.changelog || [];
  const accounts     = store.accounts  || [];
  let   changed      = false;

  if (!accounts.includes(email)) {
    accounts.push(email);
    changed = true;
  }

  const snapshots = allSnapshots[email] || {};

  for (const { id, title, views7d } of issueViews) {
    const key  = String(id);
    const snap = snapshots[key];

    if (!snap) {
      snapshots[key] = { id, title, baseline: views7d, current: views7d, windowStart: now };
      changed = true;
      continue;
    }

    snap.title = title;

    const windowExpired = (now - snap.windowStart) >= SEVEN_DAYS_MS;
    if (views7d < snap.current || windowExpired) {
      snap.baseline    = views7d;
      snap.current     = views7d;
      snap.windowStart = now;
      changed = true;
      continue;
    }

    if (views7d > snap.current) {
      const ev = { ts: now, id, title, from: snap.current, to: views7d };
      changelog.unshift(ev);
      snap.current = views7d;
      changed = true;
      fireNotification(ev);
    }
  }

  if (changed) {
    allSnapshots[email] = snapshots;
    if (changelog.length > MAX_CHANGELOG) changelog.length = MAX_CHANGELOG;
    await chrome.storage.local.set({ snapshots: allSnapshots, changelog, accounts });
    chrome.action.setBadgeText({ text: changelog.length > 0 ? String(changelog.length) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#1a73e8' });
  }
}

function fireNotification({ id, title, from, to }) {
  const short = title.length > 80 ? title.slice(0, 77) + '…' : title;
  chrome.notifications.create(`view-${id}-${Date.now()}`, {
    type:    'basic',
    iconUrl: 'icon.png',
    title:   'View count increased',
    message: `${short}\n7d views: ${from} → ${to}`,
    priority: 1
  });
}
