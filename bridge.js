chrome.storage.local.get('blockingEnabled', (store) => {
  const enabled = store.blockingEnabled !== false;
  document.documentElement.dataset.svbEnabled = String(enabled);
  window.dispatchEvent(new CustomEvent('__buganizerBlockingState__', { detail: String(enabled) }));
});

window.addEventListener('__buganizerViewData__', (e) => {
  try {
    const { views, email } = JSON.parse(e.detail);
    chrome.runtime.sendMessage({ type: 'VIEW_DATA', issueViews: views, email });
  } catch (err) {}
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH_VIEWS' && msg.url) {
    
    const onResult = (e) => {
      window.removeEventListener('__svbFetchViewsResult__', onResult);
      try {
        const { views, email } = JSON.parse(e.detail);
        sendResponse({ views, email });
      } catch {
        sendResponse({ views: [], email: 'default' });
      }
    };
    window.addEventListener('__svbFetchViewsResult__', onResult);

    
    window.dispatchEvent(new CustomEvent('__svbFetchViews__', { detail: msg.url }));

    
    setTimeout(() => {
      window.removeEventListener('__svbFetchViewsResult__', onResult);
      sendResponse({ views: [] });
    }, 10_000);

    return true; 
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if ('blockingEnabled' in changes) {
    const val = String(changes.blockingEnabled.newValue !== false);
    document.documentElement.dataset.svbEnabled = val;
    window.dispatchEvent(new CustomEvent('__buganizerBlockingState__', { detail: val }));
  }
});
