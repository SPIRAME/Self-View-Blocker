document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function issueUrl(id) { return 'https://issuetracker.google.com/issues/' + id; }
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}

function renderSnapshots(snapshots, filter) {
  const panel = document.getElementById('snapshots-list');
  let entries = Object.values(snapshots);
  if (!entries.length) {
    panel.innerHTML = '<div class="empty">No data yet.<br>Visit your Buganizer issue list page<br>while the extension is enabled.</div>';
    return;
  }
  if (filter === 'active') entries = entries.filter(s => s.current > 0);
  if (filter === 'changed') entries = entries.filter(s => s.current > s.baseline);
  entries.sort((a, b) => {
    const da = a.current - a.baseline, db = b.current - b.baseline;
    if (db !== da) return db - da;
    return b.current - a.current;
  });
  if (!entries.length) {
    panel.innerHTML = '<div class="empty">No matching issues.</div>';
    return;
  }
  panel.innerHTML = entries.map(snap => {
    const delta = snap.current - snap.baseline;
    const hasChange = delta > 0;
    const deltaHtml = hasChange
      ? '<span class="delta up">+' + delta + '</span>'
      : '<span class="delta flat">—</span>';
    const title = snap.title.length > 60 ? snap.title.slice(0, 57) + '…' : snap.title;
    return '<div class="issue-row' + (hasChange ? ' changed' : '') + '">' +
      '<div class="issue-title"><a href="' + issueUrl(snap.id) + '" target="_blank" title="' + esc(snap.title) + '">' + esc(title) + '</a></div>' +
      '<div class="views-pill">' + deltaHtml + '<span class="views-now">' + snap.current + '</span></div>' +
      '</div>';
  }).join('');
}

function renderChangelog(changelog) {
  const panel = document.getElementById('changelog');
  if (!changelog.length) {
    panel.innerHTML = '<div class="empty">No increases recorded yet.<br>The popup will notify you when views go up.</div>';
    return;
  }
  const rows = changelog.map(ev => {
    const title = ev.title.length > 55 ? ev.title.slice(0, 52) + '…' : ev.title;
    return '<div class="log-row">' +
      '<div class="log-title"><a href="' + issueUrl(ev.id) + '" target="_blank" title="' + esc(ev.title) + '">' + esc(title) + '</a></div>' +
      '<div class="log-meta"><span class="log-change">' + ev.from + ' → ' + ev.to + ' <span class="log-delta">(+' + (ev.to - ev.from) + ')</span></span>' +
      '<span class="log-time">' + timeAgo(ev.ts) + '</span></div>' +
      '</div>';
  }).join('');
  panel.innerHTML = rows + '<button class="clear-btn" id="clearLog">Clear change log</button>';
  document.getElementById('clearLog').addEventListener('click', async () => {
    await chrome.storage.local.set({ changelog: [] });
    chrome.action.setBadgeText({ text: '' });
    renderChangelog([]);
    document.getElementById('changeCount').textContent = '';
  });
}

let currentFilter = 'all';
let currentSnapshots = {};

document.querySelectorAll('.filter-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderSnapshots(currentSnapshots, currentFilter);
  });
});

const toggle     = document.getElementById('blockingToggle');
const statusText = document.getElementById('statusText');

function applyToggleUI(enabled) {
  toggle.checked = enabled;
  statusText.textContent = enabled ? 'ON' : 'OFF';
  statusText.className = 'status-text ' + (enabled ? 'on' : 'off');
}

toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  applyToggleUI(enabled);
  chrome.storage.local.set({ blockingEnabled: enabled });
});

function renderSummary(snapshots) {
  const entries = Object.values(snapshots);
  document.getElementById('summary').textContent =
    entries.length + ' tracked · ' +
    entries.filter(s => s.current > 0).length + ' with views · ' +
    entries.filter(s => s.current > s.baseline).length + ' increased';
}

function resetBaselines(allSnaps) {
  if (!allSnaps) return;
  const updated = {};
  for (const [email, snaps] of Object.entries(allSnaps)) {
    if (snaps && typeof snaps === 'object' && !snaps.id) {
      updated[email] = {};
      for (const [key, snap] of Object.entries(snaps)) {
        updated[email][key] = Object.assign({}, snap, { baseline: snap.current });
      }
    }
  }
  if (Object.keys(updated).length) chrome.storage.local.set({ snapshots: updated });
}

let allSnapshots = {};
let allChangelog = [];
let currentEmail = null;

function switchAccount(email) {
  currentEmail = email;
  currentSnapshots = allSnapshots[email] || {};
  renderSnapshots(currentSnapshots, currentFilter);
  renderSummary(currentSnapshots);
  const filtered = allChangelog.filter(ev => !ev.email || ev.email === email);
  renderChangelog(filtered);
  document.getElementById('changeCount').textContent = filtered.length || '';
}

chrome.action.setBadgeText({ text: '' });

chrome.storage.local.get(['snapshots', 'changelog', 'blockingEnabled', 'accounts'], (store) => {
  const rawSnaps = store.snapshots || {};
  const accounts = store.accounts || [];

  allSnapshots = rawSnaps;
  allChangelog = store.changelog || [];

  const select = document.getElementById('accountSelect');
  const accountBar = document.getElementById('accountBar');

  if (accounts.length > 1) {
    accountBar.classList.add('visible');
    select.innerHTML = accounts.map(a => '<option value="' + esc(a) + '">' + esc(a) + '</option>').join('');
    select.addEventListener('change', () => switchAccount(select.value));
  }

  // Detect which account is active from the current tab URL (cc: or reporter: in query)
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    let detected = null;
    const tab = tabs && tabs[0];
    if (tab && tab.url && tab.url.includes('issuetracker.google.com')) {
      try {
        const q = new URL(tab.url).searchParams.get('q') || '';
        const m = q.match(/\b(?:cc|reporter):([^\s]+@[^\s]+)/i);
        if (m && accounts.includes(m[1].toLowerCase())) detected = m[1].toLowerCase();
      } catch(e) {}
    }

    currentEmail = detected || accounts[0] || 'default';
    if (accounts.length > 1) select.value = currentEmail;
    currentSnapshots = allSnapshots[currentEmail] || {};

    const filteredLog = allChangelog.filter(ev => !ev.email || ev.email === currentEmail);
    renderSnapshots(currentSnapshots, currentFilter);
    renderChangelog(filteredLog);
    document.getElementById('changeCount').textContent = filteredLog.length || '';
    applyToggleUI(store.blockingEnabled !== false);
    renderSummary(currentSnapshots);
    resetBaselines(rawSnaps);
  });
});
