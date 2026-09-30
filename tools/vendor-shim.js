/*
 * Mirror-only shim, served as /__mirror/vendor-shim.js by `tools/serve.mjs --vendors=local`
 * (it is NOT part of the production site). Injected into index.html right before
 * <script src="/analytics.js">, so it runs before GTM, gtag, Amplitude, Hotjar and the
 * Cloudflare beacon.
 *
 * Goal: keep the third-party scripts' *main-thread cost* (parse/compile/execute, DOM observers,
 * scroll listeners, timers, payload serialisation) while guaranteeing that nothing is sent to
 * the analytics vendors from a local mirror:
 *   1. Script loads to third-party origins are rewritten to same-origin /__vendor/<host>/<path>,
 *      which serve.mjs answers from copies saved by `mirror.mjs --crawl --vendors`.
 *   2. Network egress to any other origin (fetch, XHR, sendBeacon, WebSocket, <img> pixels,
 *      <iframe>) is answered locally with a fake success instead of leaving the machine.
 *   3. As a second fence, serve.mjs sends a CSP with connect-src/img-src/frame-src 'self', so
 *      anything this shim misses is blocked by the browser rather than sent.
 */
(function () {
  'use strict';
  var ORIGIN = location.origin;
  var stats = (window.__mirrorVendorShim = { rewrittenScripts: [], neutered: {} });

  function abs(u) {
    try { return new URL(String(u), document.baseURI); } catch (e) { return null; }
  }
  function isForeign(u) {
    var x = abs(u);
    return !!x && /^(https?|wss?):$/.test(x.protocol) && x.origin !== ORIGIN;
  }
  function count(kind, u) {
    var x = abs(u);
    var k = kind + ' ' + (x ? x.host : String(u));
    stats.neutered[k] = (stats.neutered[k] || 0) + 1;
  }
  function vendorPath(u) {
    var x = abs(u);
    return '/__vendor/' + x.host + x.pathname + x.search;
  }

  // ---- 1. <script src> to a third-party origin -> /__vendor/... ---------------------------
  var scriptSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
  Object.defineProperty(HTMLScriptElement.prototype, 'src', {
    configurable: true,
    enumerable: scriptSrc.enumerable,
    get: scriptSrc.get,
    set: function (v) {
      if (isForeign(v)) { stats.rewrittenScripts.push(String(v)); v = vendorPath(v); }
      scriptSrc.set.call(this, v);
    },
  });
  var imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  var PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: imgSrc.enumerable,
    get: imgSrc.get,
    set: function (v) {
      // Only tracking pixels are cross-origin on this page; the site's own images are same-origin.
      if (isForeign(v)) { count('img', v); v = PIXEL; }
      imgSrc.set.call(this, v);
    },
  });
  var iframeSrc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src');
  Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
    configurable: true,
    enumerable: iframeSrc.enumerable,
    get: iframeSrc.get,
    set: function (v) {
      if (isForeign(v)) { count('iframe', v); v = 'about:blank'; }
      iframeSrc.set.call(this, v);
    },
  });
  var setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (typeof name === 'string' && name.toLowerCase() === 'src' && isForeign(value)) {
      if (this instanceof HTMLScriptElement) { stats.rewrittenScripts.push(String(value)); value = vendorPath(value); }
      else if (this instanceof HTMLImageElement) { count('img', value); value = PIXEL; }
      else if (this instanceof HTMLIFrameElement) { count('iframe', value); value = 'about:blank'; }
    }
    return setAttr.call(this, name, value);
  };

  // ---- 2. network egress ---------------------------------------------------------------------
  function fakeBody(u) {
    var h = (abs(u) || {}).host || '';
    if (/amplitude\.com$/.test(h)) {
      if (/sr-client-cfg/.test(h)) return '{}';
      return JSON.stringify({ code: 200, events_ingested: 1, payload_size_bytes: 0, server_upload_time: Date.now() });
    }
    return null; // 204
  }

  var origFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = input && typeof input === 'object' && 'url' in input ? input.url : input;
    if (isForeign(url)) {
      count('fetch', url);
      var body = fakeBody(url);
      return Promise.resolve(body === null ? new Response(null, { status: 204 })
        : new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
    }
    return origFetch.apply(this, arguments);
  };

  var xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isForeign(url)) {
      count('xhr', url);
      var args = Array.prototype.slice.call(arguments);
      // answered by serve.mjs with 204 (or a JSON ack for Amplitude); never forwarded anywhere
      args[1] = '/__mirror/null?h=' + encodeURIComponent((abs(url) || {}).host || '');
      return xhrOpen.apply(this, args);
    }
    return xhrOpen.apply(this, arguments);
  };

  if (navigator.sendBeacon) {
    var beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      if (isForeign(url)) { count('beacon', url); return true; }
      return beacon(url, data);
    };
  }

  var RealWS = window.WebSocket;
  if (RealWS) {
    var FakeWS = function (url) {
      if (!isForeign(url)) return new RealWS(url, arguments[1]);
      count('websocket', url);
      var ws = new EventTarget();
      ws.url = String(url); ws.readyState = 0; ws.bufferedAmount = 0; ws.protocol = ''; ws.extensions = '';
      ws.binaryType = 'blob'; ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      ws.send = function () { count('websocket-send', url); };
      ws.close = function () {
        if (ws.readyState > 1) return;
        ws.readyState = 3;
        var ev = new CloseEvent('close', { code: 1000, wasClean: true });
        if (ws.onclose) ws.onclose(ev);
        ws.dispatchEvent(ev);
      };
      setTimeout(function () {
        if (ws.readyState !== 0) return;
        ws.readyState = 1;
        var ev = new Event('open');
        if (ws.onopen) ws.onopen(ev);
        ws.dispatchEvent(ev);
      }, 50);
      return ws;
    };
    FakeWS.CONNECTING = 0; FakeWS.OPEN = 1; FakeWS.CLOSING = 2; FakeWS.CLOSED = 3;
    FakeWS.prototype = RealWS.prototype;
    window.WebSocket = FakeWS;
  }
})();
