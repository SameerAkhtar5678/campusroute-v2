/* CampusRoute 2 — shared state, the map, and everything you can do to it with a pointer.
   Panel views live in views.js; both halves talk through the single window.CR object. */
(function () {
  'use strict';
  var C = window.CRCore, NS = 'http://www.w3.org/2000/svg';
  var CR = window.CR = {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function lsGet(k, d) { try { var v = localStorage.getItem('cr2.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem('cr2.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function svgEl(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function uid(p) { return p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  CR.$ = $; CR.$$ = $$; CR.clamp = clamp; CR.uid = uid; CR.esc = esc; CR.svgEl = svgEl; CR.lsGet = lsGet; CR.lsSet = lsSet;

  // ───────── session state ─────────
  var S = CR.S = {
    mode: 'navigate', tab: 'route', tool: 'move', addType: 'gate',
    activeSlot: 'start', start: null, end: null, stops: [],
    route: null, idx: 0, playing: false, timer: null, watch: false,
    selNode: null, locked: false, pickRoad: null, pickNode: null,
    filter: 'all', adminTab: 'queue', undo: [], pendingType: null,
    composer: { text: '', photo: null, roadId: null }, qAbout: null, pickQ: false, qText: ''
  };

  // ───────── saved state ─────────
  CR.G = C.normalize(lsGet('graph', null) || C.defaultGraph());
  var rs = lsGet('rules', null);
  CR.rules = rs ? { mode: Object.assign({}, C.DEFAULT_RULES.mode, rs.mode || {}), minReports: +rs.minReports || 1, autoReopen: !!rs.autoReopen }
    : JSON.parse(JSON.stringify(C.DEFAULT_RULES));
  CR.kw = lsGet('kw', null) || {};
  CR.posts = lsGet('posts', null) || [];
  CR.activity = lsGet('act', null) || [];
  CR.designs = lsGet('designs', null) || [];
  CR.types = lsGet('types', null) || {};
  CR.author = lsGet('author', '') || '';
  CR.qs = lsGet('qs', null) || [];
  CR.role = lsGet('role', '') || '';
  CR.adminCode = lsGet('adminCode', '') || 'ADMIN2026';
  S.locked = !!lsGet('locked', false);
  S.composer.roadId = null;
  (function loadTrip() {
    var t = lsGet('trip', null) || {}, G = CR.G;
    S.start = t.start && C.nodeById(G, t.start) ? t.start : null;
    S.end = t.end && C.nodeById(G, t.end) ? t.end : null;
    S.stops = (t.stops || []).filter(function (id) { return !!C.nodeById(G, id); });
    S.activeSlot = t.activeSlot === 'start' ? 'start' : 'end';
    if (!S.start) S.activeSlot = 'start';
  })();

  // Places you can put on the map. glyph = one of the hand-drawn pictograms below or a lucide icon.
  var BUILTIN = CR.BUILTIN = {
    library: { name: 'Library', color: '#8b5cf6', glyph: 'library', pal: 'book-open' },
    lab: { name: 'Labs', color: '#3b82f6', glyph: 'lab', pal: 'flask-conical' },
    cafeteria: { name: 'Cafeteria', color: '#f59e0b', glyph: 'cafeteria', pal: 'utensils' },
    office: { name: 'Office', color: '#f472b6', glyph: 'office', pal: 'building-2' },
    junction: { name: 'Junction', color: '#22c55e', glyph: 'junction', r: 18, pal: 'circle-dot' },
    gate: { name: 'Gate', color: '#14b8a6', glyph: 'landmark' },
    hostel: { name: 'Hostel', color: '#6366f1', glyph: 'bed-double' },
    parking: { name: 'Parking', color: '#64748b', glyph: 'square-parking' },
    bus: { name: 'Bus stop', color: '#ca8a04', glyph: 'bus-front' },
    medical: { name: 'Health centre', color: '#ef4444', glyph: 'stethoscope' },
    sports: { name: 'Sports ground', color: '#0ea5e9', glyph: 'dumbbell' },
    store: { name: 'Shop', color: '#ec4899', glyph: 'store' }
  };
  CR.typeOf = function (n) { return (n && CR.types[n.type]) || BUILTIN[n && n.type] || BUILTIN.gate; };
  function radiusOf(n) { if (n.kind === 'cross') return 13; var t = CR.typeOf(n); return t.r || (t.img ? 29 : 30); }

  // The original campus pictograms.
  var LEGACY = {
    library: function (g) {   // roof + columns
      ol(svgEl('path', { d: 'M -7 -4 L 0 -9 L 7 -4 Z' }, g)); ol(svgEl('line', { x1: -7, y1: -4, x2: 7, y2: -4 }, g));
      [-5.4, -1.3, 2.8].forEach(function (x) { ol(svgEl('rect', { x: x, y: -2, width: 2.6, height: 9 }, g)); });
      ol(svgEl('line', { x1: -7, y1: 7, x2: 7, y2: 7 }, g)); ol(svgEl('line', { x1: -7, y1: 9, x2: 7, y2: 9 }, g));
    },
    lab: function (g) {       // flask
      ol(svgEl('path', { d: 'M -2 -9 L -2 -3 L -6.5 6 Q -7 8 -5 8 L 5 8 Q 7 8 6.5 6 L 2 -3 L 2 -9 Z' }, g));
      ol(svgEl('line', { x1: -3.5, y1: -9, x2: 3.5, y2: -9 }, g));
      so(svgEl('rect', { x: -4.6, y: 2, width: 9.2, height: 1.8, rx: 0.9 }, g)); so(svgEl('circle', { cx: 1.5, cy: 5, r: 1.2 }, g));
    },
    cafeteria: function (g) { // apple
      ol(svgEl('path', { d: 'M 0 -3 Q -6 -5 -6 1 Q -6 8 0 8 Q 6 8 6 1 Q 6 -5 0 -3 Z' }, g));
      ol(svgEl('path', { d: 'M 0 -3 Q 0 -6 0 -8' }, g)); so(svgEl('path', { d: 'M 0 -7 Q 4 -9 5 -6 Q 2 -4.5 0 -7 Z' }, g));
      so(svgEl('circle', { cx: -2, cy: 1, r: 1 }, g));
    },
    office: function (g) {    // building with a flag
      ol(svgEl('rect', { x: -6, y: -2, width: 12, height: 11, rx: 0.8 }, g));
      ol(svgEl('rect', { x: -3.8, y: 1, width: 2.4, height: 3.4 }, g)); ol(svgEl('rect', { x: 1.4, y: 1, width: 2.4, height: 3.4 }, g));
      ol(svgEl('rect', { x: -2, y: -6, width: 4, height: 3 }, g)); ol(svgEl('line', { x1: 0, y1: -9, x2: 0, y2: -2 }, g));
      so(svgEl('path', { d: 'M 0 -9 L 6 -7.5 L 0 -6 Z' }, g));
    },
    junction: function (g) {  // roundabout
      ol(svgEl('circle', { cx: 0, cy: 0, r: 5.2 }, g)); so(svgEl('circle', { cx: 0, cy: 0, r: 1.4 }, g));
      ol(svgEl('line', { x1: 0, y1: -9, x2: 0, y2: -5.2 }, g)); ol(svgEl('line', { x1: 0, y1: 5.2, x2: 0, y2: 9 }, g));
      ol(svgEl('line', { x1: -9, y1: 0, x2: -5.2, y2: 0 }, g)); ol(svgEl('line', { x1: 5.2, y1: 0, x2: 9, y2: 0 }, g));
    }
  };
  function ol(el) { el.setAttribute('class', 'ol'); return el; }
  function so(el) { el.setAttribute('class', 'so'); return el; }
  function pascal(k) { return k.split('-').map(function (s) { return s[0].toUpperCase() + s.slice(1); }).join(''); }

  function buildGlyph(n, R) {
    var t = CR.typeOf(n), g = svgEl('g', { class: 'glyph' });
    if (t.img) {
      var cp = svgEl('clipPath', { id: 'cp-' + n.id }, g);
      svgEl('circle', { r: R - 3 }, cp);
      svgEl('image', { href: t.img, x: -(R - 3), y: -(R - 3), width: 2 * (R - 3), height: 2 * (R - 3), preserveAspectRatio: 'xMidYMid slice', 'clip-path': 'url(#cp-' + n.id + ')' }, g);
      return g;
    }
    if (LEGACY[t.glyph]) {
      var s = Math.min(1.05, R / 32);
      LEGACY[t.glyph](svgEl('g', { transform: 'translate(0,' + (-R * 0.30) + ') scale(' + s + ')', color: t.color }, g));
      return g;
    }
    var ic = (window.lucide && lucide.icons) ? lucide.icons[pascal(t.glyph)] : null;
    if (ic) {
      var k = R / 31, ig = svgEl('g', { transform: 'translate(' + (-12 * k) + ',' + (-12 * k - R * 0.30) + ') scale(' + k + ')', color: t.color }, g);
      ic[2].forEach(function (nd) { ol(svgEl(nd[0], nd[1], ig)); });
      return g;
    }
    so(svgEl('circle', { r: 5 }, g));
    return g;
  }

  // ───────── the map ─────────
  var map = $('#map'), wrap = $('#wrap'), pop = $('#pop'), hint = $('#hint'), tools = $('#tools');
  var gGrid, gridRect, gRoads, gOver, gLabels, gPins, gNodes, gTop, draftLine, scalebar, sbLine, sbT1, sbT2, sbTxt;
  var roadEls = {}, nodeEls = {}, edgeEls = [];
  var view = { x: 0, y: 0, w: 960, h: 530 };

  function buildLayers() {
    var defs = svgEl('defs', {}, map), pat = svgEl('pattern', { id: 'gridp', width: 24, height: 24, patternUnits: 'userSpaceOnUse' }, defs);
    svgEl('circle', { cx: 1.2, cy: 1.2, r: 1.2, fill: '#ddd6c6' }, pat);
    gGrid = svgEl('g', {}, map); gridRect = svgEl('rect', { class: 'grid', fill: 'url(#gridp)', 'pointer-events': 'none' }, gGrid);
    gRoads = svgEl('g', {}, map); gOver = svgEl('g', {}, map); gLabels = svgEl('g', {}, map); gPins = svgEl('g', {}, map); gNodes = svgEl('g', {}, map);
    gTop = svgEl('g', { 'pointer-events': 'none' }, map);
    draftLine = svgEl('line', { class: 'draft', x1: 0, y1: 0, x2: 0, y2: 0 }, gTop); draftLine.style.display = 'none';
    scalebar = svgEl('g', { class: 'scalebar' }, gTop);
    sbLine = svgEl('line', { x1: 0, y1: 0, x2: 90, y2: 0 }, scalebar);
    sbT1 = svgEl('line', { x1: 0, y1: -5, x2: 0, y2: 5 }, scalebar); sbT2 = svgEl('line', { x1: 90, y1: -5, x2: 90, y2: 5 }, scalebar);
    sbTxt = svgEl('text', { x: 45, y: -9, 'text-anchor': 'middle' }, scalebar);
  }

  function roadD(r) {
    var d = '';
    r.pts.forEach(function (id) { var n = C.nodeById(CR.G, id); if (n) d += (d ? 'L' : 'M') + n.x.toFixed(1) + ' ' + n.y.toFixed(1); });
    return d;
  }

  function buildNode(n) {
    var R = radiusOf(n), t = CR.typeOf(n);
    var g = svgEl('g', { class: 'node', 'data-node': n.id }, gNodes);
    var ring = svgEl('circle', { class: 'ring', r: R + 7 }, g);
    var main = svgEl('circle', { class: 'main', r: R, stroke: t.color }, g);
    var glyph = buildGlyph(n, R); g.appendChild(glyph);
    var letter, sub = svgEl('text', { class: 'sub', y: R + 18, 'text-anchor': 'middle' }, g);
    if (t.img) {                                   // photo places: the label sits in a little tag on the photo
      letter = svgEl('text', { class: 'tag-code', x: R * 0.74, y: R * 0.74 + 4, 'text-anchor': 'middle' }, g);
    } else if (R >= 20) {
      letter = svgEl('text', { class: 'letter', y: R * 0.42 + 8, 'text-anchor': 'middle', 'font-size': Math.min(24, 13 + R * 0.25) }, g);
    }
    var bh = svgEl('g', { class: 'badge' }, g);
    var brect = svgEl('rect', { x: -30, y: -R - 26, width: 60, height: 20, rx: 10 }, bh);
    var btxt = svgEl('text', { y: -R - 12, 'text-anchor': 'middle' }, bh);
    svgEl('circle', { class: 'hit', r: R + 9 }, g);
    nodeEls[n.id] = { g: g, ring: ring, main: main, letter: letter, sub: sub, bh: bh, brect: brect, btxt: btxt, R: R };
  }

  function setBadge(p, label, kind) { p.bh.setAttribute('class', 'badge on b-' + kind); p.btxt.textContent = label; }

  function syncNode(n) {
    var p = nodeEls[n.id]; if (!p) return;
    p.g.setAttribute('transform', 'translate(' + n.x.toFixed(1) + ',' + n.y.toFixed(1) + ')');
    var si = S.stops.indexOf(n.id), cl = p.g.classList;
    cl.toggle('is-start', S.start === n.id); cl.toggle('is-end', S.end === n.id); cl.toggle('is-stop', si >= 0); cl.toggle('sel', S.selNode === n.id);
    if (S.start === n.id) setBadge(p, 'START', 'start');
    else if (S.end === n.id) setBadge(p, 'END', 'end');
    else if (si >= 0) setBadge(p, 'STOP ' + (si + 1), 'stop');
    else p.bh.setAttribute('class', 'badge');
    if (p.letter) p.letter.textContent = n.code;
    p.sub.textContent = n.name;
  }

  function pins() {
    gPins.innerHTML = '';
    if (!CR.posts.length) return;
    var byRoad = {}, order = ['closure', 'hazard', 'works', 'event', 'clear', 'info'];
    CR.posts.forEach(function (p) { if (p.roadId) (byRoad[p.roadId] = byRoad[p.roadId] || []).push(p); });
    Object.keys(byRoad).forEach(function (rid) {
      var r = C.roadById(CR.G, rid); if (!r) return;
      var list = byRoad[rid], top = list.slice().sort(function (a, b) { return order.indexOf(a.cat) - order.indexOf(b.cat); })[0];
      var m = C.roadMid(CR.G, r), g = svgEl('g', { class: 'pin cat-' + top.cat, 'data-road': rid, transform: 'translate(' + m.x.toFixed(1) + ',' + (m.y - 34).toFixed(1) + ')' }, gPins);
      svgEl('line', { x1: 0, y1: 11, x2: 0, y2: 23 }, g); svgEl('circle', { r: 11 }, g);
      if (list.length > 1) { var t = svgEl('text', { y: 4 }, g); t.textContent = list.length; }
      else svgEl('circle', { r: 3.5, class: 'pin-dot' }, g);
    });
  }

  function syncGraph() {
    var G = CR.G;
    G.roads.forEach(function (r) {
      var p = roadEls[r.id]; if (!p) return;
      var d = roadD(r);
      [p.cas, p.asp, p.dsh, p.hit].forEach(function (el) { el.setAttribute('d', d); });
      p.g.classList.toggle('is-blocked', !!r.blocked);
    });
    edgeEls.forEach(function (o) {
      var A = C.nodeById(G, o.e.a), B = C.nodeById(G, o.e.b); if (!A || !B) return;
      ['tent', 'base', 'flow'].forEach(function (k) { o[k].setAttribute('x1', A.x); o[k].setAttribute('y1', A.y); o[k].setAttribute('x2', B.x); o[k].setAttribute('y2', B.y); });
      var short = C.dist(A.x, A.y, B.x, B.y) < 40, s = C.edgeMeters(G, A.id, B.id) + ' m', w = s.length * 7.6 + 16;
      o.lbl.style.display = short ? 'none' : '';
      o.lbl.setAttribute('transform', 'translate(' + ((A.x + B.x) / 2).toFixed(1) + ',' + ((A.y + B.y) / 2).toFixed(1) + ')');
      o.lr.setAttribute('width', w); o.lr.setAttribute('x', -w / 2); o.lt.textContent = s;
      var rr = C.roadById(G, o.e.road);
      o.lbl.classList.toggle('is-blocked', !!(rr && rr.blocked));
    });
    G.nodes.forEach(syncNode);
    pins();
  }

  function renderGraph() {
    gRoads.innerHTML = ''; gOver.innerHTML = ''; gLabels.innerHTML = ''; gPins.innerHTML = ''; gNodes.innerHTML = '';
    roadEls = {}; nodeEls = {}; edgeEls = [];
    CR.G.roads.forEach(function (r) {
      var g = svgEl('g', { class: 'road', 'data-road': r.id }, gRoads);
      roadEls[r.id] = { g: g, cas: svgEl('path', { class: 'road-casing' }, g), asp: svgEl('path', { class: 'road-asphalt' }, g), dsh: svgEl('path', { class: 'road-dashes' }, g), hit: svgEl('path', { class: 'road-hit' }, g) };
    });
    C.edgesOf(CR.G).forEach(function (e) {
      var og = svgEl('g', {}, gOver), lbl = svgEl('g', { class: 'road-lbl', 'data-road': e.road }, gLabels);
      edgeEls.push({
        e: e, lbl: lbl,
        tent: svgEl('line', { class: 'road-tent' }, og), base: svgEl('line', { class: 'road-base' }, og), flow: svgEl('line', { class: 'road-flow' }, og),
        lr: svgEl('rect', { class: 'rl-rect', x: -24, y: -11, width: 48, height: 22, rx: 11 }, lbl),
        lt: svgEl('text', { class: 'rl-txt', y: 4, 'text-anchor': 'middle' }, lbl),
        lx: svgEl('text', { class: 'rl-x', y: -17, 'text-anchor': 'middle' }, lbl)
      });
    });
    edgeEls.forEach(function (o) { o.lx.textContent = '⛔'; });
    CR.G.nodes.forEach(buildNode);
    syncGraph(); paintRoute();
  }

  // ───────── route picture ─────────
  function overlayOf(e) {
    return edgeEls.filter(function (o) { return o.e.road === e.road && o.e.a === e.a && o.e.b === e.b; })[0] || null;
  }
  function showEdge(o, k, on) { o[k].style.display = on ? '' : 'none'; }
  function clearOverlays() { edgeEls.forEach(function (o) { showEdge(o, 'tent', false); showEdge(o, 'base', false); showEdge(o, 'flow', false); }); }
  function routeEdges() {
    var out = [];
    (S.route ? S.route.steps : []).forEach(function (st) {
      if (st.t !== 'done' || !st.found) return;
      st.path.slice(0, -1).forEach(function (id, i) { var e = C.edgeBetween(CR.G, id, st.path[i + 1]); if (e && out.indexOf(e) < 0) out.push(e); });
    });
    return out;
  }
  function paintRoute() {
    clearOverlays();
    if (S.watch && S.route && S.route.ok) { applyStep(); return; }
    var on = {};
    routeEdges().forEach(function (e) { var o = overlayOf(e); if (o) { showEdge(o, 'base', true); showEdge(o, 'flow', true); on[e.a] = on[e.b] = 1; } });
    CR.G.nodes.forEach(function (n) {
      var e = nodeEls[n.id]; if (!e) return;
      e.g.classList.remove('visited', 'current'); e.g.classList.toggle('onroute', !!on[n.id]);
    });
    CR.lastStep = null;
  }

  // Replay the log up to step S.idx on the map, and hand the log / table HTML to the panel.
  function applyStep() {
    if (!S.route || !S.route.steps.length) return;
    S.idx = clamp(S.idx, 0, S.route.steps.length - 1);
    clearOverlays();
    var G = CR.G, log = [], prevCur = {}, legSrc = null, legDst = null, visited = {}, routeE = [], tentE = [], cur = null;
    for (var s = 0; s <= S.idx; s++) {
      var st = S.route.steps[s], cls = 'lg-dim';
      if (st.t === 'leg') { prevCur = {}; legSrc = st.src; legDst = st.dst; cls = 'lg-leg'; }
      else if (st.t === 'init') cls = 'lg-init';
      else if (st.t === 'pick') { visited[st.node] = 1; cls = 'lg-pick'; if (s === S.idx) cur = st.node; }
      else if (st.t === 'relax') { if (st.improved) { prevCur[st.to] = st.from; cls = 'lg-relax'; } }
      else if (st.t === 'blocked' || st.t === 'stuck') cls = 'lg-block';
      else if (st.t === 'done') {
        cls = st.found ? 'lg-done' : 'lg-block';
        if (st.found) st.path.slice(0, -1).forEach(function (id, q) { var e = C.edgeBetween(G, id, st.path[q + 1]); if (e && routeE.indexOf(e) < 0) routeE.push(e); });
      }
      log.push('<div class="' + cls + '">' + esc(st.text) + '</div>');
    }
    Object.keys(prevCur).forEach(function (v) { var e = C.edgeBetween(G, prevCur[v], v); if (e && tentE.indexOf(e) < 0) tentE.push(e); });
    tentE.forEach(function (e) { var o = overlayOf(e); if (o) showEdge(o, 'tent', true); });
    routeE.forEach(function (e) { var o = overlayOf(e); if (o) { showEdge(o, 'base', true); showEdge(o, 'flow', true); } });
    var on = {};
    routeE.forEach(function (e) { on[e.a] = on[e.b] = 1; });
    G.nodes.forEach(function (n) {
      var e = nodeEls[n.id]; if (!e) return;
      var cl = e.g.classList;
      cl.toggle('visited', !!visited[n.id]); cl.toggle('onroute', !!on[n.id]); cl.toggle('current', cur === n.id);
    });
    CR.lastStep = { log: log.join(''), snap: S.route.steps[S.idx].snap, legSrc: legSrc, legDst: legDst, i: S.idx, n: S.route.steps.length };
  }

  function recompute() {
    setPlaying(false);
    if (S.start && S.end && S.start !== S.end) {
      S.route = C.planRoute(CR.G, [S.start].concat(S.stops, [S.end]));
      S.idx = S.route.steps.length - 1;
    } else S.route = null;
    if (!S.route || !S.route.ok) S.watch = false;
    paintRoute(); syncGraph(); saveTrip();
  }
  CR.recompute = recompute;
  function saveTrip() { lsSet('trip', { start: S.start, end: S.end, stops: S.stops, activeSlot: S.activeSlot }); }
  CR.saveGraph = function () { lsSet('graph', CR.G); };

  function setPlaying(on) {
    S.playing = !!on;
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
    if (S.playing) S.timer = setInterval(function () {
      if (!S.route || S.idx >= S.route.steps.length - 1) { setPlaying(false); CR.refreshAlgo(); return; }
      S.idx++; applyStep(); CR.refreshAlgo();
    }, 620);
  }
  function needRoute() { if (!S.route || !S.route.ok) { CR.toast(S.route ? 'There is no open route to replay — open a road first' : 'Tap two places on the map first'); return true; } return false; }
  CR.play = function () {
    if (needRoute()) return;
    S.watch = true; S.idx = 0; applyStep(); S.tab = 'algo'; CR.renderPanel(); setPlaying(true);
  };
  CR.togglePlay = function () {
    if (needRoute()) return;
    if (!S.watch) { CR.play(); return; }
    if (!S.playing && S.idx >= S.route.steps.length - 1) S.idx = 0;
    setPlaying(!S.playing); if (S.playing) { applyStep(); CR.refreshAlgo(); } else CR.refreshAlgo();
  };
  CR.step = function () { if (needRoute()) return; setPlaying(false); S.watch = true; if (S.idx < S.route.steps.length - 1) S.idx++; applyStep(); CR.refreshAlgo(); };
  CR.skip = function () { if (needRoute()) return; setPlaying(false); S.watch = true; S.idx = S.route.steps.length - 1; applyStep(); CR.refreshAlgo(); };
  CR.restart = function () { if (needRoute()) return; setPlaying(false); S.watch = true; S.idx = 0; applyStep(); CR.refreshAlgo(); };

  function tapNode(id) {
    var other = S.activeSlot === 'start' ? S.end : S.start;
    if (id === other && other) { var os = S.start; S.start = S.end; S.end = os; }
    else if (S.activeSlot === 'start') S.start = id; else S.end = id;
    S.stops = S.stops.filter(function (s) { return s !== S.start && s !== S.end; });
    if (S.activeSlot === 'start' && !S.end) S.activeSlot = 'end';
    recompute(); CR.renderPanel();
  }

  // ───────── design edits ─────────
  function pushUndo() {
    S.undo.push(JSON.stringify({ nodes: CR.G.nodes, roads: CR.G.roads }));
    if (S.undo.length > 40) S.undo.shift();
    syncTools();
  }
  function cleanTrip() {
    var G = CR.G;
    ['start', 'end'].forEach(function (k) { if (S[k] && !C.nodeById(G, S[k])) S[k] = null; });
    S.stops = S.stops.filter(function (id) { return !!C.nodeById(G, id); });
    if (S.selNode && !C.nodeById(G, S.selNode)) S.selNode = null;
  }
  function afterChange() {
    cleanTrip(); S.watch = false; CR.saveGraph(); recompute(); renderGraph(); CR.renderPanel(); syncHint();
  }
  function mkCross(x, y) {
    var n = { id: uid('n'), code: C.nextCode(CR.G, 'X'), name: 'Crossing', type: 'junction', x: x, y: y, kind: 'cross' };
    CR.G.nodes.push(n); return n;
  }
  function settle() { C.resolveCrossings(CR.G, false); return C.planarize(CR.G, mkCross).length; }
  function uniqueName(base) {
    var names = {}; CR.G.nodes.forEach(function (n) { names[n.name] = 1; });
    if (!names[base]) return base;
    for (var i = 2; ; i++) if (!names[base + ' ' + i]) return base + ' ' + i;
  }
  function nearestNode(pt, maxD) {
    var best = null, bd = maxD;
    CR.G.nodes.forEach(function (n) { var d = C.dist(pt.x, pt.y, n.x, n.y); if (d < bd) { bd = d; best = n; } });
    return best;
  }
  function nearestRoad(pt, maxD) {
    var best = null, bd = maxD;
    CR.G.roads.forEach(function (r) { var q = C.nearestOnRoad(CR.G, r, pt.x, pt.y); if (q && q.d < bd) { bd = q.d; best = { road: r, q: q }; } });
    return best;
  }
  CR.undo = function () {
    if (!S.undo.length) { CR.toast('Nothing to undo'); return; }
    var d = JSON.parse(S.undo.pop());
    CR.G.nodes = d.nodes; CR.G.roads = d.roads; S.selNode = null;
    afterChange(); syncTools();
  };
  CR.pushUndo = pushUndo; CR.settle = settle; CR.afterChange = afterChange; CR.eraseNode = eraseNode; CR.fitView = fitView; CR.renderGraph = renderGraph; CR.syncGraph = syncGraph;

  function placeNode(x, y) {
    var t = CR.typeOf({ type: S.addType }), R = t.r || (t.img ? 29 : 30);
    pushUndo();
    var n = { id: uid('n'), code: C.nextCode(CR.G), name: uniqueName(t.name), type: S.addType, x: x, y: y };
    n.x = clamp(x, view.x + R + 10, view.x + view.w - R - 10); n.y = clamp(y, view.y + R + 10, view.y + view.h - R - 30);
    CR.G.nodes.push(n); S.selNode = n.id;
    settle();
    afterChange();
    var on = CR.G.roads.filter(function (r) { return r.pts.indexOf(n.id) >= 0; });
    nodeEls[n.id] && nodeEls[n.id].g.classList.add('pop');
    CR.toast(t.name + ' added' + (on.length ? ' and connected to ' + C.roadName(CR.G, on[0]) : ' — draw a road to link it to the others'));
  }
  function addJunction(x, y) {
    var n = { id: uid('n'), code: C.nextCode(CR.G, 'J'), name: 'Junction', type: 'junction', x: x, y: y };
    CR.G.nodes.push(n); return n;
  }
  function eraseNode(n) {
    if (n.kind === 'cross') { CR.toast('This junction exists because two roads cross — erase a road to remove it'); return; }
    pushUndo(); C.deleteNode(CR.G, n.id); settle(); afterChange();
    CR.toast(n.name + ' deleted · <u data-act="undo">Undo</u>');
  }
  function eraseRoad(r) {
    var nm = C.roadName(CR.G, r);
    pushUndo(); C.deleteRoad(CR.G, r.id); settle(); afterChange();
    CR.toast('Road ' + nm + ' erased · <u data-act="undo">Undo</u>');
  }
  function finishDraft(p, ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY), pt = svgPoint(ev);
    var nEl = el && el.closest ? el.closest('g.node') : null;
    var target = nEl ? C.nodeById(CR.G, nEl.getAttribute('data-node')) : nearestNode(pt, 24);
    if (target && target.id === p.from) return;
    var G = CR.G, before = G.nodes.map(function (n) { return n.id; });
    var from = p.from ? C.nodeById(G, p.from) : addJunction(p.x0, p.y0);
    var to = target;
    if (!to) {
      var rEl = el && el.closest ? el.closest('[data-road]') : null;
      var onRoad = rEl ? { road: C.roadById(G, rEl.getAttribute('data-road')) } : nearestRoad(pt, C.SNAP);
      var q = onRoad && onRoad.road ? C.nearestOnRoad(G, onRoad.road, pt.x, pt.y) : null;
      to = q ? addJunction(q.x, q.y) : addJunction(pt.x, pt.y);
    }
    var dup = C.edgeBetween(G, from.id, to.id);
    if (dup) {
      G.nodes = G.nodes.filter(function (n) { return before.indexOf(n.id) >= 0; });
      var dg = roadEls[dup.road]; if (dg) { dg.g.classList.add('flash'); setTimeout(function () { dg.g.classList.remove('flash'); }, 1300); }
      CR.toast('Those places are already joined by road ' + C.roadName(G, C.roadById(G, dup.road)));
      return;
    }
    pushUndo();
    var road = { id: uid('r'), pts: [from.id, to.id], blocked: false, meta: null };
    G.roads.push(road);
    var made = settle();
    afterChange();
    CR.toast(made ? 'Road added — ' + made + ' junction' + (made > 1 ? 's' : '') + ' appeared where the roads cross' : 'Road ' + C.roadName(G, road) + ' added');
  }

  CR.setBlocked = function (roadId, on, meta) {
    var r = C.roadById(CR.G, roadId); if (!r) return;
    r.blocked = !!on; r.meta = on ? (meta || { by: 'manual', ts: Date.now() }) : null;
    CR.saveGraph(); recompute(); renderGraph(); CR.renderPanel();
  };

  // ───────── pointer ─────────
  var ptr = null;
  function svgPoint(ev) {
    var pt = map.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    var m = map.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }
  function targetAt(ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    var nEl = el && el.closest ? el.closest('g.node') : null, rEl = el && el.closest ? el.closest('[data-road]') : null;
    return { node: nEl ? C.nodeById(CR.G, nEl.getAttribute('data-node')) : null, road: rEl ? C.roadById(CR.G, rEl.getAttribute('data-road')) : null };
  }
  function clearSnap() { Object.keys(nodeEls).forEach(function (k) { nodeEls[k].g.classList.remove('snap'); }); }

  function onDown(ev) {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    closePop();
    var pt = svgPoint(ev), tg = targetAt(ev), design = S.mode === 'design';
    ptr = { cx: ev.clientX, cy: ev.clientY, pt: pt, moved: false, type: 'idle', node: tg.node, road: tg.road };
    try { map.setPointerCapture(ev.pointerId); } catch (e) {}
    if (design && !S.locked && S.tool === 'move' && tg.node && tg.node.kind !== 'cross') {
      pushUndo();                      // moving a place is undoable
      ptr.type = 'drag'; ptr.offX = tg.node.x - pt.x; ptr.offY = tg.node.y - pt.y;
    } else if (design && !S.locked && S.tool === 'road') {
      ptr.type = 'draft'; ptr.from = tg.node ? tg.node.id : null;
      ptr.x0 = tg.node ? tg.node.x : pt.x; ptr.y0 = tg.node ? tg.node.y : pt.y;
      draftLine.setAttribute('x1', ptr.x0); draftLine.setAttribute('y1', ptr.y0);
      draftLine.setAttribute('x2', pt.x); draftLine.setAttribute('y2', pt.y); draftLine.style.display = '';
    }
    if (ev.pointerType !== 'mouse') ev.preventDefault();
  }
  function onMove(ev) {
    if (!ptr) return;
    var pt = svgPoint(ev);
    if (C.dist(ev.clientX, ev.clientY, ptr.cx, ptr.cy) > 4) ptr.moved = true;
    if (ptr.type === 'drag' && ptr.node) {
      var n = ptr.node, R = radiusOf(n);
      n.x = clamp(pt.x + ptr.offX, view.x + R + 6, view.x + view.w - R - 6);
      n.y = clamp(pt.y + ptr.offY, view.y + R + 6, view.y + view.h - R - 26);
      C.resolveCrossings(CR.G, true);     // crossings slide along with the road while dragging
      syncGraph(); paintRoute();
    } else if (ptr.type === 'draft') {
      var tg = targetAt(ev), snap = tg.node && tg.node.id !== ptr.from ? tg.node : null;
      var ex = pt.x, ey = pt.y;
      if (snap) { ex = snap.x; ey = snap.y; }
      clearSnap(); if (snap) nodeEls[snap.id].g.classList.add('snap');
      draftLine.setAttribute('x2', ex); draftLine.setAttribute('y2', ey);
    } else if (ptr.type === 'idle' && ptr.moved) { ptr.type = 'pan'; ptr.vx = view.x; ptr.vy = view.y; }
    if (ptr.type === 'pan') {
      var sc = (map.clientWidth || 960) / view.w;
      view.x = ptr.vx - (ev.clientX - ptr.cx) / sc; view.y = ptr.vy - (ev.clientY - ptr.cy) / sc; applyView();
    }
  }
  function onUp(ev) {
    var p = ptr; ptr = null;
    draftLine.style.display = 'none'; clearSnap();
    if (!p) return;
    if (p.type === 'drag') {
      if (!p.moved) { S.undo.pop(); syncTools(); }   // a plain tap is not an edit
      var made = settle(); afterChange();
      if (made) CR.toast(made + ' junction' + (made > 1 ? 's' : '') + ' appeared where the roads cross');
      return;
    }
    if (p.type === 'draft') { finishDraft(p, ev); return; }
    if (p.type === 'pan' && p.moved) return;
    handleClick(targetAt(ev), svgPoint(ev), ev);
  }
  function handleClick(tg, pt, ev) {
    if (S.pickRoad) {
      var cb = S.pickRoad; S.pickRoad = null; syncHint();
      if (tg.road) cb(tg.road.id); else CR.toast('Tap directly on a road');
      CR.renderPanel(); return;
    }
    if (S.pickQ) {
      S.pickQ = false; syncHint();
      if (tg.node) S.qAbout = tg.node.id; else CR.toast('Tap one of the places on the map');
      CR.renderPanel(); return;
    }
    if (S.pickNode) {
      var cn = S.pickNode; S.pickNode = null; syncHint();
      if (tg.node) cn(tg.node.id); else CR.toast('Tap one of the places on the map');
      CR.renderPanel(); return;
    }
    if (S.mode === 'design') {
      if (S.locked) { CR.toast('The layout is locked — unlock it to edit'); return; }
      if (S.tool === 'move') { S.selNode = tg.node ? tg.node.id : null; syncGraph(); CR.renderPanel(); return; }
      if (S.tool === 'add') { if (tg.node) { CR.toast('There is already a place there'); return; } if (pt) placeNode(pt.x, pt.y); return; }
      if (S.tool === 'erase') { if (tg.node) eraseNode(tg.node); else if (tg.road) eraseRoad(tg.road); return; }
      return;
    }
    if (S.mode === 'questions') { S.qAbout = tg.node ? tg.node.id : null; S.pickQ = false; syncHint(); CR.renderPanel(); return; }
    if (tg.node) { tapNode(tg.node.id); return; }
    if (tg.road) { showRoadPop(tg.road, ev.clientX, ev.clientY); return; }
    if (S.mode === 'navigate') { S.activeSlot = S.start ? 'end' : 'start'; CR.renderPanel(); }
  }
  CR.cancelPick = function () { S.pickRoad = null; S.pickNode = null; S.pickQ = false; syncHint(); CR.renderPanel(); };

  // ───────── road popover ─────────
  function byText(meta) {
    if (!meta) return '';
    return meta.by === 'auto' ? (meta.confirmed ? 'closed on a report, confirmed by the admin' : 'closed automatically on a report — not yet confirmed')
      : meta.by === 'admin' ? 'closed by the admin' : 'closed by hand';
  }
  function showRoadPop(r, cx, cy) {
    var G = CR.G, wr = wrap.getBoundingClientRect();
    var reports = CR.posts.filter(function (p) { return p.roadId === r.id; }), last = reports[0];
    var html = '<div class="poph"><b>' + esc(C.roadTitle(G, r)) + '</b><button class="xbtn" data-act="closepop" aria-label="Close"><i data-lucide="x"></i></button></div>' +
      '<div class="popm">' + esc(C.roadName(G, r)) + ' · ' + C.meters(C.roadPx(G, r)) + ' m · ' + (r.blocked ? 'closed' : 'open') + '</div>' +
      (r.blocked ? '<div class="popn">' + esc(byText(r.meta)) + '</div>' : '') +
      (last ? '<div class="popq">“' + esc(last.text) + '”<small>' + esc(last.author) + ' · ' + CR.ago(last.ts) + '</small></div>' : '') +
      '<div class="row">';
    if (S.mode === 'live') html += '<button class="btn sm primary" data-act="popreport" data-id="' + r.id + '"><i data-lucide="megaphone"></i>Report on this road</button>';
    else html += '<button class="btn sm ' + (r.blocked ? 'safe' : 'danger') + '" data-act="popblock" data-id="' + r.id + '"><i data-lucide="' + (r.blocked ? 'unlock' : 'ban') + '"></i>' + (r.blocked ? 'Reopen road' : 'Close road') + '</button>';
    html += '</div>';
    pop.innerHTML = html; pop.hidden = false; CR.icons();
    var left = clamp(cx - wr.left + 12, 8, wr.width - pop.offsetWidth - 8), top = clamp(cy - wr.top + 12, 8, wr.height - pop.offsetHeight - 8);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
  }
  function closePop() { pop.hidden = true; }
  CR.closePop = closePop;

  // ───────── view (pan + zoom) ─────────
  function aspect() { return (map.clientWidth || 960) / Math.max(1, map.clientHeight || 530); }
  function applyView() {
    map.setAttribute('viewBox', view.x.toFixed(1) + ' ' + view.y.toFixed(1) + ' ' + view.w.toFixed(1) + ' ' + view.h.toFixed(1));
    ['x', 'y', 'width', 'height'].forEach(function (k) { gridRect.setAttribute(k, view[{ x: 'x', y: 'y', width: 'w', height: 'h' }[k]].toFixed(1)); });
    var sc = (map.clientWidth || 960) / view.w;
    var m = [5, 10, 20, 50, 100, 200, 500].filter(function (x) { return x * C.PX_PER_M * sc >= 64; })[0] || 500, len = m * C.PX_PER_M;
    sbLine.setAttribute('x2', len); sbT2.setAttribute('x1', len); sbT2.setAttribute('x2', len);
    sbT1.setAttribute('x1', len / 2); sbT1.setAttribute('x2', len / 2);
    sbTxt.setAttribute('x', len / 2); sbTxt.textContent = m + ' m';
    scalebar.setAttribute('transform', 'translate(' + (view.x + 22).toFixed(1) + ',' + (view.y + view.h - 20).toFixed(1) + ')');
  }
  function fitView() {
    var b = C.bounds(CR.G) || { x: 40, y: 40, w: 880, h: 450 }, pad = 70, asp = aspect();
    var vw = Math.max(b.w + pad * 2, (b.h + pad * 2) * asp), vh = vw / asp;
    if (vh < 300) { vh = 300; vw = vh * asp; }
    view = { x: b.x + b.w / 2 - vw / 2, y: b.y + b.h / 2 - vh / 2, w: vw, h: vh };
    applyView();
  }
  function zoomBy(f, cx, cy) {
    var pt = map.createSVGPoint(); pt.x = cx; pt.y = cy;
    var m = map.getScreenCTM(); if (!m) return;
    pt = pt.matrixTransform(m.inverse());
    var nh = clamp(view.h / f, 170, 1800), k = nh / view.h, nw = view.w * k;
    view = { x: pt.x - (pt.x - view.x) * k, y: pt.y - (pt.y - view.y) * k, w: nw, h: nh };
    applyView();
  }
  function centre() { var r = map.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  function onResize() {
    var b = C.bounds(CR.G);
    if (!b) return;
    var fits = b.x - 40 >= view.x && b.y - 40 >= view.y && b.x + b.w + 40 <= view.x + view.w && b.y + b.h + 60 <= view.y + view.h;
    if (!fits) { fitView(); return; }
    var cx = view.x + view.w / 2; view.w = view.h * aspect(); view.x = cx - view.w / 2; applyView();
  }

  // ───────── chrome ─────────
  function syncHint() {
    var t;
    if (S.pickQ) t = '<b>Tap a place</b> to ask about it · Esc to cancel';
    else if (S.pickRoad) t = '<b>Pick a road</b> for this report — tap one on the map · Esc to cancel';
    else if (S.pickNode) t = '<b>Tap a place</b> to add it as a stop · Esc to cancel';
    else if (S.mode === 'navigate') t = !S.start ? '<b>Tap the map where you are</b> — the route appears the moment you tap where you’re going'
      : !S.end ? '<b>Now tap where you’re going</b>'
      : '<b>Tap another place</b> to change the trip · tap a road to close or reopen it';
    else if (S.mode === 'design') t = {
      move: S.locked ? '<b>Layout locked</b> — nothing can be moved or erased' : '<b>Drag places</b> to move them · tap one to rename or delete it',
      add: '<b>Tap the map</b> to place a ' + esc(CR.typeOf({ type: S.addType }).name) + ' — drop it on a road to connect it',
      road: S.locked ? '<b>Layout locked</b> — unlock it to draw roads' : '<b>Drag from one place to another</b> to draw a road — wherever roads cross, a junction appears',
      erase: S.locked ? '<b>Layout locked</b> — unlock it to erase' : '<b>Tap a place or a road</b> to remove it'
    }[S.tool];
    else if (S.mode === 'live') t = '<b>Reports show up on the roads</b> · tap a road to read or add an update';
    else if (S.mode === 'questions') t = '<b>Tap any place</b> on the map to make your question about it';
    else t = '<b>Red roads are closed</b> · every decision is listed on the right';
    hint.innerHTML = t;
    wrap.className = 'map-wrap mode-' + S.mode + ' tool-' + S.tool + (S.pickRoad ? ' picking' : '') + (S.pickNode ? ' picking-node' : '');
  }
  function syncTools() {
    $$('#tools [data-tool]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tool') === S.tool); });
    var lb = $('#lockbtn'); if (lb) { lb.innerHTML = '<i data-lucide="' + (S.locked ? 'lock' : 'lock-open') + '"></i>'; lb.classList.toggle('on', S.locked); lb.title = S.locked ? 'Unlock layout' : 'Lock layout'; }
    var ub = $('#undobtn'); if (ub) ub.classList.toggle('dim', !S.undo.length);
    CR.icons();
  }
  CR.syncHint = syncHint; CR.syncTools = syncTools;

  CR.setMode = function (m) {
    if ((m === 'design' || m === 'admin') && CR.role !== 'admin') m = 'navigate';
    if (S.mode === m) return;
    S.mode = m; S.pickRoad = null; S.pickNode = null; S.selNode = null;
    setPlaying(false); closePop();
    if (m === 'navigate' && S.watch) setPlaying(false);
    $$('#modes .mode').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === m); });
    tools.hidden = m !== 'design';
    syncGraph(); CR.renderPanel(); syncHint();
  };

  CR.applyRole = function () {
    var admin = CR.role === 'admin';
    $$('#modes .mode').forEach(function (b) {
      var m = b.getAttribute('data-mode');
      b.hidden = !admin && (m === 'design' || m === 'admin');
    });
    var rb = $('#rolebtn');
    if (rb) {
      rb.hidden = !CR.role;
      rb.innerHTML = admin ? '<i data-lucide="shield"></i><b>Admin</b> · Sign out' : '<i data-lucide="user"></i><b>Citizen</b> · Sign out';
    }
    var g = $('#gate'); if (g) g.hidden = !!CR.role;
    if (!admin && (S.mode === 'design' || S.mode === 'admin')) S.mode = 'navigate';
    $('#tools').hidden = S.mode !== 'design';
    CR.icons(); CR.renderPanel(); syncHint();
  };

  CR.icons = function () {
    if (!window.lucide || !lucide.createIcons || !lucide.icons) return;
    try { lucide.createIcons({ icons: lucide.icons, attrs: { width: 16, height: 16 } }); } catch (e) {}
  };

  CR.toast = function (msg, kind, fn) {
    var box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast' + (kind ? ' t-' + kind : '');
    el.innerHTML = msg;
    if (fn) { el.classList.add('click'); el.addEventListener('click', function (e) { if (e.target.closest('[data-act="undo"]')) return; fn(); el.remove(); }); }
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 320); }, fn ? 7000 : 3600);
  };

  $('#toasts').addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-act="undo"]') : null; if (!a) return;
    CR.undo(); var t = a.closest('.toast'); if (t) t.remove();
  });
  // ───────── persistence + other tabs ─────────
  CR.persist = function () {
    if (lsSet('posts', CR.posts) && lsSet('act', CR.activity) && lsSet('rules', CR.rules) && lsSet('kw', CR.kw) && lsSet('qs', CR.qs) && lsSet('adminCode', CR.adminCode)) return;
    var keep = 3;                                     // storage full: keep the three newest photos
    CR.posts.forEach(function (p) { if (p.photo) { if (keep > 0) keep--; else delete p.photo; } });
    lsSet('posts', CR.posts); lsSet('act', CR.activity); lsSet('rules', CR.rules); lsSet('kw', CR.kw); lsSet('qs', CR.qs); lsSet('adminCode', CR.adminCode);
    CR.toast('Storage on this device was full — older report photos were removed', 'warn');
  };
  CR.afterBlocksChanged = function () { CR.saveGraph(); recompute(); renderGraph(); CR.renderPanel(); CR.share(); };

  var bc = null; try { bc = new BroadcastChannel('campusroute-v2'); } catch (e) {}
  CR.share = function () {
    if (!bc) return;
    var blocks = {}; CR.G.roads.forEach(function (r) { blocks[r.id] = { blocked: r.blocked, meta: r.meta }; });
    try { bc.postMessage({ posts: CR.posts, act: CR.activity, rules: CR.rules, kw: CR.kw, qs: CR.qs, adminCode: CR.adminCode, blocks: blocks }); } catch (e) {}
  };
  if (bc) bc.onmessage = function (e) {
    var d = e.data; if (!d || !d.posts) return;
    CR.posts = d.posts; CR.activity = d.act || []; if (d.rules) CR.rules = d.rules; if (d.kw) CR.kw = d.kw; if (Array.isArray(d.qs)) CR.qs = d.qs; if (d.adminCode) CR.adminCode = d.adminCode;
    if (d.blocks) CR.G.roads.forEach(function (r) { if (d.blocks[r.id]) { r.blocked = d.blocks[r.id].blocked; r.meta = d.blocks[r.id].meta; } });
    CR.persist(); CR.saveGraph(); recompute(); renderGraph(); CR.renderPanel(); CR.syncBadges();
  };

  // ───────── global events ─────────
  $('#app').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('[data-act]') : null; if (!b) return;
    var act = b.getAttribute('data-act'), id = b.getAttribute('data-id'), c;
    switch (act) {
      case 'mode': CR.setMode(b.getAttribute('data-mode')); break;
      case 'tool': S.tool = b.getAttribute('data-tool'); S.selNode = null; syncGraph(); syncTools(); CR.renderPanel(); syncHint(); break;
      case 'undo': CR.undo(); break;
      case 'lock': S.locked = !S.locked; lsSet('locked', S.locked); syncTools(); CR.renderPanel(); syncHint(); CR.toast(S.locked ? 'Layout locked — safe to hand round' : 'Layout unlocked'); break;
      case 'zoomin': c = centre(); zoomBy(1.3, c[0], c[1]); break;
      case 'zoomout': c = centre(); zoomBy(1 / 1.3, c[0], c[1]); break;
      case 'fit': fitView(); break;
      case 'closepop': closePop(); break;
      case 'popblock': { var r = C.roadById(CR.G, id); if (r) { CR.setBlocked(id, !r.blocked, null); CR.share(); CR.toast(r.blocked ? 'Road ' + C.roadName(CR.G, r) + ' closed' : 'Road ' + C.roadName(CR.G, r) + ' reopened', r.blocked ? 'warn' : 'ok'); } closePop(); break; }
      case 'popreport': S.composer.roadId = id; closePop(); CR.toast('Road added to your report'); CR.renderPanel(); break;
      case 'signout': CR.role = ''; lsSet('role', ''); CR.applyRole(); CR.toast('Signed out'); break;
      case 'role': {
        var rl = b.getAttribute('data-role');
        if (rl === 'citizen') { CR.role = 'citizen'; lsSet('role', 'citizen'); CR.applyRole(); CR.toast('Welcome — citizen mode', 'ok'); }
        else if (rl === 'adminpick') { $('#adminbox').hidden = false; var ci = $('#admin-code'); if (ci) ci.focus(); }
        else if (rl === 'admin') {
          var v = ($('#admin-code') ? $('#admin-code').value : '').trim();
          if (v && v.toLowerCase() === String(CR.adminCode).toLowerCase()) { CR.role = 'admin'; lsSet('role', 'admin'); CR.applyRole(); CR.toast('Admin mode unlocked', 'ok'); }
          else { var m2 = $('#adminmsg'); if (m2) m2.textContent = 'That code is not right — ask the admin for it'; }
        }
        break;
      }
      default: if (CR.act) CR.act(act, b, ev);
    }
  });
  map.addEventListener('pointerdown', onDown);
  map.addEventListener('pointermove', onMove);
  map.addEventListener('pointerup', onUp);
  map.addEventListener('pointercancel', function () { ptr = null; draftLine.style.display = 'none'; clearSnap(); });
  map.addEventListener('wheel', function (ev) { ev.preventDefault(); zoomBy(ev.deltaY < 0 ? 1.18 : 1 / 1.18, ev.clientX, ev.clientY); }, { passive: false });
  document.addEventListener('pointerdown', function (ev) { if (!pop.hidden && !pop.contains(ev.target) && !map.contains(ev.target)) closePop(); });
  $('#lightbox').addEventListener('click', function () { $('#lightbox').hidden = true; });
  if (window.ResizeObserver) new ResizeObserver(function () { onResize(); }).observe(map);

  // ───────── start ─────────
  CR.init = function () {
    buildLayers();
    $$('#modes .mode').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === S.mode); });
    tools.hidden = S.mode !== 'design';
    fitView(); renderGraph(); CR.renderPanel(); CR.syncBadges(); syncTools(); syncHint(); CR.applyRole(); CR.icons();
  };
})();
