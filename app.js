/* Template Auto-Sorter: UI.
   The library canvas follows Diego's portfolio template library: drag, zoom, group-by dock,
   chips that fly to a group, hover links between related designs, minimap, "Surprise me", discovered meter. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeIO = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var hsh = function (i, s) { var x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };

  /* =========================================================
     CONNECT
     ========================================================= */
  var connect = $('#connect'), form = $('#cform'), cErr = $('#cErr'), cProg = $('#cProg'), cProgT = $('#cProgT'), cGo = $('#cGo');
  function showErr(el, msg) { el.textContent = msg || ''; el.hidden = !msg; }
  $('#cEye').addEventListener('click', function () { var i = $('#cTok'), s = i.type === 'password'; i.type = s ? 'text' : 'password'; this.textContent = s ? 'Hide' : 'Show'; this.setAttribute('aria-label', s ? 'Hide token' : 'Show token'); });
  $('#cHow').addEventListener('click', function () { var b = $('#howBox'); b.hidden = !b.hidden; });
  $('#cForget').addEventListener('click', forgetAll);

  function showConnect(prefill) {
    lib.close(); connect.hidden = false; document.body.classList.remove('locked');
    var files = FG.files();
    $('#cUrl').value = prefill != null ? prefill : files.map(function (f) { return f.url; }).join('\n');
    $('#cForget').hidden = !(FG.token() || files.length);
    setBusy(false);
  }
  function setBusy(b, t) { cGo.disabled = b; cProg.hidden = !b; if (t) cProgT.textContent = t; }

  form.addEventListener('submit', async function (e) {
    e.preventDefault(); showErr(cErr);
    var lines = $('#cUrl').value.split(/[\s,]+/).filter(Boolean);
    var tok = $('#cTok').value.trim() || FG.token();
    if (!lines.length) return showErr(cErr, 'Paste the link to your Figma file first.');
    var parsed = [], bad = [];
    lines.forEach(function (l) { var p = FG.parseUrl(l); if (p) { if (!parsed.some(function (x) { return x.key === p.key; })) parsed.push({ key: p.key, url: l }); } else bad.push(l); });
    if (bad.length) return showErr(cErr, 'That does not look like a Figma file link: ' + bad[0].slice(0, 80) + '. Copy it from the browser bar or Share → Copy link.');
    if (!tok) return showErr(cErr, 'Paste your Figma personal access token. It starts with "figd_".');
    FG.setToken(tok, $('#cRem').checked);
    try {
      var sets = await loadAll(parsed, function (t) { setBusy(true, t); });
      FG.files(parsed.map(function (p, i) { return { key: p.key, url: p.url, name: sets[i].name }; }));
      $('#cTok').value = '';
      openLibrary(sets);
    } catch (err) {
      setBusy(false); showErr(cErr, err.message || String(err));
      if (err.code === 'forbidden' && /token/i.test(err.message)) FG.setToken('');
    }
  });

  async function loadAll(list, progress) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var pre = list.length > 1 ? 'File ' + (i + 1) + ' of ' + list.length + ': ' : '';
      var data = await FG.loadFile(list[i].key, function (t) { progress(pre + t + '…'); });
      out.push(data);
    }
    var empty = out.filter(function (d) { return !d.items.length; });
    if (empty.length === out.length) throw Object.assign(new Error('No email-sized frames found in ' + empty.map(function (d) { return '"' + d.name + '"'; }).join(', ') + '. The sorter looks for frames 320–900px wide that are taller than they are wide.'), { code: 'empty' });
    if (empty.length) setTimeout(function () { note('No email-sized frames in ' + empty.map(function (d) { return '"' + d.name + '"'; }).join(', ') + '. The other files are sorted.'); }, 1800);
    return out;
  }

  function forgetAll() {
    if (!confirm('Remove your token, files and cached thumbnails from this browser?')) return;
    FG.forgetAll(); seen = {}; panel.hidden = true; showConnect('');
  }

  /* =========================================================
     THE LIBRARY
     ========================================================= */
  var root = $('#lib'), view = $('#libView'), world = $('#libWorld'), lk = $('#libLinks'), lc = lk.getContext('2d'), mini = $('#libMini'), mc = mini.getContext('2d');
  var CW = 200, CH = Math.round(CW * 4 / 3) + 46, PX = 244, PY = CH + 70;
  var GROUPS = [['all', 'All'], ['brand', 'Brand'], ['type', 'Type'], ['category', 'Category'], ['signature', 'Section'], ['lang', 'Language'], ['year', 'Year'], ['length', 'Length'], ['fileName', 'File']];
  var LABEL = { brand: 'Brand', type: 'Type', category: 'Category', signature: 'Signature section', lang: 'Language', year: 'Year', length: 'Length', fileName: 'File' };
  var A = [], V = [], N = 0, els = [], lay = null, TW = 1, TH = 1, group = 'brand', cam = { x: 0, y: 0, z: 1 }, zmin = .08, zmax = 2.6, vw = 0, vh = 0, isOpen = false, introduced = false;
  var seen = FG.store('seen') || {};
  var F = { q: '', type: {}, sec: {}, brand: {} };
  var io = null;

  function sid(a) { return a.file + '|' + a.id; }

  function setData(sets) {
    A = []; sets.forEach(function (d) { A = A.concat(d.items); });
    TAS.mergeBrands(A); // the same brand spelled two ways in two files
    A.sort(function (a, b) { return a.brand.localeCompare(b.brand) || b.date - a.date || a.title.localeCompare(b.title); });
    N = A.length;
    GROUPS.forEach(function (g) { var b = $('[data-g="' + g[0] + '"]', seg); if (b) b.hidden = g[0] === 'fileName' && sets.length < 2; });
    if (group === 'fileName' && sets.length < 2) group = 'brand';
    $('#libName').textContent = sets.length === 1 ? sets[0].name : 'Template Library';
    $('#libSub').textContent = plural(N, 'template') + ' · ' + plural(sets.length, 'file');
    build(); buildFilters(); applyFilter(false); introduced = false;
  }

  function build() {
    if (io) io.disconnect();
    world.innerHTML = '';
    var frag = document.createDocumentFragment();
    els = A.map(function (a, i) {
      var d = document.createElement('div'); d.className = 'lc' + (seen[sid(a)] ? ' seen' : ''); d.dataset.i = i;
      d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-label', a.title + ', ' + a.brand + ', ' + a.category);
      d.innerHTML = '<div class="lc-in"><div class="lc-img"><img alt="" draggable="false" decoding="async"><div class="ph"><span>' + esc(a.category) + '</span><b>' + esc(a.title) + '</b></div></div>' +
        '<div class="lc-meta"><span>' + esc(a.brand) + '</span><span class="' + (a.type === 'Flow' ? 'fl' : '') + '">' + (a.type === 'Flow' ? 'Flow' : esc(a.year === 'Undated' ? 'Campaign' : a.year)) + '</span></div>' +
        '<div class="lc-t">' + esc(a.title) + '</div><i class="lc-dot"></i></div>';
      frag.appendChild(d); return d;
    });
    world.appendChild(frag);
    io = new IntersectionObserver(onSee, { root: root, rootMargin: '500px' });
    els.forEach(function (el) { io.observe(el); });
  }

  /* thumbnails load as cards come near the viewport */
  function onSee(entries) {
    entries.forEach(function (en) {
      var el = en.target, i = +el.dataset.i, a = A[i], img = el.querySelector('img');
      if (img.dataset.st === 'ok' || img.dataset.st === 'none') return;
      if (en.isIntersecting) {
        if (img.dataset.st === 'q') return;
        img.dataset.st = 'q'; el.querySelector('.ph').classList.add('load');
        FG.thumb(a.file, a.id, function (url) {
          var ph = el.querySelector('.ph'); ph.classList.remove('load');
          if (!url) { img.dataset.st = 'none'; return; }
          img.onload = function () { img.classList.add('ok'); img.dataset.st = 'ok'; };
          img.onerror = function () { img.dataset.st = ''; };
          img.src = url;
        });
      } else if (img.dataset.st === 'q') { FG.cancel(a.file, a.id); img.dataset.st = ''; el.querySelector('.ph').classList.remove('load'); }
    });
  }

  /* ---------- filters ---------- */
  var fType = $('#fType'), fSec = $('#fSec'), fBrand = $('#fBrand');
  function counts(key, multi) { var m = {}; A.forEach(function (a) { (multi ? a[key] : [a[key]]).forEach(function (v) { m[v] = (m[v] || 0) + 1; }); }); return m; }
  function chipSet(box, map, store, order) {
    box.innerHTML = '';
    var keys = Object.keys(map); keys.sort(order || function (a, b) { return map[b] - map[a] || a.localeCompare(b); });
    keys.forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = esc(k) + '<em>' + map[k] + '</em>'; b.setAttribute('aria-pressed', !!store[k]);
      b.addEventListener('click', function () { if (store[k]) delete store[k]; else store[k] = 1; b.setAttribute('aria-pressed', !!store[k]); applyFilter(true); });
      box.appendChild(b);
    });
  }
  function buildFilters() {
    F.type = {}; F.sec = {}; F.brand = {};
    chipSet(fType, counts('type'), F.type);
    var secOrder = TAS.SECTIONS;
    chipSet(fSec, counts('sections', true), F.sec, function (a, b) { return secOrder.indexOf(a) - secOrder.indexOf(b); });
    chipSet(fBrand, counts('brand'), F.brand);
  }
  function match(a) {
    if (F.q) { var hay = (a.name + ' ' + a.brand + ' ' + a.category + ' ' + a.sections.join(' ') + ' ' + a.lang).toLowerCase(); if (F.q.split(/\s+/).some(function (w) { return hay.indexOf(w) < 0; })) return false; }
    if (Object.keys(F.type).length && !F.type[a.type]) return false;
    if (Object.keys(F.brand).length && !F.brand[a.brand]) return false;
    for (var s in F.sec) if (a.sections.indexOf(s) < 0) return false;
    return true;
  }
  function applyFilter(animate) {
    V = []; A.forEach(function (a, i) { var ok = match(a); els[i].classList.toggle('off', !ok); if (ok) V.push(i); });
    var nf = Object.keys(F.type).length + Object.keys(F.sec).length + Object.keys(F.brand).length;
    $('#libFN').hidden = !nf; $('#libFN').textContent = nf;
    $('#fCount').textContent = V.length === N ? 'Showing all ' + N : 'Showing ' + V.length + ' of ' + N;
    $('#libEmpty').hidden = V.length > 0;
    clearHover(); layout(group); place(animate); renderChips(); score();
    if (isOpen) setTimeout(fit, animate ? 60 : 0);
  }
  var qT = 0;
  $('#libQ').addEventListener('input', function () { var v = this.value.trim().toLowerCase(); clearTimeout(qT); qT = setTimeout(function () { F.q = v; applyFilter(true); }, 180); });
  $('#libQ').addEventListener('keydown', function (e) { if (e.key === 'Escape') { this.value = ''; F.q = ''; applyFilter(true); this.blur(); } });
  var fb = $('#libFilterB'), fp = $('#libFilter');
  fb.addEventListener('click', function () { fp.hidden = !fp.hidden; fb.setAttribute('aria-expanded', !fp.hidden); });
  $('#fClear').addEventListener('click', function () { F.type = {}; F.sec = {}; F.brand = {}; $$('.fchips button', fp).forEach(function (b) { b.setAttribute('aria-pressed', false); }); applyFilter(true); });
  document.addEventListener('pointerdown', function (e) { if (!fp.hidden && !e.target.closest('#libFilter,#libFilterB')) { fp.hidden = true; fb.setAttribute('aria-expanded', false); } });

  /* ---------- layout ---------- */
  var ORDER = {
    year: function (a, b) { return a.v === 'Undated' ? 1 : b.v === 'Undated' ? -1 : b.v.localeCompare(a.v); },
    length: function (a, b) { return ['Short', 'Medium', 'Long'].indexOf(a.v) - ['Short', 'Medium', 'Long'].indexOf(b.v); },
    type: function (a, b) { return a.v === 'Campaign' ? -1 : 1; }
  };
  function layout(g) {
    var pos = [], labels = [];
    if (g === 'all') {
      var n = V.length, cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.25)));
      V.forEach(function (i, k) { var c = k % cols, r = Math.floor(k / cols); pos[i] = { x: c * PX + (hsh(k, 3) - .5) * 34, y: r * PY + (c % 2 ? PY * .38 : 0) + (hsh(k, 9) - .5) * 34 }; });
      TW = cols * PX + 110; TH = Math.ceil(n / cols) * PY + PY * .38 + 90;
    } else {
      var m = {}; V.forEach(function (i) { var v = A[i][g]; (m[v] || (m[v] = [])).push(i); });
      var arr = Object.keys(m).map(function (v) { return { v: v, ids: m[v] }; });
      arr.sort(ORDER[g] || function (a, b) { return b.ids.length - a.ids.length || a.v.localeCompare(b.v); });
      arr.forEach(function (gv) { gv.ids.sort(function (x, y) { return A[y].date - A[x].date || A[x].brand.localeCompare(A[y].brand); }); });
      var area = 0; arr.forEach(function (gv) { var n = gv.ids.length, cc = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.3)))); area += (cc * PX + 150) * (Math.ceil(n / cc) * PY + 214); });
      var maxW = Math.max(PX * 7, Math.sqrt(area * 1.7)), G = 150, x = 0, y = 0, rowH = 0, wMax = 0;
      arr.forEach(function (gv) {
        var n = gv.ids.length, cc = Math.min(n, Math.max(1, Math.ceil(Math.sqrt(n * 1.3)))), rr = Math.ceil(n / cc), w = cc * PX - (PX - CW), h = rr * PY - (PY - CH) + 64;
        if (x > 0 && x + w > maxW) { x = 0; y += rowH + G; rowH = 0; }
        labels.push({ x: x, y: y, w: w, h: h, t: gv.v, n: n });
        gv.ids.forEach(function (id, k) { pos[id] = { x: x + (k % cc) * PX, y: y + 64 + Math.floor(k / cc) * PY }; });
        x += w + G; wMax = Math.max(wMax, x); rowH = Math.max(rowH, h);
      });
      TW = Math.max(wMax + 40, 400); TH = y + rowH + G + 40;
    }
    lay = { pos: pos, labels: labels }; measure();
  }
  function place(animate) {
    world.classList.toggle('anim', !!animate && !RM);
    $$('.lcl', world).forEach(function (n) { n.remove(); });
    var frag = document.createDocumentFragment();
    V.forEach(function (i) { var p = lay.pos[i]; els[i].style.left = p.x + 'px'; els[i].style.top = p.y + 'px'; });
    lay.labels.forEach(function (L, li) {
      var d = document.createElement('div'); d.className = 'lcl'; d.dataset.l = li;
      d.style.left = (L.x - 22) + 'px'; d.style.top = (L.y - 18) + 'px'; d.style.width = (L.w + 44) + 'px'; d.style.height = (L.h + 36) + 'px';
      d.innerHTML = '<span><b>' + esc(L.t) + '</b><em>' + L.n + '</em></span>'; frag.appendChild(d);
    });
    world.insertBefore(frag, world.firstChild);
    if (animate) setTimeout(function () { world.classList.remove('anim'); }, 1000);
  }
  var ox0 = 0, oy0 = 0;
  function relPos() { var r = root.getBoundingClientRect(); ox0 = r.left; oy0 = r.top; return r; }
  function measure() { var r = relPos(); vw = r.width || innerWidth; vh = r.height || innerHeight; lk.width = vw * DPR; lk.height = vh * DPR; lc.setTransform(DPR, 0, 0, DPR, 0, 0); zmin = clamp(Math.min(vw / (TW * 1.3), vh / (TH * 1.3)), .03, .4); }
  var zl = $('#libZ');
  function apply() {
    cam.x = clamp(cam.x, -TW * .25, TW * 1.25); cam.y = clamp(cam.y, -TH * .25, TH * 1.25);
    var z = cam.z, ox = vw / 2 - cam.x * z, oy = vh / 2 - cam.y * z;
    world.style.transform = 'translate(' + ox.toFixed(2) + 'px,' + oy.toFixed(2) + 'px) scale(' + z.toFixed(4) + ')';
    view.style.backgroundSize = (24 * z) + 'px ' + (24 * z) + 'px'; view.style.backgroundPosition = ox + 'px ' + oy + 'px';
    zl.textContent = Math.round(z * 100) + '%'; world.style.setProperty('--iz', Math.min(14, 1 / z).toFixed(3)); dirty = true;
  }
  function zoomAt(sx, sy, f) { var z2 = clamp(cam.z * f, zmin, zmax); cam.x += (sx - vw / 2) / cam.z - (sx - vw / 2) / z2; cam.y += (sy - vh / 2) / cam.z - (sy - vh / 2) / z2; cam.z = z2; apply(); }
  var flying = null, vel = { x: 0, y: 0 }, dirty = true;
  function fly(x, y, z, d) {
    var s = { x: cam.x, y: cam.y, z: cam.z }, dx = x - s.x, dy = y - s.y; z = clamp(z, zmin, zmax);
    var far = Math.hypot(dx, dy) * s.z > vw * 1.2, t0 = performance.now(); d = RM ? 1 : (d || (far ? 1300 : 850)); vel = { x: 0, y: 0 };
    flying = function (now) {
      var k = clamp((now - t0) / d, 0, 1), e = easeIO(k), dip = far ? Math.sin(Math.PI * k) * .45 : 0;
      cam.x = s.x + dx * e; cam.y = s.y + dy * e; cam.z = clamp(Math.exp(lerp(Math.log(s.z), Math.log(z), e)) * (1 - dip), zmin, zmax); apply(); if (k >= 1) flying = null;
    };
  }
  function fitZ(w, h) { return clamp(Math.min(vw / (w + 160), (vh - 200) / (h + 160)), zmin, 1.4); }
  function fit() { fly(TW / 2, TH / 2, fitZ(TW, TH)); }

  /* ---------- pointer: drag, pinch, inertia, hover ---------- */
  var ptrs = {}, drag = null, moved = 0, pinch = null, hint = $('#libHint');
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = 'Drag to move · Pinch to zoom · Tap to open';
  function hideHint() { if (hint && !hint.classList.contains('gone')) hint.classList.add('gone'); }
  view.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return; try { view.setPointerCapture(e.pointerId); } catch (x) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; var ids = Object.keys(ptrs); flying = null;
    if (ids.length === 1) { drag = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0; vel = { x: 0, y: 0 }; }
    else if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; drag = null; }
  });
  view.addEventListener('pointermove', function (e) {
    if (ptrs[e.pointerId]) ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (pinch && ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1; relPos(); zoomAt((a.x + b.x) / 2 - ox0, (a.y + b.y) / 2 - oy0, d / pinch.d); pinch.d = d; hideHint(); return; }
    if (drag) {
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now(), dt = Math.max(1, now - drag.t); moved += Math.abs(dx) + Math.abs(dy);
      cam.x -= dx / cam.z; cam.y -= dy / cam.z; vel = { x: dx / dt, y: dy / dt }; drag.x = e.clientX; drag.y = e.clientY; drag.t = now; apply();
      if (moved > 6) { root.classList.add('dragging'); hideHint(); } return;
    }
    if (e.pointerType !== 'touch') { relPos(); hover(e.clientX - ox0, e.clientY - oy0); }
  });
  function up(e) {
    var wasDrag = drag && moved > 6, tap = drag && moved <= 6; delete ptrs[e.pointerId];
    if (Object.keys(ptrs).length < 2) pinch = null;
    if (tap && e.type === 'pointerup') { var el = document.elementFromPoint(e.clientX, e.clientY), card = el && el.closest('.lc'); if (card) openCard(+card.dataset.i); }
    if (!wasDrag) vel = { x: 0, y: 0 }; drag = null; root.classList.remove('dragging');
  }
  view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  view.addEventListener('pointerleave', function () { if (!drag) clearHover(); });
  view.addEventListener('wheel', function (e) {
    e.preventDefault(); flying = null; vel = { x: 0, y: 0 }; relPos();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - ox0, e.clientY - oy0, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0045)));
    else { var m = e.deltaMode ? 24 : 1; cam.x += e.deltaX * m / cam.z; cam.y += e.deltaY * m / cam.z; apply(); }
    hideHint(); hover(e.clientX - ox0, e.clientY - oy0);
  }, { passive: false });
  // keyboard focus on a card: keep the page from scrolling and fly to it
  world.addEventListener('focusin', function (e) { var c = e.target.closest('.lc'); if (!c || !c.matches(':focus-visible')) return; root.scrollTop = 0; root.scrollLeft = 0; var p = lay.pos[+c.dataset.i]; if (p) fly(p.x + CW / 2, p.y + CH / 2, Math.max(cam.z, .8), 500); });
  world.addEventListener('keydown', function (e) { var c = e.target.closest('.lc'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(+c.dataset.i); } });

  var aff = [], hovI = -1, hovT = 0, rel = [], lastPt = null;
  function clearHover() { aff.forEach(function (el) { el.firstChild.style.transform = ''; el.classList.remove('hot'); }); aff = []; setHov(-1); }
  function hover(sx, sy) {
    lastPt = [sx, sy]; if (!lay) return;
    var wx = cam.x + (sx - vw / 2) / cam.z, wy = cam.y + (sy - vh / 2) / cam.z, R = 280, next = [], best = -1;
    for (var k = 0; k < V.length; k++) {
      var i = V[k], p = lay.pos[i], dx = wx - (p.x + CW / 2), dy = wy - (p.y + CH / 2);
      if (Math.abs(dx) > R || Math.abs(dy) > R) continue;
      var d = Math.hypot(dx, dy); if (d > R) continue;
      var el = els[i], f = 1 - d / R; next.push(el);
      if (Math.abs(dx) < CW / 2 && Math.abs(dy) < CH / 2) {
        best = i; el.classList.add('hot');
        el.firstChild.style.transform = 'perspective(800px) rotateX(' + (-dy / CH * 12).toFixed(2) + 'deg) rotateY(' + (dx / CW * 14).toFixed(2) + 'deg) scale(1.08)';
      } else { var push = f * f * 18; el.classList.remove('hot'); el.firstChild.style.transform = 'translate(' + (-dx / (d || 1) * push).toFixed(1) + 'px,' + (-dy / (d || 1) * push).toFixed(1) + 'px) scale(' + (1 + f * .025).toFixed(3) + ')'; }
    }
    aff.forEach(function (el) { if (next.indexOf(el) < 0) { el.firstChild.style.transform = ''; el.classList.remove('hot'); } }); aff = next;
    setHov(best);
  }
  function key() { return group === 'all' ? 'brand' : group; }
  function setHov(i) {
    if (i === hovI) return; hovI = i; hovT = performance.now();
    rel.forEach(function (r) { r.classList.remove('rel'); }); rel = [];
    if (i >= 0) { var k = key(), v = A[i][k]; V.forEach(function (j) { if (j !== i && A[j][k] === v) { els[j].classList.add('rel'); rel.push(els[j]); } }); }
    dirty = true;
  }
  function centerOf(el) { var r = el.getBoundingClientRect(); return [r.left - ox0 + r.width / 2, r.top - oy0 + r.height / 2]; }
  function drawLinks() {
    lc.clearRect(0, 0, vw, vh); if (hovI < 0) return;
    var a = centerOf(els[hovI]), k = key(), v = A[hovI][k], cnt = 0;
    lc.lineWidth = 1.2; lc.setLineDash([4, 5]); lc.strokeStyle = 'rgba(23,144,79,.7)'; lc.fillStyle = '#17904f';
    V.forEach(function (j) {
      if (j === hovI || A[j][k] !== v) return; cnt++;
      var p = lay.pos[j], z = cam.z, bx = vw / 2 + (p.x + CW / 2 - cam.x) * z, by = vh / 2 + (p.y + CH / 2 - cam.y) * z;
      if (bx < -200 || by < -200 || bx > vw + 200 || by > vh + 200) return;
      var mx = (a[0] + bx) / 2, my = (a[1] + by) / 2 - Math.hypot(bx - a[0], by - a[1]) * .18;
      lc.beginPath(); lc.moveTo(a[0], a[1]); lc.quadraticCurveTo(mx, my, bx, by); lc.stroke();
      lc.beginPath(); lc.arc(bx, by, 3.5, 0, 6.283); lc.fill();
    });
    lc.setLineDash([]); lc.beginPath(); lc.arc(a[0], a[1], 4.5, 0, 6.283); lc.fill();
    var txt = (LABEL[k] + ' · ' + v + ' · ' + (cnt + 1)).toUpperCase();
    lc.font = '700 10.5px Figtree, system-ui, sans-serif'; var tw = lc.measureText(txt).width + 16, r = els[hovI].getBoundingClientRect(), tx = clamp(r.left - ox0, 8, vw - tw - 8), ty = Math.max(8, r.top - oy0 - 30);
    lc.fillStyle = '#17904f'; lc.beginPath(); if (lc.roundRect) lc.roundRect(tx, ty, tw, 20, 4); else lc.rect(tx, ty, tw, 20); lc.fill(); lc.fillStyle = '#fff'; lc.fillText(txt, tx + 8, ty + 14);
  }

  /* ---------- the game: discover every design ---------- */
  var toastEl = $('#libToast'), tt = 0;
  function toast(s) { if (!s) return; toastEl.textContent = s; toastEl.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { toastEl.classList.remove('on'); }, 2600); }
  var seenT = 0;
  function score() { var n = V.filter(function (i) { return seen[sid(A[i])]; }).length; $('#libSeen').textContent = n; $('#libTot').textContent = V.length; $('#libMeter').style.transform = 'scaleX(' + (V.length ? n / V.length : 0) + ')'; return n; }
  function discover(i) {
    var a = A[i]; if (seen[sid(a)]) return; seen[sid(a)] = 1;
    clearTimeout(seenT); seenT = setTimeout(function () { FG.store('seen', seen); }, 500);
    els[i].classList.add('seen', 'just'); setTimeout(function () { els[i].classList.remove('just'); }, 1100);
    var n = score(), T = V.length;
    toast(n === 1 ? 'First find. ' + (T - 1) + ' more in here.' : n === T ? 'Library complete. You have seen every template.' : n % 10 === 0 ? n + ' found. ' + (T - n) + ' to go.' : null); dirty = true;
  }
  function openCard(i) { discover(i); viewer.open(i); }
  function surprise() {
    if (!V.length) return;
    var pool = V.filter(function (i) { return !seen[sid(A[i])]; }); if (!pool.length) pool = V.slice();
    var i = pool[Math.floor(Math.random() * pool.length)], p = lay.pos[i]; fly(p.x + CW / 2, p.y + CH / 2, Math.max(1.25, zmin));
    setTimeout(function () { els[i].classList.add('ping'); setTimeout(function () { els[i].classList.remove('ping'); }, 2400); }, 700);
  }

  /* ---------- dock ---------- */
  var seg = $('#libSeg'), chips = $('#libChips');
  GROUPS.forEach(function (g) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = g[1]; b.dataset.g = g[0]; b.setAttribute('aria-pressed', g[0] === group);
    b.addEventListener('click', function () { setGroup(g[0]); }); seg.appendChild(b);
  });
  function setGroup(g) {
    if (g === group) return; group = g; $$('button', seg).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.g === g); });
    try { localStorage.setItem('tas:v1:group', g); } catch (e) {}
    clearHover(); layout(g); place(true); renderChips(); setTimeout(fit, 80);
  }
  function renderChips() {
    chips.innerHTML = ''; if (group === 'all') { chips.innerHTML = '<span class="lab">Pick a group to sort the canvas into frames</span>'; return; }
    lay.labels.forEach(function (L, li) {
      var b = document.createElement('button'); b.type = 'button'; b.innerHTML = esc(L.t) + ' <em>' + L.n + '</em>'; b.style.animationDelay = Math.min(li * 30, 600) + 'ms';
      b.addEventListener('click', function () { fly(L.x + L.w / 2, L.y + L.h / 2, fitZ(L.w, L.h)); $$('.lcl[data-l="' + li + '"]', world).forEach(function (f) { f.classList.remove('flash'); void f.offsetWidth; f.classList.add('flash'); }); });
      chips.appendChild(b);
    });
  }
  $('#libIn').addEventListener('click', function () { zoomAt(vw / 2, vh / 2, 1.25); });
  $('#libOut').addEventListener('click', function () { zoomAt(vw / 2, vh / 2, .8); });
  $('#libFit').addEventListener('click', fit);
  $('#libDice').addEventListener('click', surprise);

  /* ---------- minimap ---------- */
  function drawMini() {
    if (!mini.offsetWidth) return; var s = Math.min(170 / TW, 130 / TH), w = Math.round(TW * s), h = Math.max(20, Math.round(TH * s));
    if (mini.width !== w * DPR || mini.height !== h * DPR) { mini.width = w * DPR; mini.height = h * DPR; mini.style.height = h + 'px'; mini.style.width = w + 'px'; }
    mc.setTransform(DPR, 0, 0, DPR, 0, 0); mc.clearRect(0, 0, w, h);
    lay.labels.forEach(function (L) { mc.strokeStyle = '#b9c4be'; mc.setLineDash([2, 2]); mc.strokeRect(L.x * s, L.y * s, L.w * s, L.h * s); }); mc.setLineDash([]);
    V.forEach(function (i) { var p = lay.pos[i]; mc.fillStyle = seen[sid(A[i])] ? '#35c274' : (i === hovI ? '#17904f' : '#b3beb8'); mc.fillRect(p.x * s, p.y * s, Math.max(1, CW * s), Math.max(1, CH * s)); });
    mc.strokeStyle = '#101a15'; mc.lineWidth = 1.2; mc.strokeRect((cam.x - vw / 2 / cam.z) * s, (cam.y - vh / 2 / cam.z) * s, vw / cam.z * s, vh / cam.z * s);
  }
  mini.addEventListener('click', function (e) { var r = mini.getBoundingClientRect(), s = Math.min(170 / TW, 130 / TH); fly((e.clientX - r.left) / s, (e.clientY - r.top) / s, cam.z); });

  /* ---------- loop ---------- */
  var lt = 0, running = false;
  function loop(now) {
    if (!isOpen) { running = false; return; } requestAnimationFrame(loop);
    var dt = Math.min(40, now - (lt || now)); lt = now;
    if (flying) flying(now);
    else if (!drag && (Math.abs(vel.x) > .01 || Math.abs(vel.y) > .01)) { cam.x -= vel.x * dt / cam.z; cam.y -= vel.y * dt / cam.z; var dec = Math.pow(.93, dt / 16); vel.x *= dec; vel.y *= dec; apply(); }
    if (hovI >= 0 && now - hovT > 650 && !seen[sid(A[hovI])]) discover(hovI);
    if (dirty || hovI >= 0) { if (dirty && lastPt && !drag && !flying) hover(lastPt[0], lastPt[1]); drawLinks(); drawMini(); dirty = false; }
  }

  /* ---------- open / close ---------- */
  var flash = $('#libFlash');
  function scramble(T) {
    if (RM) return; var G = '#%@*+=:-', t0 = performance.now(); flash.classList.add('on'); T = T.toUpperCase();
    (function f(now) {
      var k = (now - t0) / 900, s = ''; for (var i = 0; i < T.length; i++) s += (T[i] === ' ' || k * T.length * 1.4 > i + hsh(i, 7) * 6) ? T[i] : G[(Math.random() * G.length) | 0];
      flash.textContent = s; if (k < 1.1) requestAnimationFrame(f); else setTimeout(function () { flash.classList.remove('on'); }, 500);
    })(t0);
  }
  var lib = {
    open: function () {
      connect.hidden = true; root.hidden = false; document.body.classList.add('locked'); isOpen = true; measure();
      if (!introduced) {
        introduced = true; cam = { x: TW / 2, y: TH / 2, z: fitZ(TW, TH) }; apply(); score();
        if (!RM && V.length < 600) {
          var z = cam.z; V.forEach(function (i) { var p = lay.pos[i], r = Math.hypot((p.x + CW / 2 - cam.x) * z, (p.y + CH / 2 - cam.y) * z); els[i].firstChild.style.setProperty('--d', Math.min(1.1, r / 1400).toFixed(2) + 's'); });
          root.classList.remove('enter'); void root.offsetWidth; root.classList.add('enter'); setTimeout(function () { root.classList.remove('enter'); }, 2400);
        }
        scramble('Sorted. ' + V.length + ' templates');
        hint.classList.remove('gone'); clearTimeout(lib._h); lib._h = setTimeout(hideHint, 8000);
      } else apply();
      if (!running) { running = true; lt = 0; requestAnimationFrame(loop); }
    },
    close: function () { isOpen = false; root.hidden = true; clearHover(); }
  };
  addEventListener('resize', function () { if (isOpen) { measure(); apply(); } });
  addEventListener('keydown', function (e) {
    if (!isOpen || !viewer.el.hidden || !panel.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input,textarea')) return;
    var s = 140 / cam.z;
    if (e.key === 'ArrowLeft' || e.key === 'a') fly(cam.x - s * 2, cam.y, cam.z, 380);
    else if (e.key === 'ArrowRight' || e.key === 'd') fly(cam.x + s * 2, cam.y, cam.z, 380);
    else if (e.key === 'ArrowUp' || e.key === 'w') fly(cam.x, cam.y - s * 2, cam.z, 380);
    else if (e.key === 'ArrowDown' || e.key === 's') fly(cam.x, cam.y + s * 2, cam.z, 380);
    else if (e.key === '+' || e.key === '=') zoomAt(vw / 2, vh / 2, 1.25);
    else if (e.key === '-') zoomAt(vw / 2, vh / 2, .8);
    else if (e.key === '0' || e.key === 'f') fit();
    else if (e.key === 'r') surprise();
    else if (e.key === '/') { $('#libQ').focus(); }
    else return; e.preventDefault();
  });

  function openLibrary(sets) {
    try { var g = localStorage.getItem('tas:v1:group'); if (g && GROUPS.some(function (x) { return x[0] === g; })) group = g; } catch (e) {}
    $$('button', seg).forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.g === group); });
    setData(sets); lib.open();
  }

  /* status line for rate limits */
  var statusEl = $('#libStatus'), stT = 0;
  function note(msg, ms) { statusEl.hidden = false; statusEl.classList.add('warn'); statusEl.textContent = msg; clearTimeout(stT); stT = setTimeout(function () { statusEl.hidden = true; }, ms || 9000); }
  FG.onWait(function (wait, msg) { note(msg || ('Figma asked us to slow down. Thumbnails continue in ' + FG.humanWait(wait) + '.'), Math.min(wait, 60) * 1000 + 3000); });

  /* =========================================================
     VIEWER
     ========================================================= */
  var viewer = (function () {
    var el = $('#lb'), img = $('#lbimg'), ld = $('#lbload'), cur = -1, last = null, tok = 0;
    function open(i) {
      cur = i; var a = A[i], t = ++tok; last = last || document.activeElement;
      el.hidden = false; document.body.classList.add('locked');
      $('#lbBrand').textContent = a.brand + ' · ' + a.fileName;
      $('#lbT').textContent = a.title; $('#lbName').textContent = a.name;
      var rows = [['Type', a.type], ['Category', a.category], ['Language', a.lang], ['Date', a.date && a.date % 10000 ? fmtDate(a.date) : a.year], ['Size', a.w + ' × ' + a.h + ' · ' + a.length]];
      $('#lbTags').innerHTML = rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
      $('#lbSecs').innerHTML = a.sections.length ? a.sections.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') : '<span>No named blocks</span>';
      $('#lbOpen').href = FG.nodeUrl(a.file, a.id);
      img.removeAttribute('src'); img.alt = a.title; ld.hidden = false; ld.textContent = 'Rendering from Figma…';
      var th = FG.thumbFor(a.file, a.id); if (th) img.src = th;
      $('#lbs').scrollTop = 0;
      FG.full(a.file, a.id).then(function (u) { if (t !== tok) return; if (u) { var im = new Image(); im.onload = function () { if (t === tok) { img.src = u; ld.hidden = true; } }; im.src = u; } else ld.textContent = 'Figma could not render this frame.'; })
        .catch(function (e) { if (t === tok) { ld.textContent = e.message; ld.hidden = false; } if (th) ld.hidden = true; });
      $('#lbx').focus({ preventScroll: true });
    }
    function step(d) { var order = viewOrder(), k = order.indexOf(cur); if (k < 0) return; var n = order[(k + d + order.length) % order.length]; discover(n); open(n); var p = lay.pos[n]; fly(p.x + CW / 2, p.y + CH / 2, cam.z, 500); }
    function close() { el.hidden = true; tok++; if (!root.hidden) document.body.classList.add('locked'); if (last && last.focus) last.focus({ preventScroll: true }); last = null; }
    $('#lbx').addEventListener('click', close);
    $('#lbPrev').addEventListener('click', function () { step(-1); });
    $('#lbNext').addEventListener('click', function () { step(1); });
    el.addEventListener('click', function (e) { if (e.target === el || e.target.id === 'lbs') close(); });
    addEventListener('keydown', function (e) { if (el.hidden) return; if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); else return; e.preventDefault(); });
    return { open: open, el: el };
  })();
  // reading order of the canvas: group by group, row by row
  function viewOrder() { return V.slice().sort(function (a, b) { var p = lay.pos[a], q = lay.pos[b]; return (Math.round(p.y / PY) - Math.round(q.y / PY)) * 1e6 + (p.x - q.x) || 0; }); }
  var MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(n) { var y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100; return (m ? MN[m - 1] + ' ' : '') + (d ? d + ', ' : '') + y; }

  /* =========================================================
     FILES PANEL
     ========================================================= */
  var panel = $('#panel'), pErr = $('#pErr');
  function renderPanel() {
    var files = FG.files();
    $('#pFiles').innerHTML = '';
    files.forEach(function (f) {
      var d = FG.cached(f.key), li = document.createElement('li');
      li.innerHTML = '<div><b>' + esc(f.name || f.key) + '</b><span>' + (d ? plural(d.items.length, 'template') + ' · sorted ' + new Date(d.savedAt).toLocaleDateString() : 'Not sorted yet') + '</span></div>' +
        '<a href="https://www.figma.com/design/' + encodeURIComponent(f.key) + '/" target="_blank" rel="noopener">Open</a><button type="button">Remove</button>';
      li.querySelector('button').addEventListener('click', function () {
        if (FG.files().length === 1) { forgetAll(); return; }
        FG.forget(f.key); FG.files(FG.files().filter(function (x) { return x.key !== f.key; })); reopen();
      });
      $('#pFiles').appendChild(li);
    });
  }
  function reopen() { var sets = FG.files().map(function (f) { return FG.cached(f.key); }).filter(Boolean); if (sets.length) { introduced = true; setData(sets); lib.open(); setTimeout(fit, 50); renderPanel(); } else showConnect(); }
  $('#libMenu').addEventListener('click', function () { renderPanel(); showErr(pErr); panel.hidden = false; $('#pUrl').focus(); });
  $('#panelX').addEventListener('click', function () { panel.hidden = true; });
  panel.addEventListener('click', function (e) { if (e.target === panel) panel.hidden = true; });
  addEventListener('keydown', function (e) { if (!panel.hidden && e.key === 'Escape') panel.hidden = true; });
  $('#pAdd').addEventListener('submit', async function (e) {
    e.preventDefault(); showErr(pErr);
    var u = $('#pUrl').value.trim(), p = FG.parseUrl(u), btn = this.querySelector('button');
    if (!p) return showErr(pErr, 'That does not look like a Figma file link.');
    if (FG.files().some(function (f) { return f.key === p.key; })) return showErr(pErr, 'That file is already in your library.');
    btn.disabled = true; btn.textContent = 'Sorting…';
    try { var d = (await loadAll([{ key: p.key }], function (t) { btn.textContent = 'Sorting…'; }))[0]; FG.files(FG.files().concat([{ key: p.key, url: u, name: d.name }])); $('#pUrl').value = ''; reopen(); }
    catch (err) { showErr(pErr, err.message); }
    btn.disabled = false; btn.textContent = 'Add';
  });
  $('#pRefresh').addEventListener('click', async function () {
    var b = this; b.disabled = true; showErr(pErr);
    try { var files = FG.files(); var sets = await loadAll(files, function (t) { b.textContent = t; }); FG.files(files.map(function (f, i) { return Object.assign({}, f, { name: sets[i].name }); })); reopen(); }
    catch (err) { showErr(pErr, err.message); }
    b.disabled = false; b.textContent = 'Re-sort from Figma';
  });
  $('#pToken').addEventListener('click', function () { panel.hidden = true; showConnect(); $('#cTok').focus(); });
  $('#pForget').addEventListener('click', forgetAll);

  /* =========================================================
     START
     ========================================================= */
  (function start() {
    var files = FG.files(), sets = files.map(function (f) { return FG.cached(f.key); });
    if (FG.token() && files.length && sets.every(Boolean)) openLibrary(sets);
    else showConnect();
  })();
})();
