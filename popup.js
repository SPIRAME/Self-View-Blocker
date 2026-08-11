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
function issueUrl(id) { return `https:
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
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
      ? `<span class="delta up">+${delta}</span>`
      : `<span class="delta flat">—</span>`;
    const title = snap.title.length > 60 ? snap.title.slice(0, 57) + '…' : snap.title;
    return `
      <div class="issue-row${hasChange ? ' changed' : ''}">
        <div class="issue-title">
          <a href="${issueUrl(snap.id)}" target="_blank" title="${esc(snap.title)}">${esc(title)}</a>
        </div>
        <div class="views-pill">
          ${deltaHtml}
          <span class="views-now">${snap.current}</span>
        </div>
      </div>`;
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
    return `
    <div class="log-row">
      <div class="log-title">
        <a href="${issueUrl(ev.id)}" target="_blank" title="${esc(ev.title)}">${esc(title)}</a>
      </div>
      <div class="log-meta">
        <span class="log-change">${ev.from} → ${ev.to} <span class="log-delta">(+${ev.to - ev.from})</span></span>
        <span class="log-time">${timeAgo(ev.ts)}</span>
      </div>
    </div>`;
  }).join('');
  panel.innerHTML = rows + `<button class="clear-btn" id="clearLog">Clear change log</button>`;
  document.getElementById('clearLog').addEventListener('click', async () => {
    await chrome.storage.local.set({ changelog: [] });
    chrome.action.setBadgeText({ text: '' });
    renderChangelog([]);
    document.getElementById('changeCount').textContent = '0';
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

function resetBaselines(snapshots) {
  if (!snapshots || !Object.keys(snapshots).length) return;
  const updated = {};
  for (const [key, snap] of Object.entries(snapshots)) {
    updated[key] = { ...snap, baseline: snap.current };
  }
  chrome.storage.local.set({ snapshots: updated });
}

chrome.action.setBadgeText({ text: '' });

chrome.storage.local.get(['snapshots', 'changelog', 'blockingEnabled'], (store) => {
  currentSnapshots = store.snapshots || {};
  renderSnapshots(currentSnapshots, currentFilter);
  renderChangelog(store.changelog || []);
  const changeCount = (store.changelog || []).length;
  document.getElementById('changeCount').textContent = changeCount || '';
  applyToggleUI(store.blockingEnabled !== false);

  
  const entries = Object.values(currentSnapshots);
  const tracking = entries.length;
  const withViews = entries.filter(s => s.current > 0).length;
  const changed = entries.filter(s => s.current > s.baseline).length;
  document.getElementById('summary').textContent =
    `${tracking} tracked · ${withViews} with views · ${changed} increased`;

  
  
  resetBaselines(store.snapshots);
});
