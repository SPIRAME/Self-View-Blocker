const origOpen = XMLHttpRequest.prototype.open;
const origSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function(method, url, ...rest) {
  this._url = url;
  return origOpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function(body) {
  if (this._url && this._url.includes('read_timestamp') && body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed[3]) {
        parsed[3][1] = 1;
        parsed[3][2] = 0;
        body = JSON.stringify(parsed);
      }
    } catch(e) {}
  }
  return origSend.call(this, body);
};

const origFetch = window.fetch;
window.fetch = function(...args) {
  if (typeof args[0] === 'string' && args[0].includes('read_timestamp') && args[1]?.body) {
    try {
      const parsed = JSON.parse(args[1].body);
      if (parsed[3]) {
        parsed[3][1] = 1;
        parsed[3][2] = 0;
        args[1] = { ...args[1], body: JSON.stringify(parsed) };
      }
    } catch(e) {}
  }
  return origFetch.apply(this, args);
};
