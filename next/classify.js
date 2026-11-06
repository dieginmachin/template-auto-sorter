/* Template Auto-Sorter: the sorting rules.
   Reads a Figma file tree (REST shape) and returns one record per email-sized frame,
   tagged by brand, type (campaign / flow), category, sections, language, year and length.
   Works in the browser (window.TAS) and in Node (module.exports) for tests. */
(function (root) {
  'use strict';

  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2190}-\u{21FF}]/gu;
  function clean(s) { return String(s || '').replace(EMOJI, ' ').replace(/\s+/g, ' ').trim(); }
  function low(s) { return clean(s).toLowerCase(); }

  /* ---------- which frames count as templates ---------- */
  var BOXES = { FRAME: 1, COMPONENT: 1, INSTANCE: 1, GROUP: 1 };
  function box(n) { return n.absoluteBoundingBox || n.absoluteRenderBounds || { width: 0, height: 0 }; }
  function emailSized(n) {
    var b = box(n);
    if (/^\s*(\u{1F6A3}|\u{1F381})|\((row|wrapper) for /iu.test(n.name || '')) return false; // Emailify 🚣 rows / 🎁 wrappers
    return BOXES[n.type] && b.width >= 320 && b.width <= 900 && b.height >= b.width * 0.75;
  }
  // Generic container names that say nothing about the brand.
  var GENERIC = /^(random|misc(ellaneous)?|other|others|unsorted|section( \d+)?|frame( \d+)?|group( \d+)?|page( \d+)?|untitled|archive|old|wip|drafts?|new)$/i;

  /* ---------- the vocab ---------- */
  var FLOWS = [
    ['Welcome series', /welcome|bienvenid|\bws\s*#?\s*\d|\(\w{2,4}\)\s*ws\b|onboard|nurture/i],
    ['Abandoned checkout', /checkout\s*abandon|abandon\w*\s*checkout|checkout reminder/i],
    ['Abandoned cart', /cart\s*abandon|abandon\w*\s*cart|carrito/i],
    ['Browse abandonment', /browse\s*abandon|abandon\w*\s*browse|site abandon/i],
    ['Post-purchase', /post[\s-]*purchase|aftercare|after[\s-]*care|order confirm|thank you for (your )?order|review request|post[\s-]*compra|cross[\s-]*sell|upsell flow|replenish/i],
    ['Win-back', /win[\s-]*back|we miss you|sunset|lapsed/i],
    ['Back in stock', /back in stock|price drop/i]
  ];
  var CATS = [
    ['Black Friday & Cyber', /black\s*fri|\bbf\b|bfcm|cyber|buen fin|\bbn\s*#?\d|black november|hot sale|singles day/i],
    ['Holidays', /christmas|navidad|holiday|xmas|new year|a[ñn]o nuevo|reyes|hanukkah|gift guide|gift card|stuffing|kerst|sinterklaas/i],
    ['Seasonal moments', /\b420\b|valent|mother|\bmadres?\b|father|\bdads?\b|\bpadres?\b|abuelo|memorial|labou?r day|4th of july|independen|halloween|back to school|regreso a clases|easter|pascua|summer|verano|spring|primavera|\bfall\b|oto[ñn]o|winter|invierno|zomer|herfst|hola (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)|seasonal/i],
    ['Sale & promo', /sale|% ?off|\boff\b|discount|descuento|promo|flash|bogo|\bdeals?\b|oferta|rebaja|last chance|[úu]ltim[oa]|ending|\bends?\b|reminder|recordatorio|gratis|\bfree\b|bundle|\bkits?\b|\bsave\b|ahorr|preventa|precios?|quedan|\d+\s*(horas|hours|hrs|h)\b|pre-?sale|early access|tiers|bmsm|buy more|korting|actie|aanbieding|code|cup[oó]n|vip/i],
    ['New & launch', /\bnew\b|nuev|launch|lanzamiento|lancering|\bdrop\b|restock|introduc|announc|coming soon|collection|colecci|collectie|\bmeet\b|presenting|nieuw|livegang|neu\b/i],
    ['Social proof', /social proof|review|testimon|rese[ñn]a|\bugc\b|customer (fav|stor)|best ?sell|favorit|top picks|why we|approved|winner|ganador/i],
    ['Education & story', /\btips?\b|educat|guide|how to|\bwhy\b|benefit|science|learn|blog|myth|mitos|mythes|\bvs\.?\b|tipos|\btypes?\b|faq|story|historia|founder|behind|reflexi|explained|what .* is|essential|nutri|directorio|content|resultados|results|problem|c[oó]mo|qu[eé]|cu[aá]nto|por qu[eé]|beneficios|red flags|routine|rutina|\babout\b|sobre|ingredient|like a pro|avoid|injur|balance|most important|future|beyond|planning|comparison|alternative|start with|healthy|wellness|right/i],
    ['Product spotlight', /product|spotlight|feature|highlight|showcase|shop by|essentials|config|crafted|accesorio|joyer|relojes|vestidos|blusas|su[eé]ter|jumpsuit|agenda|notepad/i],
    ['Engagement & newsletter', /newsletter|\bnews\b|engag|community|quiz|inspo|monday|update|survey|poll|giveaway|winactie|contest|sorteo|greeting|thank|rewards?|recompensa|loyal|puntos|points|referral/i]
  ];
  var SECTIONS = [
    ['Announcement bar', /announcement|alert bar|top bar|pre-?header|ticker|text wavy/i],
    ['Header & logo', /logo|header|nav(igation)?\b|menu/i],
    ['Hero', /hero|banner|headline|main image|above the fold/i],
    ['Product grid', /product|klaviyo .*feed|catalog|\bshop\b|\bitems?\b|collection grid/i],
    ['Image gallery', /gallery|image card|two images|captioned|row images|full image|image wrapper|single image/i],
    ['Bento', /bento/i],
    ['Reviews', /review|testimon|social proof|trust ?pilot|\bugc\b|rating|stars/i],
    ['Discount code', /discount|coupon|c[oó]digo|promo code|voucher/i],
    ['Countdown', /countdown|timer|count down/i],
    ['Video', /video|gif/i],
    ['Articles & listicle', /article|blog|listicle|news cards/i],
    ['Features & USPs', /usp|feature|icon|benefit|payments|guarantee|shipping|calendar|help features/i],
    ['Text & CTA', /title|paragraph|text|button|\bcta\b|copy|heading|split heading/i],
    ['Custom code', /custom code|code block/i],
    ['Contact & help', /contact|help|support|faq/i],
    ['Footer', /footer/i]
  ];
  // What a template is "about" when it has to sit in one frame on the canvas.
  var SIGNATURE = ['Bento', 'Video', 'Countdown', 'Discount code', 'Reviews', 'Articles & listicle', 'Product grid', 'Image gallery', 'Features & USPs', 'Hero', 'Text & CTA'];

  var LANG_CODES = { EN: 'English', NL: 'Dutch', DE: 'German', FR: 'French', ES: 'Spanish', IT: 'Italian', PT: 'Portuguese', MX: 'Spanish', US: 'English', UK: 'English' };
  var WORDS = {
    Spanish: /\b(de|la|los|las|el|del|y|para|tu|tus|con|nuevos?|nuevas?|colecciones|d[ií]a|hola|semana|regalo|joyer[ií]a|gratis|mejores|precios|[uú]ltimo|inicio|ma[ñn]ana|correo|se[ñn]al|preventa|rebajas|tipos|hombres)\b|[ñáéíóú¿¡]/i,
    Dutch: /\b(het|een|voor|van|naar|jij|onze|nieuwe|maandelijkse|collectie|kant|klaar|zweet|waar|opgehaald|korting|winactie|gereedschap\w*|werkplaats\w*|bijna|zijn|deals die|mythes)\b|ij\b/i,
    German: /\b(der|die|das|und|f[üu]r|mit|jetzt|neu|angebot)\b|[äöüß]/i,
    French: /\b(le|les|des|et|pour|avec|nouveau|nouvelle|soldes)\b|[àèùç]/i,
    English: /\b(by|shop|explore|more|buy|now|here|what|gift|top|picks|design|modern|care|crafted|the|and|for|your|you|with|of|to|our|is|new|sale|best|last|chance|how|why|tips|day|shop|get|off|free|reminder|welcome|email)\b/i
  };

  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    ene: 1, abr: 4, ago: 8, dic: 12, mei: 5, okt: 10 };
  var NOW_Y = new Date().getFullYear();
  function okYear(y) { return y >= 2015 && y <= NOW_Y + 1; }

  /* ---------- per-field rules ---------- */
  function first(list, s) { for (var i = 0; i < list.length; i++) if (list[i][1].test(s)) return list[i][0]; return null; }

  function parseDate(raw) {
    var s = clean(raw), m;
    // (XX) YYMMDD or YYMMDD at the start; fall back to DDMMYY when YY is out of range
    if ((m = s.match(/(?:^|[\s(|-])(\d{2})(\d{2})(\d{2})(?=$|[\s)|:-])/))) {
      var a = +m[1], b = +m[2], c = +m[3];
      var ymd = okYear(2000 + a) && b >= 1 && b <= 12 && c >= 1 && c <= 31 ? { y: 2000 + a, m: b, d: c } : null;
      var dmy = 2000 + c <= NOW_Y && okYear(2000 + c) && b >= 1 && b <= 12 && a >= 1 && a <= 31 ? { y: 2000 + c, m: b, d: a } : null;
      if (ymd && dmy && ymd.y !== dmy.y) { ymd.alt = dmy; return ymd; } // settled per brand in finalize()
      if (ymd || dmy) return ymd || dmy;
    }
    // Nov 10, 2024
    if ((m = s.match(/\b([A-Za-z]{3,5})\.? (\d{1,2}),? (20\d{2})\b/))) {
      var mo = MONTHS[m[1].toLowerCase().slice(0, 4)] || MONTHS[m[1].toLowerCase().slice(0, 3)];
      if (mo) return { y: +m[3], m: mo, d: +m[2] };
    }
    // 2025 / May / 1
    if ((m = s.match(/\b(20\d{2})\s*\/\s*([A-Za-z]{3,})\s*\/\s*(\d{1,2})\b/)) && MONTHS[m[2].toLowerCase().slice(0, 3)])
      return { y: +m[1], m: MONTHS[m[2].toLowerCase().slice(0, 3)], d: +m[3] };
    // 02.10.24 / 26.09.24 / XX.06.2024 / 2024-05-28
    if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)) && okYear(+m[1])) return { y: +m[1], m: +m[2], d: +m[3] };
    if ((m = s.match(/\b(\d{2}|XX)\.(\d{2})\.(\d{2}|\d{4})\b/i))) {
      var y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      if (okYear(y) && +m[2] <= 12) return { y: y, m: +m[2], d: /x/i.test(m[1]) ? 1 : +m[1] };
    }
    // 06/30/25 or 30/06/2025 (day/month when it can't be told apart)
    if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/))) {
      var p1 = +m[1], p2 = +m[2], yy = +m[3] < 100 ? 2000 + +m[3] : +m[3];
      if (okYear(yy) && p1 <= 31 && p2 <= 31) return p1 > 12 ? { y: yy, m: p2, d: p1 } : p2 > 12 ? { y: yy, m: p1, d: p2 } : { y: yy, m: p2, d: p1 };
    }
    // 20yy anywhere
    if ((m = s.match(/\b(20[12]\d)\b/)) && okYear(+m[1])) return { y: +m[1], m: 0, d: 0 };
    return null;
  }

  function parseLang(name, layers) {
    var s = clean(name), m;
    // "(SS) 240510 (EN) -", "EN 23/07 |", "DE | Email 1", "(NL)" not followed by a 6-digit date (that would be a brand code)
    var re = /\(([A-Z]{2})\)(?!\s*\d{6})|(?:^|[\s|/-])([A-Z]{2})(?=\s*[|:]|\s+\d{1,2}[/.]\d{1,2})/g;
    while ((m = re.exec(s))) { var code = m[1] || m[2]; if (LANG_CODES[code]) return { v: LANG_CODES[code], sure: 2 }; }
    for (var i = 0; i < layers.length; i++) {
      if ((m = layers[i].match(/(?:[:/]\s*|\b)(EN|NL|DE|FR|ES)\s*$/))) return { v: LANG_CODES[m[1]], sure: 2 };
    }
    var t = low(s).replace(/\(.*?\)|\d+/g, ' ');
    var score = {};
    Object.keys(WORDS).forEach(function (k) { var g = new RegExp(WORDS[k].source, 'gi'); score[k] = (t.match(g) || []).length; });
    score.English *= 0.9; // English loanwords show up in every language here
    var best = 'English', top = 0;
    Object.keys(score).forEach(function (k) { if (score[k] > top) { top = score[k]; best = k; } });
    // no language words at all: the brand's majority decides in finalize()
    return { v: top ? best : 'English', sure: top ? 1 : 0 };
  }

  function title(raw) {
    var s = clean(raw);
    s = s.replace(/^V\d+\s*/i, '')
      .replace(/^\(\w{1,5}\)\s*/, '')                       // (CH)
      .replace(/^\d{6}\s*(\(\w{2}\))?\s*[-–:|]?\s*/, '')     // 250117 (EN) -
      .replace(/^(\(\w{2}\)\s*)?(\w{2}\s+)?\d{1,2}[/.]\d{1,2}([/.]\d{2,4})?\s*[-–:|]\s*/, '') // EN 23/07 |
      .replace(/^(\w{2,3})\s*\|\s*/, '')                     // DE |
      .replace(/^[A-Za-z]{3,5}\.? \d{1,2}\s*\|\s*/, '')      // Sep 2 |
      .replace(/\s*\/\s*Email Campaign.*$/i, '')            // / Email Campaign - Nov 10, 2024
      .replace(/\s*\/\s*[^/]+$/, function (x) { return /campaign|sale|newsletter|educat|engag|product|promo|seasonal|content|community|tease/i.test(x) ? '' : x; })
      .replace(/^\(\w{2}\)\s*/, '')
      .trim();
    return s || clean(raw);
  }

  function lengthOf(h) { return h < 1600 ? 'Short' : h < 3000 ? 'Medium' : 'Long'; }

  /* ---------- brand names: merge near-duplicates ("Acme Co" / "Acme Co.", "Blue Leaf" / "Bluleaf") ---------- */
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function mergeBrands(items) {
    var count = {};
    items.forEach(function (it) { count[it.brand] = (count[it.brand] || 0) + 1; });
    var names = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; });
    var canon = {};
    names.forEach(function (n) {
      var k = n.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (var c in canon) {
        var ck = canon[c];
        if (ck === k || (k.length > 5 && lev(ck, k) <= 1)) { canon[n] = ck; canon['=' + n] = c; return; }
      }
      canon[n] = k; canon['=' + n] = n;
    });
    items.forEach(function (it) { it.brand = canon['=' + it.brand] || it.brand; });
  }

  // Passes that need the whole file: brand names, brand codes, ambiguous dates, language by brand majority.
  function finalize(items) {
    mergeBrands(items);
    var codes = {};
    items.forEach(function (it) { if (it.code && it.brand.charAt(0) !== '(' && it.brand !== 'Unsorted') { var c = codes[it.code] || (codes[it.code] = {}); c[it.brand] = (c[it.brand] || 0) + 1; } });
    var byBrand = {};
    items.forEach(function (it) {
      if (it.brand.charAt(0) === '(' && it.code) {
        var c = codes[it.code]; if (c) it.brand = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0]; else it.brand = it.code;
      }
      (byBrand[it.brand] || (byBrand[it.brand] = [])).push(it);
    });
    Object.keys(byBrand).forEach(function (b) {
      var list = byBrand[b].filter(function (it) { return it.kind === 'email'; });
      var ys = list.filter(function (it) { return it.date && !it._alt; }).map(function (it) { return Math.floor(it.date / 10000); }).sort();
      var med = ys.length ? ys[ys.length >> 1] : 0;
      list.forEach(function (it) {
        if (it._alt && med && Math.abs(Math.floor(it._alt / 10000) - med) < Math.abs(Math.floor(it.date / 10000) - med)) { it.date = it._alt; it.year = String(Math.floor(it.date / 10000)); }
        delete it._alt;
      });
      var votes = {}, n = 0;
      list.forEach(function (it) { if (it._lang) { votes[it.lang] = (votes[it.lang] || 0) + it._lang; n += it._lang; } });
      var top = Object.keys(votes).sort(function (a, c) { return votes[c] - votes[a]; })[0];
      list.forEach(function (it) { if (top && !it._lang && votes[top] / n >= 0.6) it.lang = top; delete it._lang; });
    });
    return items;
  }

  /* ---------- one frame -> one record ---------- */
  function classify(node, ctx) {
    var name = node.name || '';
    var layers = (node.children || []).filter(function (c) { return c.visible !== false; }).map(function (c) { return clean(c.name); });
    var lname = low(name);
    var b = box(node);

    var brand = ctx.container && !GENERIC.test(clean(ctx.container)) ? clean(ctx.container) : null;
    var code = (clean(name).match(/^\((\w{2,5})\)/) || [])[1];
    if (!brand) brand = code && !LANG_CODES[code] ? '(' + code + ')' : ctx.container ? clean(ctx.container) : (ctx.page && !GENERIC.test(clean(ctx.page)) && ctx.pageCount > 1 ? clean(ctx.page) : 'Unsorted');

    var isCampaign = /campaign|newsletter/.test(lname);
    var flow = isCampaign ? null : first(FLOWS, lname);
    if (!flow && /\bflow\b|email\s*#\s*\d|mail\s*\d\b/.test(lname) && !isCampaign && /series|flow|abandon|cart|checkout/.test(lname)) flow = 'Other flow';

    var secs = [];
    layers.forEach(function (l) {
      SECTIONS.forEach(function (S) { if (S[1].test(l) && secs.indexOf(S[0]) < 0) secs.push(S[0]); });
    });
    // No keyword in the name: let the layer structure decide
    var category = flow || first(CATS, lname) ||
      (secs.indexOf('Reviews') > -1 ? 'Social proof' : secs.indexOf('Discount code') > -1 || secs.indexOf('Countdown') > -1 ? 'Sale & promo' :
       secs.indexOf('Articles & listicle') > -1 ? 'Education & story' : secs.indexOf('Product grid') > -1 ? 'Product spotlight' :
       title(name).split(/\s+/).length <= 3 ? 'Product spotlight' : 'Other'); // a bare noun like "Omega3" or "Cabinet Hardware" is a product feature
    var signature = 'Plain layout';
    for (var i = 0; i < SIGNATURE.length; i++) if (secs.indexOf(SIGNATURE[i]) > -1) { signature = SIGNATURE[i]; break; }
    if (!layers.length) signature = 'Flat (no layers)';

    var date = parseDate(name), lang = parseLang(name, layers);
    return {
      kind: 'email',
      id: node.id,
      file: ctx.fileKey,
      fileName: ctx.fileName,
      page: clean(ctx.page),
      name: clean(name),
      title: title(name),
      brand: brand,
      type: flow ? 'Flow' : 'Campaign',
      category: category,
      sections: secs,
      signature: signature,
      code: code || null,
      lang: lang.v, _lang: lang.sure,
      year: date ? String(date.y) : 'Undated',
      date: date ? date.y * 10000 + date.m * 100 + date.d : 0,
      _alt: date && date.alt ? date.alt.y * 10000 + date.alt.m * 100 + date.alt.d : 0,
      length: lengthOf(b.height),
      w: Math.round(b.width), h: Math.round(b.height),
      layers: layers.length
    };
  }

  /* ---------- Atomic Emails parts ----------
     The contract the atomic-extractor skill (and any designer) can follow:
     a page, section or frame named "Parts" / "Atomic" / "Components" / "Library" holds parts;
     inside it, "Atoms" / "Molecules" / "Organisms" (or the workshop's "Elements" / "Containers" / "Sections")
     set the level. A part can also carry its level in its own name: "Atom / Button / Primary".
     Components and component sets anywhere in a file count as parts too. No level word? Size decides. */
  var LEVELS = [
    ['Atoms', /^(atoms?|elements?|[áa]tomos?|elementos?)\b/i],
    ['Molecules', /^(molecules?|containers?|mol[ée]culas?|contenedores?)\b/i],
    ['Organisms', /^(organisms?|organismos?|sections?|secciones?)\b/i]
  ];
  var PARTS_BOX = /^(parts?|atomic( emails?| parts| library)?|piezas|partes|components?|componentes|library|biblioteca|design system|ds)\b/i;
  var PART_TYPES = [
    ['Announcement bar', /announcement|alert bar|pre-?header|ticker|top bar/i],
    ['Hero', /hero|banner|above the fold|main image/i],
    ['Header & nav', /header|\bnav\b|navigation|menu|logo bar/i],
    ['Footer', /footer|unsubscribe|legal/i],
    ['Product grid', /product (grid|row|feed|list)|products|collection|catalog|feed|grid/i],
    ['Product card', /product|pdp|item card|price/i],
    ['Reviews', /review|testimon|rating|stars|social proof|trust ?pilot|\bugc\b|quote/i],
    ['Discount code', /discount|coupon|promo code|c[oó]digo|voucher|\bcode\b/i],
    ['Countdown', /countdown|timer/i],
    ['Article & listicle', /article|blog|listicle|\bnews\b/i],
    ['Bento', /bento/i],
    ['Features & USPs', /\busps?\b|feature|benefit|guarantee|shipping|icon (row|list|grid)/i],
    ['Button & CTA', /button|\bbtns?\b|\bctas?\b|\blinks?\b/i],
    ['Logo', /logo/i],
    ['Social icons', /social|instagram|facebook|tiktok/i],
    ['Video', /video|\bgif\b|play/i],
    ['Image', /image|\bimg\b|photo|picture|visual/i],
    ['Text', /heading|headline|title|text|paragraph|copy|body|eyebrow|subtitle|caption/i],
    ['Divider & spacer', /divider|spacer|separator|\bline\b|\bgap\b/i],
    ['Badge & label', /badge|\btags?\b|label|\bpills?\b|sticker|\bchips?\b/i],
    ['Icon', /icon/i]
  ];
  var PART_NODES = { COMPONENT_SET: 1, COMPONENT: 1, INSTANCE: 1, FRAME: 1, GROUP: 1 };
  function lead(s) { return clean(s).replace(/^[\d\s.\-–—_|:#•]+/, ''); } // "01 — Atoms" -> "Atoms"
  function levelOf(name) { var t = lead(name); for (var i = 0; i < LEVELS.length; i++) if (LEVELS[i][1].test(t)) return LEVELS[i][0]; return null; }
  // "Atoms", "01 — Atoms", "Atoms (buttons)" name a level box; "Atom / Button" names a part
  function levelBox(name) { var t = lead(name); for (var i = 0; i < LEVELS.length; i++) { var m = t.match(LEVELS[i][1]); if (m) return /^\s*(\(.*\))?\s*$/.test(t.slice(m[0].length)) ? LEVELS[i][0] : null; } return null; }
  function isPartsBox(name) { return PARTS_BOX.test(lead(name)); }
  // a folder of parts: components directly inside, or one level down (label + grid, as atomic-extractor lays them out)
  function hasComponents(n, d) { return (n.children || []).some(function (c) { return c.type === 'COMPONENT' || c.type === 'COMPONENT_SET' || (!d && (c.type === 'FRAME' || c.type === 'GROUP') && hasComponents(c, 1)); }); }
  function partTitle(name) {
    var segs = clean(name).split(/\s*[\/|]\s*/).filter(Boolean);
    if (segs.length > 1 && levelOf(segs[0])) segs.shift();
    return segs.join(' / ').replace(/^(atom|molecule|organism|element|container|section)s?\s*[-–:]\s*/i, '') || clean(name);
  }
  function classifyPart(node, ctx) {
    var b = box(node), name = node.name || '';
    var level = levelOf(name) || ctx.level, by = level ? 'name' : 'size';
    if (!level) level = b.width >= 480 ? 'Organisms' : (b.height <= 90 && b.width <= 360) || b.width * b.height < 30000 ? 'Atoms' : 'Molecules';
    var type = first(PART_TYPES, clean(name)) || (ctx.group && first(PART_TYPES, clean(ctx.group))) || 'Other';
    var brand = ctx.pbrand || (ctx.page && ctx.pageCount > 1 && !GENERIC.test(clean(ctx.page)) && !isPartsBox(ctx.page) && !levelOf(ctx.page) && !/^(emails?|templates?|campaigns?|flows?)$/i.test(lead(ctx.page)) ? clean(ctx.page) : clean(ctx.fileName || 'Unsorted'));
    return {
      kind: 'part',
      id: node.id, file: ctx.fileKey, fileName: ctx.fileName, page: clean(ctx.page),
      name: clean(name), title: partTitle(name), brand: brand,
      level: level, levelBy: by, part: type,
      fit: b.width >= 480 ? 'Full width' : b.width >= 240 ? 'Half width' : 'Small',
      variants: node.type === 'COMPONENT_SET' ? (node.children || []).length : 0,
      nodeType: node.type, where: ctx.path || '', folder: ctx.group || (ctx.level ? ctx.level : 'Loose parts'),
      w: Math.round(b.width), h: Math.round(b.height)
    };
  }

  /* ---------- Atomize: break emails into organisms, molecules and atoms ----------
     Reads the email's own layer tree (REST /nodes, depth 4). Emailify files map 1:1 onto Atomic Emails:
     🚣 rows = organisms (sections), 🏛️ columns in multi-column rows = molecules (containers),
     🔗 buttons, tags, logos, icons = atoms (elements). 🎁 wrappers are opened, except whole footers/headers.
     Other files: the email's full-width children are organisms, cards inside them are molecules.
     Identical parts (same name, size, structure and text) collapse into one, with a "used in" count. */
  var ORG_TYPES = [
    ['Announcement bar', /announcement|alert bar|pre-?header|ticker|top bar/i],
    ['Header & logo', /header|\blogo\b|\bnav\b|navigation|menu/i],
    ['Footer', /footer|unsubscribe|legal/i],
    ['Hero', /hero|banner|above the fold/i],
    ['Product grid', /product|klaviyo|feed|\bshop\b|catalog|collection/i],
    ['Reviews', /review|testimon|rating|social proof|trust ?pilot|\bugc\b/i],
    ['Discount code', /discount|coupon|promo code|c[oó]digo|voucher/i],
    ['Countdown', /countdown|timer/i],
    ['Articles & listicle', /article|blog|listicle/i],
    ['Bento', /bento/i],
    ['Video', /video|\bgif\b/i],
    ['Features & USPs', /\busps?\b|feature|icon|benefit|table|shipping|calendar|guarantee/i],
    ['Image gallery', /gallery|full image|\bimages?\b|photo|two images|captioned/i],
    ['Text & CTA', /title|paragraph|text|heading|headline|button|\bcta\b|copy|split/i],
    ['Custom code', /custom code|code block/i],
    ['Divider & spacer', /spacer|divider|separator/i]
  ];
  var GIFT = /\u{1F381}/u, ROW = /\u{1F6A3}/u, COL = /\u{1F3DB}/u, LINK = /\u{1F517}/u;
  function bare(name) { return clean(name).replace(/\((row|wrapper|wrapped)[^)]*\)/ig, '').replace(/\((for )?content (columns|elements)\)/ig, '').replace(/\s+/g, ' ').trim() || clean(name); }
  function kids(n) { return (n.children || []).filter(function (c) { return c.visible !== false; }); }
  function texts(n, out, d) { out = out || []; d = d || 0; if (n.type === 'TEXT' && n.characters) out.push(n.characters); if (d < 6) kids(n).forEach(function (c) { texts(c, out, d + 1); }); return out; }
  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  function fp(level, n) {
    var b = box(n), sig = kids(n).map(function (c) { return bare(c.name).toLowerCase().replace(/\d+/g, '#'); }).join(',');
    return level + '|' + bare(n.name).toLowerCase().replace(/\d+/g, '#') + '|' + Math.round(b.width / 2) + 'x' + Math.round(b.height / 2) + '|' + sig + '|' + hash(texts(n).join('¦').slice(0, 400));
  }
  function recipe(col) { // what a container holds: "Image + text + button"
    var has = {}, walk = function (n, d) { var nm = clean(n.name).toLowerCase(); if (n.type === 'TEXT') has.text = 1; else if (LINK.test(n.name) || /button|\bbtn\b|\bcta\b/.test(nm)) has.button = 1; else if (/image|img|photo|\u{1F4F7}/u.test(nm) || n.type === 'RECTANGLE') has.image = 1; else if (/table/.test(nm)) has.table = 1; if (d < 3) kids(n).forEach(function (c) { walk(c, d + 1); }); };
    kids(col).forEach(function (c) { walk(c, 0); });
    if (has.table) return 'Table';
    var parts = []; if (has.image) parts.push('Image'); if (has.text) parts.push('text'); if (has.button) parts.push('button');
    if (!parts.length) return 'Other';
    var s = parts.join(' + '); return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function atomize(email, meta) {
    var out = [], eb = box(email), W = eb.width || 600;
    function rec(n, level, type, extra) {
      var b = box(n);
      out.push(Object.assign({ kind: 'part', origin: 'email', id: n.id, file: meta.file, fileName: meta.fileName, brand: meta.brand, level: level, part: type,
        name: clean(n.name), title: bare(n.name), levelBy: 'layers', fit: b.width >= 480 ? 'Full width' : b.width >= 240 ? 'Half width' : 'Small',
        folder: meta.brand, where: meta.brand + ' / ' + meta.title, src: meta.title, srcId: meta.id, w: Math.round(b.width), h: Math.round(b.height),
        fp: (level === 'Atoms' ? meta.brand + '|' : '') + fp(level, n) }, extra || {})); // atoms carry brand styling: never merge across brands
    }
    function atoms(n, d) {
      kids(n).forEach(function (c) {
        var nm = clean(c.name).toLowerCase(), t = null;
        if (LINK.test(c.name) || /^(button|btn|cta)\b/.test(nm)) t = 'Button & CTA';
        else if (/\b(tag|badge|label|pill|sticker)\b/.test(nm) && c.type !== 'TEXT') t = 'Badge & label';
        else if (/\blogo\b/.test(nm) && c.type !== 'TEXT') t = 'Logo';
        else if (/social/.test(nm)) t = 'Social icons';
        if (t) { var lbl = texts(c)[0]; rec(c, 'Atoms', t, lbl ? { title: clean(lbl).slice(0, 40) } : null); } else if (d < 4 && c.type !== 'INSTANCE' && c.type !== 'TEXT') atoms(c, d + 1);
      });
    }
    function wrapperish(n) { return (GIFT.test(n.name) || /wrapper|layouts?\s*\//i.test(n.name)) && !/footer|header/i.test(bare(n.name)) && kids(n).some(function (k) { return k.type !== 'TEXT' && box(k).width >= W * 0.8; }); }
    function organism(n, d) {
      d = d || 0;
      if (d < 3 && wrapperish(n)) { kids(n).forEach(function (k) { if (k.type !== 'TEXT' && box(k).width >= W * 0.8) organism(k, d + 1); }); return; }
      var nm = bare(n.name), type = first(ORG_TYPES, nm);
      var cols = kids(n).filter(function (c) { return COL.test(c.name) || (/column/i.test(c.name)); });
      if (!cols.length) cols = kids(n).filter(function (c) { return c.type !== 'TEXT' && box(c).width < W * 0.6 && box(c).height > 40; });
      if (!type) {
        var rc = recipe(n);
        type = cols.length >= 2 ? (recipe(cols[0]).indexOf('button') > -1 && recipe(cols[0]).indexOf('Image') === 0 ? 'Product grid' : 'Image gallery')
          : rc === 'Image' ? 'Image gallery' : rc.indexOf('button') > -1 || rc.indexOf('text') > -1 || rc === 'Text' ? 'Text & CTA' : 'Other';
      }
      rec(n, 'Organisms', type);
      var chrome = /Footer|Header|Announcement/.test(type);
      if (cols.length >= 2 && !chrome) cols.forEach(function (c) { var r = recipe(c); rec(c, 'Molecules', r === 'Image + text + button' ? 'Card (image, text, button)' : r, { title: r + ' · ' + nm }); });
      atoms(n, 0);
    }
    kids(email).forEach(function (c) {
      if (c.type === 'TEXT' || c.type === 'VECTOR') return;
      var nm = bare(c.name), whole = /footer|header/i.test(nm);
      if (!whole && wrapperish(c)) organism(c, 0);
      else if (box(c).width >= W * 0.8) organism(c, 0);
    });
    return out;
  }
  // Collapse repeats; keep the first one and count where it was used.
  function dedupe(parts) {
    var by = {}, outp = [];
    parts.forEach(function (p) {
      var k = p.fp, hit = by[k];
      if (!hit) { p.uses = 1; p.srcs = [p.src]; p._ids = {}; p._ids[p.srcId] = 1; by[k] = p; outp.push(p); return; }
      if (!hit._ids[p.srcId]) { hit._ids[p.srcId] = 1; hit.uses++; if (hit.srcs.length < 6) hit.srcs.push(p.src); } // count each email once
    });
    outp.forEach(function (p) { delete p.fp; delete p._ids; p.usesBand = p.uses >= 20 ? '20+ emails' : p.uses >= 5 ? '5–19 emails' : p.uses >= 2 ? '2–4 emails' : '1 email'; });
    return outp;
  }

  /* ---------- walk a whole file ---------- */
  // Returns { items, sectionsToExpand } — SECTIONs whose children were cut off by the depth limit.
  function collect(file, fileKey) {
    var items = [], pending = [];
    var pages = (file.document && file.document.children) || [];
    pages.forEach(function (page) {
      var pl = levelBox(page.name), pp = pl || isPartsBox(page.name);
      walk(page.children || [], { fileKey: fileKey, fileName: file.name, page: page.name, pageCount: pages.length, container: null, parts: !!pp, level: pl, path: pp ? clean(page.name) : '' }, 0);
    });
    function walk(nodes, ctx, depth) {
      nodes.forEach(function (n) {
        if (n.visible === false) return;
        var nm = n.name || '', lvl = levelBox(nm), boxy = n.type === 'SECTION' || n.type === 'FRAME' || n.type === 'GROUP';
        var path = (ctx.path ? ctx.path + ' / ' : '') + clean(nm);
        if (ctx.parts) {
          // inside a parts area: sections, level/parts-named frames and frames holding components are containers
          var holder = n.type === 'SECTION' || (boxy && (lvl || isPartsBox(nm) || hasComponents(n)));
          if (holder) {
            var c1 = Object.assign({}, ctx, { level: lvl || ctx.level, path: path, group: lvl || isPartsBox(nm) || (ctx.group && / parts$/i.test(clean(nm))) ? ctx.group : clean(nm) }); // "Hero parts" grid inside the "Hero" group
            if (!n.children) { pending.push({ id: n.id, ctx: c1, name: n.name }); return; }
            if (depth < 6) walk(n.children, c1, depth + 1);
            return;
          }
          // a frame the API cut off (no children loaded) may be a folder of parts one level too deep
          // (Parts page > level section > type group > grid > components): open it before deciding
          if ((n.type === 'FRAME' || n.type === 'GROUP') && (!n.children || n.children.some(function (c) { return (c.type === 'FRAME' || c.type === 'GROUP') && !c.children; }))) { pending.push({ id: n.id, ctx: Object.assign({}, ctx, { path: path, group: clean(nm) }), name: n.name, self: true, pgroup: ctx.group }); return; }
          if (PART_NODES[n.type]) items.push(classifyPart(n, ctx));
          return;
        }
        if (boxy && (lvl || isPartsBox(nm)) && !emailSized(n)) {
          var c3 = Object.assign({}, ctx, { parts: true, level: lvl, path: path, pbrand: ctx.container && !GENERIC.test(clean(ctx.container)) ? clean(ctx.container) : null });
          if (!n.children) { pending.push({ id: n.id, ctx: c3, name: n.name }); return; }
          walk(n.children, c3, depth + 1); return;
        }
        if (emailSized(n)) { items.push(classify(n, ctx)); return; }
        if (n.type === 'COMPONENT' || n.type === 'COMPONENT_SET') { items.push(classifyPart(n, Object.assign({}, ctx, { pbrand: ctx.container && !GENERIC.test(clean(ctx.container)) ? clean(ctx.container) : null }))); return; }
        if (n.type === 'SECTION' || (n.type === 'FRAME' && depth === 0 && !emailSized(n)) || n.type === 'GROUP') {
          if (!n.children) { if (n.type === 'SECTION' || n.type === 'FRAME') pending.push({ id: n.id, ctx: ctx, name: n.name }); return; }
          var c2 = Object.assign({}, ctx, { container: n.type === 'SECTION' || depth === 0 ? (ctx.container && GENERIC.test(clean(n.name)) ? ctx.container : n.name) : ctx.container });
          if (depth < 4) walk(n.children, c2, depth + 1);
        }
      });
    }
    return { items: items, pending: pending, walk: function (nodes, ctx) { var before = items.length; walk(nodes, ctx, 1); return items.slice(before); } };
  }

  var API = { clean: clean, classify: classify, classifyPart: classifyPart, hasComponents: hasComponents, collect: collect, mergeBrands: mergeBrands, finalize: finalize, parseDate: parseDate, parseLang: parseLang, title: title, emailSized: emailSized, atomize: atomize, dedupe: dedupe, levelOf: levelOf, partTitle: partTitle,
    LEVELS: LEVELS.map(function (s) { return s[0]; }), PART_TYPES: PART_TYPES.map(function (s) { return s[0]; }).concat(['Other']),
    SECTIONS: SECTIONS.map(function (s) { return s[0]; }), FLOWS: FLOWS.map(function (s) { return s[0]; }), CATS: CATS.map(function (s) { return s[0]; }) };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.TAS = API;
})(this);
