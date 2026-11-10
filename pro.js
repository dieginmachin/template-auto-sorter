/* Auto-Sorter Pro: a key unlocks Pro in this browser.
   Only SHA-256 hashes of the keys live here; the keys are in the receipt email and the access page.
   An honour-system lock for a $29 tool: nothing is sent anywhere, the app stays static. */
(function () {
  'use strict';
  var BUY = 'https://halloftemplates.com/sorter-pro';   // ClickFunnels Pro sales page
  var HASHES = [
    'cdb0ff681ff8fd6c54833e8a4331c7ff4755698b06063f7ef1ecfb6e6d29a639', // pro_buyers
    '07400f366507da30310b7db8f0b5cd54e8c700d162b0567809ae7328a6ab05c0', // atomic_emails_bump
    '5a24bc826d9fbe3d06d119596b0cb55c6240f924fbeda8eda53c8a2b7cf9fc25'  // studio
  ];
  var LS = 'tas:v1:pro';
  var WHY = {
    files: 'Free sorts one file at a time. Pro puts every template file you own on the same canvas.',
    parts: 'The parts library is part of Pro: every atom, molecule and organism in your files, sorted by level and type.',
    atomize: 'Atomize is part of Pro. It breaks every email into organisms, molecules and atoms, and counts how many emails reuse each part.',
    plan: '', connect: ''
  };
  var subs = [], on = false;
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  async function sha(s) {
    var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('tas-pro:' + s));
    return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function norm(k) { return String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(HOT)(SORT)(\w{4})(\w{4})$/, '$1-$2-$3-$4'); }
  function flip(v) { on = v; subs.forEach(function (f) { f(on); }); paint(); }
  async function unlock(k) {
    var h = await sha(norm(k));
    if (HASHES.indexOf(h) < 0) return false;
    set(LS, h); flip(true); return true;
  }
  var $ = function (s) { return document.querySelector(s); };
  var sheet = $('#pro');
  function paint() {
    document.documentElement.classList.toggle('is-pro', on);
    Array.prototype.forEach.call(document.querySelectorAll('[data-pro]'), function (b) {
      if (b.classList.contains('chip')) { b.classList.toggle('is-pro', on); b.lastChild.textContent = on ? 'Pro is on' : 'Pro'; }
    });
    var plan = $('#cPlan'); if (plan) plan.firstElementChild.innerHTML = on ? '<b>Pro</b> · every file · parts · atomize' : '<b>Free</b> · 1 file · every email sorted';
    if (sheet) { $('#proOk').hidden = !on; $('#proKey').hidden = on; $('#proBuy').hidden = on; }
  }
  function open(why) {
    if (!sheet) return;
    $('#proWhy').textContent = WHY[why] != null ? WHY[why] : (why || '');
    $('#proErr').hidden = true; sheet.hidden = false; paint();
    if (!on) setTimeout(function () { $('#proIn').focus(); }, 60);
  }
  function close() { if (sheet) sheet.hidden = true; }
  window.PRO = {
    get on() { return on; },
    open: open, close: close, unlock: unlock,
    onChange: function (f) { subs.push(f); },
    gate: function (why) { if (on) return true; open(why); return false; }
  };
  if (sheet) {
    $('#proBuy').href = BUY;
    $('#proX').addEventListener('click', close);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) close(); });
    addEventListener('keydown', function (e) { if (!sheet.hidden && e.key === 'Escape') close(); });
    $('#proKey').addEventListener('submit', async function (e) {
      e.preventDefault(); var err = $('#proErr'); err.hidden = true;
      var ok = await unlock($('#proIn').value);
      if (!ok) { err.textContent = 'That key does not match. Copy it from your receipt email (it starts with HOT-SORT).'; err.hidden = false; return; }
      $('#proIn').value = ''; setTimeout(close, 1400);
    });
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-pro]'); if (b && !(on && b.classList.contains('chip'))) open(b.dataset.pro); });
  // stored unlock, or a one-click link from the access page: …/#pro=HOT-SORT-XXXX-XXXX (the hash never reaches a server)
  var saved = get(LS);
  on = !!saved && HASHES.indexOf(saved) >= 0;
  paint();
  var m = location.hash.match(/pro=([\w-]+)/i);
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    unlock(decodeURIComponent(m[1])).then(function (ok) { open(ok ? '' : 'That Pro link did not match. Paste the key from your receipt email.'); });
  }
})();
