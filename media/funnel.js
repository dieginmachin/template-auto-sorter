/* Auto-Sorter funnel motion. Vanilla, no dependencies. Every effect is opt-in by attribute:
   .rv                 rises in when it enters the viewport (data-delay="ms")
   [data-words]        a headline whose words rise in one by one
   [data-count]        a number that counts up from 0 when seen (data-count="2425")
   [data-deadline]     a live countdown to an ISO date (fills [data-d] [data-h] [data-m] [data-s]);
                       elements with [data-until-over] show only after it passes, [data-until] only before
   [data-marquee]      a row of real email thumbnails sliding forever (data-ids="id,id,…", data-dir="-1")
   [data-light]        a sentence whose words light up as it scrolls through the screen
   iframe[data-src]    loads when it comes near (the live sample)
   [data-demo]         a stageshow demo; the bundle is fetched once, when the first demo comes near
   [data-scene=chaos]  pinned scroll scene: real emails go from a mess to sorted by brand, then by category
   [data-scene=explode] pinned scroll scene: one real email comes apart into its sections
   Reduced motion: everything lands in its end state. */
(function () {
  'use strict';
  var A = window.AS || {};
  var MEDIA = A.media || 'https://dieginmachin.github.io/template-auto-sorter/media/';
  var T = function (id) { return MEDIA + 'demo/t/' + String(id).replace(/:/g, '-') + '.jpg'; };
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  document.documentElement.classList.add('js');

  /* ---------- words: split a headline into rising words ---------- */
  $$('[data-words]').forEach(function (el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) {
          var frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(function (w) {
            if (!w) return;
            if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
            var o = document.createElement('span'); o.className = 'w';
            var s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i++);
            o.appendChild(s); frag.appendChild(o);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    })(el);
    el.classList.add('rv');
  });

  /* ---------- reveal + counters + lazy things ---------- */
  function count(el) {
    var to = +el.dataset.count, t0 = 0, dur = +(el.dataset.dur || 1600), fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
    if (RM) { el.textContent = fmt(to); return; }
    requestAnimationFrame(function step(t) { if (!t0) t0 = t; var k = clamp((t - t0) / dur, 0, 1); el.textContent = fmt(to * ease(k)); if (k < 1) requestAnimationFrame(step); });
  }
  var demosLoaded = false;
  function loadDemos() {
    if (demosLoaded) return; demosLoaded = true;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = A.demosCss || MEDIA + 'demos/demos.css'; document.head.appendChild(l);
    var s = document.createElement('script'); s.src = A.demosJs || MEDIA + 'demos/demos.js'; s.defer = true; document.body.appendChild(s);
  }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target; io.unobserve(el);
        if (el.dataset.count != null) count(el);
        else if (el.tagName === 'IFRAME') el.src = el.dataset.src;
        else {
          if (el.hasAttribute('data-demo')) loadDemos();
          setTimeout(function () { el.classList.add('in'); }, +(el.dataset.delay || 0));
        }
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    var near = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { near.unobserve(e.target); if (e.target.tagName === 'IFRAME') e.target.src = e.target.dataset.src; else loadDemos(); } });
    }, { rootMargin: '600px 0px' });
    $$('.rv, [data-count]').forEach(function (el) { io.observe(el); });
    $$('iframe[data-src], [data-demo]').forEach(function (el) { near.observe(el); });
  } else {
    $$('.rv').forEach(function (el) { el.classList.add('in'); });
    $$('[data-count]').forEach(count);
    $$('iframe[data-src]').forEach(function (f) { f.src = f.dataset.src; });
    if (document.querySelector('[data-demo]')) loadDemos();
  }

  /* ---------- countdown to a real date ---------- */
  var dl = $$('[data-deadline]');
  function tick() {
    var now = Date.now();
    dl.forEach(function (el) {
      var left = Math.max(0, new Date(el.dataset.deadline).getTime() - now), over = left <= 0;
      var d = Math.floor(left / 864e5), h = Math.floor(left / 36e5) % 24, m = Math.floor(left / 6e4) % 60, s = Math.floor(left / 1e3) % 60;
      var put = function (k, v) { var x = el.querySelector('[data-' + k + ']'); if (x) x.textContent = String(v).padStart(2, '0'); };
      put('d', d); put('h', h); put('m', m); put('s', s);
      el.classList.toggle('over', over);
    });
    var over = dl.length && new Date(dl[0].dataset.deadline).getTime() <= now;
    $$('[data-until]').forEach(function (x) { x.hidden = !!over; });
    $$('[data-until-over]').forEach(function (x) { x.hidden = !over; });
  }
  if (dl.length) { tick(); setInterval(tick, 1000); }

  /* ---------- marquee of real thumbnails ---------- */
  $$('[data-marquee]').forEach(function (el) {
    var ids = (el.dataset.ids || '').split(',').filter(Boolean), track = document.createElement('div');
    track.className = 'mq-track'; if (el.dataset.dir === '-1') track.classList.add('rev');
    var html = ids.map(function (id) { return '<span class="mq-card"><img loading="lazy" alt="" src="' + T(id) + '"></span>'; }).join('');
    track.innerHTML = html + html; el.appendChild(track);
  });

  /* ---------- hero field: real emails drifting behind the copy ---------- */
  $$('[data-field]').forEach(function (el) {
    var ids = (el.dataset.ids || '').split(',').filter(Boolean);
    el.innerHTML = ids.map(function (id, i) {
      var col = i % 6, row = Math.floor(i / 6);
      var x = 44 + col * 10 + ((i * 37) % 6), y = -6 + row * 34 + ((i * 53) % 12);
      return '<span style="left:' + x + '%;top:' + y + '%;--r:' + (((i * 29) % 14) - 7) + 'deg;--dx:' + (((i * 17) % 30) - 15) + 'px;--dy:' + (((i * 23) % 40) - 20) + 'px;--d:-' + (i * 1.3) + 's;--o:' + (0.55 + ((i * 13) % 45) / 100) + '"><img alt="" src="' + T(id) + '"></span>';
    }).join('');
    requestAnimationFrame(function () { el.classList.add('on'); });
  });

  /* ---------- scroll: scenes and lit words ---------- */
  var scenes = [], lights = $$('[data-light]');
  lights.forEach(function (el) {
    var words = el.textContent.trim().split(/\s+/); el.textContent = '';
    words.forEach(function (w, i) { var s = document.createElement('span'); s.textContent = w + (i < words.length - 1 ? ' ' : ''); el.appendChild(s); });
  });

  /* chaos: a mess of real emails -> grouped by brand -> regrouped by category -> one opens */
  $$('[data-scene=chaos]').forEach(function (sc) {
    var board = sc.querySelector('.ch-board'), caps = $$('.ch-cap', sc), list = A.chaos || [];
    var MESS = ['Frame 2847', 'BF FINAL v3', 'copy of copy', 'Untitled', 'new hero??', 'Frame 2851', 'use this one', 'OLD do not use', 'Frame 912', 'v2 approved?', 'Rectangle 44', 'Group 18'];
    var cards = list.map(function (c, i) {
      var el = document.createElement('span'); el.className = 'ch-card';
      el.innerHTML = '<img alt="" src="' + T(c[0]) + '"><b>' + MESS[i % MESS.length] + '</b>';
      board.appendChild(el);
      return { el: el, brand: c[1], cat: c[2], i: i };
    });
    var frames = {};
    function frame(key, label) {
      if (frames[key]) return frames[key];
      var f = document.createElement('span'); f.className = 'ch-frame'; f.innerHTML = '<i>' + label + '</i><em></em>';
      board.insertBefore(f, board.firstChild); return (frames[key] = f);
    }
    var L = {};
    function layouts() {
      var W = board.clientWidth, H = board.clientHeight, small = W < 640;
      var cw = small ? Math.min(46, W / 8) : Math.min(78, W / 13), ch = cw * 1.36, gap = small ? 5 : 8, pad = small ? 8 : 12, top = small ? 18 : 22;
      function group(key) {
        var keys = [], by = {};
        cards.forEach(function (c) { var k = c[key]; if (!by[k]) { by[k] = []; keys.push(k); } by[k].push(c); });
        var cols = function (n) { return n <= 2 ? n : n <= 4 ? 2 : 3; };
        var boxes = keys.map(function (k) { var n = by[k].length, co = cols(n), ro = Math.ceil(n / co); return { k: k, n: n, co: co, w: co * cw + (co - 1) * gap + 2 * pad, h: ro * ch + (ro - 1) * gap + top + pad }; });
        var lines = [[]], used = 0, between = small ? 10 : 22;
        boxes.forEach(function (b) { if (used && used + between + b.w > W) { lines.push([]); used = 0; } lines[lines.length - 1].push(b); used += (used ? between : 0) + b.w; });
        var totalH = lines.reduce(function (t, l) { return t + Math.max.apply(null, l.map(function (b) { return b.h; })); }, 0) + (lines.length - 1) * (small ? 14 : 24);
        var y = Math.max(0, (H - totalH) / 2), pos = {}, fr = {};
        lines.forEach(function (line) {
          var lw = line.reduce(function (t, b) { return t + b.w; }, 0) + (line.length - 1) * between, x = (W - lw) / 2;
          line.forEach(function (b) {
            fr[key + b.k] = { x: x, y: y, w: b.w, h: b.h, label: b.k, n: b.n };
            by[b.k].forEach(function (c, j) { pos[c.i] = { x: x + pad + (j % b.co) * (cw + gap), y: y + top + Math.floor(j / b.co) * (ch + gap), r: 0 }; });
            x += b.w + between;
          });
          y += Math.max.apply(null, line.map(function (b) { return b.h; })) + (small ? 14 : 24);
        });
        return { pos: pos, fr: fr };
      }
      var mess = {};
      cards.forEach(function (c) {
        var a = (c.i * 137.5) % 360, rr = 0.18 + ((c.i * 61) % 100) / 100 * 0.32;
        mess[c.i] = { x: W / 2 - cw / 2 + Math.cos(a * Math.PI / 180) * W * rr * 1.05, y: H / 2 - ch / 2 + Math.sin(a * Math.PI / 180) * H * rr * 0.95, r: ((c.i * 47) % 30) - 15 };
      });
      L = { cw: cw, ch: ch, mess: mess, brand: group('brand'), cat: group('cat'), W: W, H: H };
      Object.keys(frames).forEach(function (k) { frames[k].style.opacity = 0; });
      ['brand', 'cat'].forEach(function (g) { Object.keys(L[g].fr).forEach(function (k) { var f = L[g].fr[k], el = frame(k, f.label); el.style.cssText = 'left:' + f.x + 'px;top:' + f.y + 'px;width:' + f.w + 'px;height:' + f.h + 'px'; el.querySelector('em').textContent = f.n; el.dataset.g = g; }); });
      cards.forEach(function (c) { c.el.style.width = cw + 'px'; c.el.style.height = ch + 'px'; });
    }
    scenes.push({ el: sc, layout: layouts, draw: function (p) {
      // 0-.22 mess (drifting), .22-.42 -> brand, .42-.62 hold, .62-.8 -> category, .8-1 hold + one opens
      var t = performance.now() / 1000;
      var a = ease(clamp((p - 0.2) / 0.22, 0, 1)), b = ease(clamp((p - 0.6) / 0.2, 0, 1)), z = ease(clamp((p - 0.86) / 0.12, 0, 1));
      var step = p < 0.21 ? 0 : p < 0.6 ? 1 : p < 0.85 ? 2 : 3;
      caps.forEach(function (c, i) { c.classList.toggle('on', i === step); });
      Object.keys(frames).forEach(function (k) { var f = frames[k]; f.style.opacity = f.dataset.g === 'brand' ? a * (1 - b) : b * (1 - z * 0.6); });
      cards.forEach(function (c) {
        var m = L.mess[c.i], br = L.brand.pos[c.i], ct = L.cat.pos[c.i];
        var drift = (1 - a) * (RM ? 0 : 1);
        var mx = m.x + Math.sin(t * 0.6 + c.i) * 10 * drift, my = m.y + Math.cos(t * 0.5 + c.i * 1.7) * 8 * drift;
        var x = mx + (br.x - mx) * a, y = my + (br.y - my) * a, r = m.r * (1 - a);
        x += (ct.x - x) * b; y += (ct.y - y) * b;
        var s = 1, o = 1, hero = c.i === 2;
        if (z > 0) { if (hero) { s = 1 + z * (Math.min(L.W, L.H) * 0.55 / L.ch); x += (L.W / 2 - L.cw / 2 - x) * z; y += (L.H / 2 - L.ch / 2 - y) * z; } else o = 1 - z * 0.8; }
        c.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) rotate(' + r + 'deg) scale(' + s + ')';
        c.el.style.opacity = o; c.el.style.zIndex = hero ? 5 : 1;
        c.el.classList.toggle('tag', a < 0.5);
        c.el.classList.toggle('open', hero && z > 0.6);
      });
    } });
  });

  /* explode: one real email (Cannovia, BFCM Sale Countdown) comes apart into its sections */
  $$('[data-scene=explode]').forEach(function (sc) {
    var stack = sc.querySelector('.ex-stack'), slices = $$('.ex-slice', sc), labels = $$('.ex-label', sc), counter = sc.querySelector('[data-ex-count]'), caps = $$('.ex-cap', sc);
    scenes.push({ el: sc, layout: function () {}, draw: function (p) {
      var a = ease(clamp((p - 0.12) / 0.4, 0, 1)), b = ease(clamp((p - 0.55) / 0.3, 0, 1));
      var small = stack.clientWidth < 260;
      slices.forEach(function (s, i) {
        var n = slices.length, mid = (n - 1) / 2, off = (i - mid);
        var gapY = a * (small ? 18 : 30) * i, x = a * off * (small ? 6 : 18) + b * (i % 2 ? 1 : -1) * (small ? 8 : 26);
        s.style.transform = 'translate3d(' + x + 'px,' + gapY + 'px,0) rotate(' + (a * off * 1.2) + 'deg)';
        s.style.boxShadow = a > 0.02 ? '0 18px 40px -18px rgba(20,20,10,' + (0.55 * a) + ')' : 'none';
      });
      labels.forEach(function (l, i) { l.classList.toggle('on', a > 0.35 + i * 0.1); });
      caps.forEach(function (c, i) { c.classList.toggle('on', i === (p < 0.12 ? 0 : p < 0.55 ? 1 : 2)); });
      if (counter) counter.textContent = Math.round(2425 * b).toLocaleString('en-US');
    } });
  });

  function frameScroll() {
    var vh = innerHeight;
    scenes.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) return;
      var p = clamp(-r.top / Math.max(1, r.height - vh), 0, 1);
      s.draw(RM ? 1 : p);
    });
    lights.forEach(function (el) {
      var r = el.getBoundingClientRect(), p = clamp((vh * 0.85 - r.top) / (vh * 0.6), 0, 1), spans = el.children, n = spans.length;
      for (var i = 0; i < n; i++) spans[i].classList.toggle('lit', RM || i < p * n + 0.5);
    });
    requestAnimationFrame(frameScroll);
  }
  function relayout() { scenes.forEach(function (s) { s.layout(); }); }
  relayout(); addEventListener('resize', relayout);
  requestAnimationFrame(frameScroll);

  /* sticky bar: show after the hero */
  var bar = document.querySelector('.ub');
  if (bar) addEventListener('scroll', function () { bar.classList.toggle('show', scrollY > innerHeight * 0.7); }, { passive: true });

  /* the live sample is a closed demo: its "use it on your files" buttons ask this page to show its own form */
  addEventListener('message', function (e) {
    if (e.origin !== 'https://dieginmachin.github.io' || !e.data || e.data.as !== 'demo-cta') return;
    var t = document.getElementById('checkout') || document.getElementById('get');
    if (!t) return;
    t.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' });
    var f = t.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox])');
    if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, RM ? 0 : 600);
  });
})();
