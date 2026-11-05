/* Template Auto-Sorter: Figma REST client.
   The only network calls this app makes go to https://api.figma.com, with the token the user typed.
   The token and the cached file data stay in this browser (localStorage, or sessionStorage if "remember" is off). */
(function (root) {
  'use strict';
  var API = 'https://api.figma.com/v1';
  var NS = 'tas:v1:';
  var IMG_TTL = 20 * 864e5; // Figma image URLs live up to 30 days

  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(NS + k) || 'null'); if (v === null) localStorage.removeItem(NS + k); else localStorage.setItem(NS + k, JSON.stringify(v)); } catch (e) { return null; } }

  /* ---------- token ---------- */
  function token() {
    try { return sessionStorage.getItem(NS + 'token') || localStorage.getItem(NS + 'token') || ''; } catch (e) { return ''; }
  }
  function setToken(t, remember) {
    try {
      localStorage.removeItem(NS + 'token'); sessionStorage.removeItem(NS + 'token');
      if (t) (remember ? localStorage : sessionStorage).setItem(NS + 'token', t.trim());
    } catch (e) {}
  }

  /* ---------- urls ---------- */
  // figma.com/design/:key/:name?node-id=1-2, /file/:key, /board/... , /design/:key/branch/:branchKey/...
  function parseUrl(u) {
    var s = String(u || '').trim();
    if (/^[0-9a-zA-Z]{22,128}$/.test(s)) return { key: s };
    var m = s.match(/figma\.com\/(?:design|file|proto)\/([0-9a-zA-Z]{22,128})(?:\/branch\/([0-9a-zA-Z]{22,128}))?/);
    if (!m) return null;
    var node = (s.match(/[?&]node-id=([\d]+[-:][\d]+)/) || [])[1];
    return { key: m[2] || m[1], node: node ? node.replace('-', ':') : null };
  }
  function nodeUrl(key, id) { return 'https://www.figma.com/design/' + key + '/?node-id=' + encodeURIComponent(String(id).replace(/:/g, '-')); }

  /* ---------- requests ---------- */
  function FigmaError(msg, code, wait) { var e = new Error(msg); e.code = code; e.wait = wait || 0; return e; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var listeners = [];
  function onWait(fn) { listeners.push(fn); }

  async function get(path, tries) {
    tries = tries || 0;
    var t = token();
    if (!t) throw FigmaError('Add your Figma access token first.', 'token');
    var res;
    try { res = await fetch(API + path, { headers: { 'X-Figma-Token': t } }); }
    catch (e) { throw FigmaError('Could not reach Figma. Check your connection and try again.', 'network'); }
    if (res.ok) return res.json();
    var body = {}; try { body = await res.json(); } catch (e) {}
    var msg = body.err || body.message || res.statusText;
    if (res.status === 429) {
      var wait = +(res.headers.get('Retry-After') || 0);
      if (wait && wait <= 120 && tries < 4) { listeners.forEach(function (f) { f(wait); }); await sleep(wait * 1000 + 250); return get(path, tries + 1); }
      throw FigmaError('Figma is rate-limiting this token' + (wait ? ' for about ' + humanWait(wait) : '') + '. Your sorted library stays here; thumbnails will finish later.', 'rate', wait);
    }
    if (res.status === 403) throw FigmaError(/token/i.test(msg) ? 'Figma did not accept that token. Make a new one with "File content: read" access and paste it again.' : 'This token cannot open that file. Make sure the account that owns the token can view it.', 'forbidden');
    if (res.status === 404) throw FigmaError('Figma could not find that file. Check the link.', 'notfound');
    if (res.status >= 500 && tries < 2) { await sleep(1500 * (tries + 1)); return get(path, tries + 1); }
    throw FigmaError('Figma said: ' + msg, 'http' + res.status);
  }
  function humanWait(s) { return s < 90 ? Math.ceil(s) + ' seconds' : s < 5400 ? Math.ceil(s / 60) + ' minutes' : s < 172800 ? Math.ceil(s / 3600) + ' hours' : Math.ceil(s / 86400) + ' days'; }

  /* ---------- whole file -> sorted records ---------- */
  // One /files call at depth 4 reaches page > section > email > its blocks.
  // Deeper sections (section inside section inside section) are opened with /nodes.
  async function loadFile(key, progress) {
    progress && progress('Reading the file structure');
    var file = await get('/files/' + key + '?depth=4');
    var res = TAS.collect(file, key);
    var items = res.items, pending = res.pending, rounds = 0;
    while (pending.length && rounds < 3) {
      rounds++;
      var batch = pending.splice(0, pending.length), next = [];
      for (var i = 0; i < batch.length; i += 40) {
        var part = batch.slice(i, i + 40);
        progress && progress('Opening nested sections');
        var nodes = await get('/files/' + key + '/nodes?depth=2&ids=' + encodeURIComponent(part.map(function (p) { return p.id; }).join(',')));
        part.forEach(function (p) {
          var doc = nodes.nodes && nodes.nodes[p.id] && nodes.nodes[p.id].document;
          if (!doc || !doc.children) return;
          var sub = TAS.collect({ name: file.name, document: { children: [{ name: p.ctx.page, children: [] }] } }, key);
          var ctx = Object.assign({}, p.ctx, { container: p.name });
          items = items.concat(sub.walk(doc.children, ctx));
          next = next.concat(sub.pending);
        });
      }
      pending = next;
    }
    TAS.finalize(items);
    var data = { key: key, name: file.name, lastModified: file.lastModified, thumb: file.thumbnailUrl, savedAt: Date.now(), items: items };
    store('data:' + key, data);
    return data;
  }
  function cached(key) { return store('data:' + key); }

  /* ---------- thumbnails ---------- */
  var imgCache = {};
  function imgStore(key) { return imgCache[key] || (imgCache[key] = store('img:' + key) || {}); }
  var saveT = {};
  function imgSave(key) { clearTimeout(saveT[key]); saveT[key] = setTimeout(function () { store('img:' + key, imgCache[key]); }, 400); }
  function thumbFor(key, id) { var c = imgStore(key)[id]; return c && Date.now() - c[1] < IMG_TTL ? c[0] : null; }

  var queue = {}, waiting = {}, busy = 0, blockedUntil = 0, timer = 0;
  // Ask for a thumbnail; cb(url|null) fires once it is known.
  function thumb(key, id, cb) {
    var hit = thumbFor(key, id);
    if (hit) return cb(hit);
    var k = key + '|' + id;
    (waiting[k] || (waiting[k] = [])).push(cb);
    (queue[key] || (queue[key] = [])).indexOf(id) < 0 && queue[key].push(id);
    clearTimeout(timer); timer = setTimeout(pump, 120);
  }
  function cancel(key, id) { var q = queue[key]; if (!q) return; var i = q.indexOf(id); if (i > -1) q.splice(i, 1); delete waiting[key + '|' + id]; }
  function resolve(key, id, url) { var k = key + '|' + id; (waiting[k] || []).forEach(function (f) { f(url); }); delete waiting[k]; }
  async function pump() {
    if (Date.now() < blockedUntil) { clearTimeout(timer); timer = setTimeout(pump, blockedUntil - Date.now() + 50); return; }
    var keys = Object.keys(queue).filter(function (k) { return queue[k].length; });
    while (busy < 2 && keys.length) {
      var key = keys[0], ids = queue[key].splice(0, 60);
      if (!queue[key].length) keys.shift();
      busy++; fetchBatch(key, ids).finally(function () { busy--; pump(); });
    }
  }
  async function fetchBatch(key, ids) {
    try {
      var r = await get('/images/' + key + '?scale=0.34&format=jpg&ids=' + encodeURIComponent(ids.join(',')));
      var c = imgStore(key), now = Date.now();
      ids.forEach(function (id) { var u = r.images && r.images[id]; if (u) c[id] = [u, now]; resolve(key, id, u || null); });
      imgSave(key);
    } catch (e) {
      if (e.code === 'rate') { blockedUntil = Date.now() + Math.min(e.wait || 60, 3600) * 1000; queue[key] = ids.concat(queue[key] || []); listeners.forEach(function (f) { f(e.wait || 60, e.message); }); return; }
      if (ids.length > 6) { var h = Math.ceil(ids.length / 2); await fetchBatch(key, ids.slice(0, h)); await fetchBatch(key, ids.slice(h)); return; }
      ids.forEach(function (id) { resolve(key, id, null); });
    }
  }
  // Full-size render for the viewer
  async function full(key, id) {
    var r = await get('/images/' + key + '?scale=1&format=png&ids=' + encodeURIComponent(id));
    return r.images && r.images[id];
  }

  /* ---------- the saved list of files ---------- */
  function files(v) { if (v === undefined) return store('files') || []; store('files', v); }
  function forget(key) { store('data:' + key, null); store('img:' + key, null); delete imgCache[key]; }
  function forgetAll() { files().forEach(function (f) { forget(f.key); }); store('files', null); store('seen', null); setToken(''); }

  root.FG = { token: token, setToken: setToken, parseUrl: parseUrl, nodeUrl: nodeUrl, loadFile: loadFile, cached: cached, thumb: thumb, thumbFor: thumbFor, cancel: cancel, full: full,
    files: files, forget: forget, forgetAll: forgetAll, onWait: onWait, store: store, humanWait: humanWait };
})(this);
