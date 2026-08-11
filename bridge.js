chrome.storage.local.get('blockingEnabled', (store) => {
  document.documentElement.dataset.svbEnabled = String(store.blockingEnabled !== false);
});

window.addEventListener('__buganizerViewData__', (e) => {
  try {
    chrome.runtime.sendMessage({ type: 'VIEW_DATA', issueViews: JSON.parse(e.detail) });
  } catch (err) {}
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'FETCH_VIEWS' && msg.url) {
    
    const onResult = (e) => {
      window.removeEventListener('__svbFetchViewsResult__', onResult);
      try {
        sendResponse({ views: JSON.parse(e.detail) });
      } catch {
        sendResponse({ views: [] });
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
