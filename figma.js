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

  async function get(path, tries, opt) {
    tries = tries || 0; opt = opt || {};
    var t = token();
    if (!t) throw FigmaError('Add your Figma access token first.', 'token');
    var res, ac = opt.timeout && typeof AbortController !== 'undefined' ? new AbortController() : null, tm = ac ? setTimeout(function () { ac.abort(); }, opt.timeout) : 0;
    try { res = await fetch(API + path, { headers: { 'X-Figma-Token': t }, signal: ac ? ac.signal : undefined }); }
    catch (e) { throw FigmaError(e && e.name === 'AbortError' ? 'Figma took too long to render.' : 'Could not reach Figma. Check your connection and try again.', e && e.name === 'AbortError' ? 'timeout' : 'network'); }
    finally { clearTimeout(tm); }
    if (res.ok) return res.json();
    var body = {}; try { body = await res.json(); } catch (e) {}
    var msg = body.err || body.message || res.statusText;
    if (res.status === 429) {
      var wait = +(res.headers.get('Retry-After') || 0);
      if (wait && wait <= 120 && tries < 4 && !opt.once) { listeners.forEach(function (f) { f(wait); }); await sleep(wait * 1000 + 250); return get(path, tries + 1, opt); }
      throw FigmaError('Figma is rate-limiting this token' + (wait ? ' for about ' + humanWait(wait) : '') + '. Your sorted library stays here; thumbnails will finish later.', 'rate', wait);
    }
    if (res.status === 403) throw FigmaError(/token/i.test(msg) ? 'Figma did not accept that token. Make a new one with "File content: read" access and paste it again.' : 'This token cannot open that file. Make sure the account that owns the token can view it.', 'forbidden');
    if (res.status === 404) throw FigmaError('Figma could not find that file. Check the link.', 'notfound');
    if (res.status >= 500 && tries < 2 && !opt.once) { await sleep(1500 * (tries + 1)); return get(path, tries + 1, opt); }
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
  function ck(id, scale) { return scale && scale !== 0.34 ? id + '@' + scale : id; }
  function thumbFor(key, id, scale) { var c = imgStore(key)[ck(id, scale)]; return c && Date.now() - c[1] < IMG_TTL ? c[0] : null; }

  // Figma renders image-heavy emails slowly (seconds per frame), so batches stay small, four run at once,
  // and a batch that fails is split and put back at the front instead of holding a slot.
  var queue = {}, waiting = {}, busy = 0, blockedUntil = 0, timer = 0, MAXBUSY = 4, qListeners = [], size = {};
  function left() { var n = 0; for (var q in queue) n += queue[q].length; return n; }
  function tell() { var n = left() + busy; qListeners.forEach(function (f) { f(n); }); }
  function onQueue(fn) { qListeners.push(fn); }
  // Ask for a thumbnail; cb(url|null) fires once it is known.
  // Requests are batched per file and render scale: "key|scale" -> [ids]
  function thumb(key, id, cb, scale) {
    scale = scale || 0.34;
    var hit = thumbFor(key, id, scale);
    if (hit) return cb(hit);
    var q = key + '|' + scale, k = q + '|' + id;
    (waiting[k] || (waiting[k] = [])).push(cb);
    (queue[q] || (queue[q] = [])).indexOf(id) < 0 && queue[q].push(id);
    clearTimeout(timer); timer = setTimeout(pump, 120);
  }
  function cancel(key, id, scale) { var qk = key + '|' + (scale || 0.34), q = queue[qk]; if (!q) return; var i = q.indexOf(id); if (i > -1) q.splice(i, 1); delete waiting[qk + '|' + id]; }
  function resolve(qk, id, url) { var k = qk + '|' + id; (waiting[k] || []).forEach(function (f) { f(url); }); delete waiting[k]; }
  async function pump() {
    if (Date.now() < blockedUntil) { clearTimeout(timer); timer = setTimeout(pump, blockedUntil - Date.now() + 50); return; }
    var keys = Object.keys(queue).filter(function (k) { return queue[k].length; });
    while (busy < MAXBUSY && keys.length) {
      var key = keys[0], ids = queue[key].splice(0, size[key] || (+key.split('|')[1] === 0.34 ? 8 : 24));
      if (!queue[key].length) keys.shift();
      busy++; fetchBatch(key, ids).finally(function () { busy--; tell(); pump(); });
    }
    tell();
  }
  async function fetchBatch(qk, ids) {
    var key = qk.split('|')[0], scale = +qk.split('|')[1] || 0.34;
    try {
      // parts can be transparent, so they render as PNG; emails as smaller JPGs
      var r = await get('/images/' + key + '?scale=' + scale + '&format=' + (scale === 0.34 ? 'jpg' : 'png') + '&ids=' + encodeURIComponent(ids.join(',')), 0, { timeout: 120000, once: true });
      var c = imgStore(key), now = Date.now();
      ids.forEach(function (id) { var u = r.images && r.images[id]; if (u) c[ck(id, scale)] = [u, now]; resolve(qk, id, u || null); });
      imgSave(key);
    } catch (e) {
      if (e.code === 'rate') { blockedUntil = Date.now() + Math.min(e.wait || 60, 3600) * 1000; queue[qk] = ids.concat(queue[qk] || []); listeners.forEach(function (f) { f(e.wait || 60, e.message); }); return; }
      if (ids.length > 1) { size[qk] = Math.ceil(ids.length / 2); queue[qk] = ids.concat(queue[qk] || []); return; } // retry in smaller batches
      ids.forEach(function (id) { resolve(qk, id, null); });
    }
  }
  // Full-size render for the viewer
  async function full(key, id, scale) {
    var r = await get('/images/' + key + '?scale=' + (scale || 1) + '&format=png&ids=' + encodeURIComponent(id));
    return r.images && r.images[id];
  }

  /* ---------- atomize: read every email's layers and break it into parts ---------- */
  // 10 emails per /nodes call (a call is ~6 MB for image-heavy emails), two at a time.
  // Each batch is atomized and dropped right away, so memory stays flat.
  async function atomizeFile(data, progress) {
    var emails = data.items.filter(function (x) { return x.kind !== 'part'; }), raw = [], done = 0, i = 0;
    async function worker() {
      while (i < emails.length) {
        var batch = emails.slice(i, i + 10); i += 10;
        var r = await get('/files/' + data.key + '/nodes?depth=4&ids=' + encodeURIComponent(batch.map(function (e) { return e.id; }).join(',')));
        batch.forEach(function (e) {
          var doc = r.nodes && r.nodes[e.id] && r.nodes[e.id].document;
          if (doc) raw = raw.concat(TAS.atomize(doc, { file: data.key, fileName: data.name, brand: e.brand, title: e.title, id: e.id }));
        });
        done += batch.length; progress && progress(done, emails.length);
      }
    }
    await Promise.all([worker(), worker()]);
    var parts = TAS.dedupe(raw);
    var out = { key: data.key, savedAt: Date.now(), emails: emails.length, found: raw.length, parts: parts };
    await idb.set('atoms:' + data.key, out);
    return out;
  }
  // a tiny IndexedDB key-value store: atomized libraries are too big for localStorage
  var idb = (function () {
    var dbp = null;
    function db() { return dbp || (dbp = new Promise(function (res, rej) { var r = indexedDB.open('tas', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; })); }
    function tx(mode, fn) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
    return { get: function (k) { return tx('readonly', function (s) { return s.get(k); }).catch(function () { return null; }); },
      set: function (k, v) { return tx('readwrite', function (s) { s.put(v, k); }).catch(function () {}); },
      del: function (k) { return tx('readwrite', function (s) { s.delete(k); }).catch(function () {}); } };
  })();
  function atoms(key) { return idb.get('atoms:' + key); }

  /* ---------- the saved list of files ---------- */
  function files(v) { if (v === undefined) return store('files') || []; store('files', v); }
  function forget(key) { store('data:' + key, null); store('img:' + key, null); delete imgCache[key]; idb.del('atoms:' + key); }
  function forgetAll() { files().forEach(function (f) { forget(f.key); }); store('files', null); store('seen', null); setToken(''); }

  root.FG = { token: token, setToken: setToken, parseUrl: parseUrl, nodeUrl: nodeUrl, loadFile: loadFile, cached: cached, thumb: thumb, thumbFor: thumbFor, cancel: cancel, full: full,
    files: files, forget: forget, forgetAll: forgetAll, onWait: onWait, onQueue: onQueue, atomizeFile: atomizeFile, atoms: atoms, store: store, humanWait: humanWait };
})(this);
