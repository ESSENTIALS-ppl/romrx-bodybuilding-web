/* utm-forward.js (Growth 2026-09-29). Dependency-free.
 * If the visitor landed with utm_* or fbclid (e.g. an Instagram bio link), forward
 * those exact params onto every romrx.io link on this site. The first landing's
 * params are kept in sessionStorage so they survive in-site navigation.
 * If nothing came in, links keep their fixed owned/site tags (utm_term = placement).
 * Incoming and fixed params are never mixed: all utm_* and fbclid on the link are
 * replaced by the incoming set. Only hrefs on romrx.io / www.romrx.io are touched. */
(function () {
  'use strict';
  var KEY = 'romrx.inbound_params';
  var HOSTS = { 'romrx.io': 1, 'www.romrx.io': 1 };

  function isTracked(k) { k = k.toLowerCase(); return k.indexOf('utm_') === 0 || k === 'fbclid'; }

  function pick(search) {
    var out = [];
    try {
      new URLSearchParams(search || '').forEach(function (v, k) {
        if (isTracked(k) && v) out.push([k, v]);
      });
    } catch (e) { /* ignore */ }
    return out;
  }

  function loadIncoming() {
    var stored = null;
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { stored = null; }
    if (stored && stored.length) return stored;
    var fromUrl = pick(window.location.search);
    if (fromUrl.length) {
      try { sessionStorage.setItem(KEY, JSON.stringify(fromUrl)); } catch (e) { /* private mode */ }
    }
    return fromUrl;
  }

  /* Pure: returns the rewritten href, or null when it should not change. */
  function rewrite(href, incoming) {
    if (!href || !incoming || !incoming.length) return null;
    var u;
    try { u = new URL(href, window.location.href); } catch (e) { return null; }
    if (!HOSTS[u.hostname] || (u.protocol !== 'https:' && u.protocol !== 'http:')) return null;
    var keep = [];
    u.searchParams.forEach(function (v, k) { if (!isTracked(k)) keep.push([k, v]); });
    var sp = new URLSearchParams();
    keep.concat(incoming).forEach(function (p) { sp.append(p[0], p[1]); });
    var qs = sp.toString();
    var next = u.origin + u.pathname + (qs ? '?' + qs : '') + u.hash;
    return next === u.href ? null : next;
  }

  var incoming = loadIncoming();
  window.__romrxUtmForward = { rewrite: rewrite, incoming: incoming };
  if (!incoming.length) return;

  function fix(a) {
    if (!a || !a.getAttribute) return;
    var next = rewrite(a.getAttribute('href'), incoming);
    if (next && a.getAttribute('href') !== next) a.setAttribute('href', next);
  }
  function fixAll(root) {
    var list = (root || document).querySelectorAll ? (root || document).querySelectorAll('a[href]') : [];
    for (var i = 0; i < list.length; i++) fix(list[i]);
  }
  function start() {
    fixAll(document);
    if (window.MutationObserver) {
      new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i];
          if (m.type === 'attributes') fix(m.target);
          else for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            if (n.tagName === 'A') fix(n);
            fixAll(n);
          }
        }
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    }
    /* Last-chance rewrite right before a click or middle-click. */
    ['mousedown', 'click', 'auxclick', 'touchstart'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (a) fix(a);
      }, true);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
