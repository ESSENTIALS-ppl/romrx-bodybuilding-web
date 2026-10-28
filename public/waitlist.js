/* ROMRxBodyBuilding waitlist sign-up (static pages).
 * ONE config for every static page on this site. The React app has its own copy in src/lib/waitlist.ts.
 * Contract (Avery, final): POST JSON {name, email, site, role, consent:true, hp_website} to WAITLIST_URL
 * (CONTRACT.md). hp_website is the hidden honeypot field: always sent, '' for real people. 429 = rate limited.
 * Any 2xx = success (duplicates also 2xx {ok:true}). Anything else, or a network error = error.
 * No apikey / Authorization header is sent. */
(function () {
  'use strict';
  var WAITLIST_URL = 'https://cqzvqzwwevnflinxgnpp.supabase.co/functions/v1/join-waitlist';
  var WAITLIST_SITE = 'bb';
  var CONSENT_LEAD = "We'll email you once to confirm, and again when coach tools open. Unsubscribe anytime. See our ";
  var CONSENT_LINK_TEXT = 'Privacy Policy';
  var CONSENT_LINK_URL = 'https://romrx.io/legal';
  var MSG_OK = "You're on the list. We'll email you to confirm.";
  var MSG_RATE = 'Too many tries. Please try again later.';
  var MSG_ERR = 'Something went wrong. Please try again, or email hello@romrx.io.';
  var MSG_NAME = 'Please enter your name.';
  var MSG_EMAIL = 'Please enter a valid email address.';
  var TIMEOUT_MS = 15000;

  function show(el, text) {
    if (!el) return;
    if (text) el.textContent = text;
    el.hidden = false;
    el.style.display = 'block';
  }
  function hide(el) {
    if (!el) return;
    el.hidden = true;
    el.style.display = 'none';
  }
  function validEmail(v) {
    return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  }

  function renderConsent(slot) {
    slot.textContent = CONSENT_LEAD;
    var a = document.createElement('a');
    a.href = CONSENT_LINK_URL;
    a.textContent = CONSENT_LINK_TEXT;
    var st = slot.getAttribute('data-link-style');
    if (st) a.setAttribute('style', st);
    slot.appendChild(a);
    slot.appendChild(document.createTextNode('.'));
  }

  function wire(form) {
    var nameEl = form.querySelector('[name="name"]');
    var emailEl = form.querySelector('[name="email"]');
    var roleEl = form.querySelector('[name="role"]');
    var hpEl = form.querySelector('[name="hp_website"]');
    var btn = form.querySelector('button[type="submit"]');
    var scope = form.parentNode;
    var okEl = scope.querySelector('[data-waitlist-success]');
    var errEl = scope.querySelector('[data-waitlist-error]');
    var busy = false;

    form.setAttribute('novalidate', 'novalidate');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;
      hide(errEl);
      var name = (nameEl.value || '').trim();
      var email = (emailEl.value || '').trim();
      if (!name || name.length > 100) { show(errEl, MSG_NAME); nameEl.focus(); return; }
      if (!validEmail(email)) { show(errEl, MSG_EMAIL); emailEl.focus(); return; }
      busy = true;
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Sending...';
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT_MS) : null;
      fetch(WAITLIST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name,
          email: email,
          site: WAITLIST_SITE,
          role: roleEl.value,
          consent: true,
          hp_website: hpEl ? hpEl.value : ''
        }),
        signal: ctl ? ctl.signal : undefined
      }).then(function (res) {
        if (res.status >= 200 && res.status < 300) {
          form.style.display = 'none';
          show(okEl, MSG_OK_FOR(okEl));
        } else if (res.status === 429) {
          show(errEl, MSG_RATE);
        } else {
          show(errEl, MSG_ERR);
        }
      }).catch(function () {
        show(errEl, MSG_ERR);
      }).then(function () {
        if (timer) clearTimeout(timer);
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      });
    });
  }
  // Keep the page's own success wording when it has one; otherwise use the shared message.
  function MSG_OK_FOR(el) { return el && el.textContent.trim() ? null : MSG_OK; }

  function init() {
    var slots = document.querySelectorAll('[data-waitlist-consent]');
    for (var i = 0; i < slots.length; i++) renderConsent(slots[i]);
    var forms = document.querySelectorAll('form[data-waitlist-form]');
    for (var j = 0; j < forms.length; j++) wire(forms[j]);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
