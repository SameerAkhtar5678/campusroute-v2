/* CampusRoute 2 — the side panel: Route / Algorithm / Roads, Designer, Live feed, Admin console. */
(function () {
  'use strict';
  var C = window.CRCore, CR = window.CR, S = CR.S;
  var $ = CR.$, esc = CR.esc, G = function () { return CR.G; };

  function node(id) { return C.nodeById(G(), id); }
  function road(id) { return C.roadById(G(), id); }
  function nm(id) { var n = node(id); return n ? n.name : '?'; }
  function closedCount() { return G().roads.filter(function (r) { return r.blocked; }).length; }
  function pending() { return CR.posts.filter(function (p) { return p.case && p.case.status === 'pending'; }); }
  CR.ago = function (ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  };
  function initials(a) { return String(a || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0].toUpperCase(); }).join(''); }
  function hue(a) { var h = 0; for (var i = 0; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) % 360; return 'hsl(' + h + ',55%,45%)'; }
  function seg(items, cur) {
    return '<div class="seg">' + items.map(function (it) {
      return '<button data-act="tab" data-tab="' + it[0] + '" class="' + (cur === it[0] ? 'on' : '') + '">' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function colorOf(id) { return CR.typeOf(node(id)).color; }

  // ───────── Navigate: Route ─────────
  function slotHTML(kind, label, id) {
    var on = S.activeSlot === kind;
    return '<button class="slot ' + kind + (on ? ' active' : '') + (id ? ' set' : '') + '" data-act="slot" data-slot="' + kind + '"><span class="dot"></span><span><small>' + label + '</small><b>' + (id ? esc(nm(id)) : 'Tap a place…') + '</b></span></button>';
  }
  function chips() {
    var html = '', li = 0, pts = [S.start].concat(S.stops, [S.end]);
    for (var i = 0; i < pts.length - 1; i++) {
      var leg = S.route.legs[li++]; if (!leg || !leg.found) break;
      if (i > 0) html += '<span class="chip-arrow">then</span>';
      html += '<span class="chip">' + leg.path.map(function (p) { return '<b style="color:' + colorOf(p) + '">' + esc(C.code(G(), p)) + '</b>'; }).join('<i class="ar">›</i>') + '<em>' + leg.dist + ' m</em></span>';
    }
    return html;
  }
  function viewRoute() {
    var h = '<div class="pad">' + seg([['route', 'Route'], ['algo', 'Algorithm'], ['roads', 'Roads' + (closedCount() ? ' <i class="rdot">' + closedCount() + '</i>' : '')]], S.tab);
    h += '<div class="slots">' + slotHTML('start', 'From', S.start) +
      '<button class="swap" data-act="swap" title="Reverse the trip" aria-label="Reverse the trip"><i data-lucide="arrow-right-left"></i></button>' + slotHTML('end', 'To', S.end) + '</div>';
    if (S.stops.length || S.route) h += '<div class="stops">' + S.stops.map(function (id, i) {
      return '<button class="stop" data-act="clearstop" data-id="' + id + '" title="Remove this stop">Stop ' + (i + 1) + ' · ' + esc(nm(id)) + '<i data-lucide="x"></i></button>';
    }).join('') + '<button class="stop add" data-act="addstop"><i data-lucide="plus"></i>Stop via</button></div>';
    h += '<div class="result">';
    if (!S.route) h += '<div class="empty"><span class="eic"><i data-lucide="route"></i></span><p>' + (!S.start ? 'Tap the map where you are.' : 'Now tap where you’re going.') + '</p><small>The shortest route appears instantly. Then watch Dijkstra find it, one step at a time.</small></div>';
    else if (!S.route.ok) h += '<div class="empty bad"><span class="eic"><i data-lucide="circle-alert"></i></span><p>No open route to ' + esc(nm(S.end)) + '</p><small>Closed roads cut it off. Reopen one, or pick another place.</small></div>';
    else {
      var hops = 0, picks = 0;
      S.route.legs.forEach(function (l) { hops += l.path.length - 1; picks += l.picks; });
      h += '<div class="big">' + S.route.total + '<span> m</span></div><div class="sub2">shortest route · ' + hops + ' road' + (hops > 1 ? 's' : '') + ' · ' + picks + ' place' + (picks > 1 ? 's' : '') + ' checked</div>';
      if (S.route.baseline !== null && S.route.total > S.route.baseline) h += '<div class="pill warn"><i data-lucide="traffic-cone"></i>+' + (S.route.total - S.route.baseline) + ' m detour because of closed roads</div>';
      h += '<div class="chips">' + chips() + '</div><button class="btn primary wide" data-act="watch"><i data-lucide="play"></i>Watch Dijkstra find it</button>';
    }
    h += '</div>';
    if (S.route) h += '<div class="row">' + (closedCount() ? '<button class="btn sm" data-act="unblock"><i data-lucide="unlock"></i>Open all roads</button>' : '') + '<button class="btn sm" data-act="cleartrip"><i data-lucide="x"></i>Clear trip</button></div>';
    return h + '</div>';
  }

  // ───────── Navigate: Algorithm ─────────
  function progText() { var l = CR.lastStep; return l ? 'step ' + (l.i + 1) + ' / ' + l.n : ''; }
  function logHTML() {
    if (!S.route || !S.route.ok) return '<div class="lg-placeholder">Tap two places on the map and every step of the algorithm is logged here.</div>';
    if (!S.watch) return '<div class="lg-placeholder">The route is ready — press play to watch the algorithm think it through.</div>';
    return CR.lastStep ? CR.lastStep.log : '';
  }
  function tableHTML() {
    var l = CR.lastStep; if (!l) return '';
    return G().nodes.map(function (n) {
      var d = l.snap.d[n.id], p = l.snap.p[n.id], st;
      if (l.snap.v.indexOf(n.id) >= 0) st = '<span class="tag vi">visited ✔</span>';
      else if (d < Infinity) st = '<span class="tag fr">in queue</span>';
      else st = '<span class="tag un">unvisited</span>';
      var role = l.legSrc === n.id ? ' ← leg start' : l.legDst === n.id ? ' ← leg target' : '';
      return '<tr' + (l.legSrc === n.id || l.legDst === n.id ? ' class="hl"' : '') + '><td><b style="color:' + CR.typeOf(n).color + '">' + esc(n.code) + '</b> <span class="tn">' + esc(n.name) + role + '</span></td><td class="num">' + (d === Infinity ? '∞' : d) + '</td><td>' + (p ? 'via ' + esc(C.code(G(), p)) : '—') + '</td><td>' + st + '</td></tr>';
    }).join('');
  }
  function viewAlgo() {
    var E = G().nodes.length, R = C.edgesOf(G()).length;
    return '<div class="pad">' + seg([['route', 'Route'], ['algo', 'Algorithm'], ['roads', 'Roads' + (closedCount() ? ' <i class="rdot">' + closedCount() + '</i>' : '')]], S.tab) +
      '<div class="cardhead"><h3>Dijkstra’s log</h3><span class="ctrls">' +
      '<button class="icobtn play' + (S.playing ? ' playing' : '') + '" data-act="play" title="Play / pause" aria-label="Play or pause"><i data-lucide="play" class="ic-play"></i><i data-lucide="pause" class="ic-pause"></i></button>' +
      '<button class="icobtn" data-act="step" title="One step forward" aria-label="Step forward"><i data-lucide="chevron-right"></i></button>' +
      '<button class="icobtn" data-act="skip" title="Jump to the result" aria-label="Skip to end"><i data-lucide="skip-forward"></i></button>' +
      '<button class="icobtn" data-act="restart" title="Replay from step 1" aria-label="Restart"><i data-lucide="rotate-ccw"></i></button></span><span class="prog">' + progText() + '</span></div>' +
      '<div class="log" id="log-lines">' + logHTML() + '</div>' +
      '<h4 class="sh">Node states</h4><table class="tbl"><thead><tr><th>Place</th><th class="num">dist (m)</th><th>Comes via</th><th>Status</th></tr></thead><tbody id="node-tbody">' + tableHTML() + '</tbody></table>' +
      '<details class="math"><summary>How it works</summary>' +
      '<p>The campus is a <b>weighted graph</b>: every place is a <b>node</b>, every stretch of road between two places is an <b>edge</b>, and its weight is the road’s length in metres — measured straight from the map (9 px = 1 m). This map has <b>' + E + '</b> nodes and <b>' + R + '</b> road pieces.</p>' +
      '<pre>every distance = ∞, except the start = 0\nwhile an unvisited node is still reachable:\n    pick the unvisited node u with the smallest distance   ← greedy choice\n    mark u visited — its distance is now final\n    for each neighbour v across an open road:\n        if dist(u) + length(u→v) &lt; dist(v):\n            dist(v) = dist(u) + length(u→v)      ← “relaxing” the edge\n            prev(v) = u\nfollow prev back from the destination → the shortest route</pre>' +
      '<p><b>Why the greedy choice is safe.</b> When a node is picked, no other route can beat it — any alternative would pass through a node that is already farther away, and roads only ever <em>add</em> distance.</p>' +
      '<p><b>Closed roads</b> are left out of the graph before the run. A route with stops runs Dijkstra once per leg and adds the distances — each leg is optimal, so their sum is too.</p>' +
      '<p><b>Cost.</b> Scanning for the minimum each round (as here): <code>O(V²)</code>. With a priority queue: <code>O((V + E) log V)</code>.</p></details></div>';
  }
  CR.refreshAlgo = function () {
    if (S.mode !== 'navigate' || S.tab !== 'algo') return;
    var a = $('#log-lines'), b = $('#node-tbody'), p = $('.prog'), pl = $('.icobtn.play');
    if (!a) return;
    var at = a.scrollTop;
    a.innerHTML = logHTML(); a.scrollTop = at;                       // stay where the reader is
    b.innerHTML = tableHTML(); if (p) p.textContent = progText();
    if (pl) pl.classList.toggle('playing', S.playing);
  }

  // ───────── Navigate: Roads ─────────
  function viewRoads() {
    var closed = closedCount();
    return '<div class="pad">' + seg([['route', 'Route'], ['algo', 'Algorithm'], ['roads', 'Roads' + (closed ? ' <i class="rdot">' + closed + '</i>' : '')]], S.tab) +
      '<div class="cardhead"><h3>' + G().roads.length + ' roads</h3><span class="prog">' + (closed ? closed + ' closed' : 'all open') + '</span></div><div class="roadlist">' +
      G().roads.map(function (r) {
        return '<div class="roadrow' + (r.blocked ? ' off' : '') + '"><button class="rname" data-act="gotoroad" data-id="' + r.id + '" title="Show on map"><b>' + esc(C.roadName(G(), r)) + '</b><small>' + esc(C.roadTitle(G(), r)) + '</small></button><span class="rlen">' + C.meters(C.roadPx(G(), r)) + ' m</span>' +
          '<label class="switch"><input type="checkbox" data-ch="road" data-id="' + r.id + '"' + (r.blocked ? ' checked' : '') + ' aria-label="Close road ' + esc(C.roadName(G(), r)) + '"><span class="tr"></span><span class="kn"></span></label></div>';
      }).join('') + '</div>' +
      (closed ? '<button class="btn sm wide" data-act="unblock" style="margin-top:12px"><i data-lucide="unlock"></i>Open all roads</button>' : '') + '</div>';
  }

  // ───────── Design ─────────
  function viewDesign() {
    var h = '<div class="pad"><div class="card"><div class="ct">Places <small>pick a type, then tap the map</small></div><div class="palette">';
    Object.keys(CR.BUILTIN).forEach(function (k) {
      var t = CR.BUILTIN[k];
      h += '<button class="pal' + (S.tool === 'add' && S.addType === k ? ' on' : '') + '" data-act="pal" data-type="' + k + '" title="' + t.name + '"><span class="pic" style="color:' + t.color + ';background:' + t.color + '22"><i data-lucide="' + t.pal + '"></i></span><span>' + t.name + '</span></button>';
    });
    Object.keys(CR.types).forEach(function (k) {
      var t = CR.types[k];
      h += '<button class="pal photo' + (S.tool === 'add' && S.addType === k ? ' on' : '') + '" data-act="pal" data-type="' + k + '" title="' + esc(t.name) + '"><span class="pic" style="background-image:url(' + t.img + ')"></span><span>' + esc(t.name) + '</span><span class="px" data-act="deltype" data-type="' + k + '" title="Remove this type">×</span></button>';
    });
    h += '<button class="pal add" data-act="newtype"><span class="pic"><i data-lucide="camera"></i></span><span>New from photo</span></button></div>';
    if (S.pendingType) h += '<div class="newtype"><img src="' + S.pendingType.img + '" alt=""><input class="inp" data-in="ntname" placeholder="Name this type — e.g. Water tank" value="' + esc(S.pendingType.name) + '" maxlength="24"><button class="btn sm primary" data-act="addtype">Add</button><button class="icobtn" data-act="canceltype" aria-label="Cancel"><i data-lucide="x"></i></button></div>';
    h += '</div>';
    if (S.selNode) {
      var n = node(S.selNode);
      if (n) h += '<div class="card"><div class="ct">Selected place</div><label class="field">Name<input class="inp" data-in="nodename" value="' + esc(n.name) + '" maxlength="28"></label>' +
        (n.kind === 'cross' ? '<p class="note">A crossing sits exactly where its two roads meet — move or erase a road to change it.</p>' : '') +
        '<div class="row"><button class="btn sm danger" data-act="delnode"><i data-lucide="trash-2"></i>Delete</button><button class="btn sm" data-act="delroads"><i data-lucide="spline"></i>Remove its roads</button></div></div>';
    }
    h += '<details class="card" open><summary>Save &amp; load designs</summary>' +
      '<div class="row"><input class="inp" data-in="savename" id="savename" placeholder="Design name" maxlength="40"><button class="btn sm primary" data-act="savedesign"><i data-lucide="save"></i>Save</button></div><div class="slist">';
    if (!CR.designs.length) h += '<div class="sempty">Nothing saved yet.</div>';
    CR.designs.forEach(function (d, i) {
      h += '<div class="srow"><div><b>' + esc(d.name) + '</b><small>' + (d.graph.nodes.length || 0) + ' places · ' + (d.graph.roads.length || 0) + ' roads</small></div><span class="sacts"><button class="btn sm" data-act="load" data-id="' + i + '">Load</button><button class="icobtn" data-act="deldesign" data-id="' + i + '" aria-label="Delete design"><i data-lucide="trash-2"></i></button></span></div>';
    });
    h += '</div><div class="row"><button class="btn sm" data-act="exportcode"><i data-lucide="copy"></i>Copy export code</button><button class="btn sm" data-act="importcode"><i data-lucide="download"></i>Import code</button></div>' +
      '<textarea class="area" id="iocode" placeholder="Paste an export code here, then press Import code" spellcheck="false"></textarea></details>' +
      '<div class="row between"><span class="note">Sample campus: ' + C.defaultGraph().nodes.length + ' places, 8 roads.</span><button class="btn sm" data-act="resetmap"><i data-lucide="rotate-ccw"></i>Reset map</button></div></div>';
    return h;
  }

  // ───────── Live ─────────
  function verdictHTML(p) {
    var a = p.action, ic = { blocked: 'ban', 'review-block': 'shield', 'review-reopen': 'circle-check', reopened: 'circle-check', agree: 'check', counting: 'timer' }[a];
    var t = { blocked: 'Auto-closed', 'review-block': 'Admin decides', 'review-reopen': 'Reopen? Admin decides', reopened: 'Auto-reopened', agree: 'Agrees — already closed', counting: 'Counted', none: 'Noted' }[a];
    var s = t + (a === 'blocked' || a === 'review-block' || a === 'reopened' ? ' · ' + p.score + '%' : '');
    return (a === 'counting' ? '<span class="vcnt">' + p.reason[0] + '</span>' : '') + '<span class="verdict v-' + a + '">' + (ic ? '<i data-lucide="' + ic + '"></i>' : '') + s + '</span>';
  }
  function why(p) {
    var out = [{ picked: 'road picked on the map', named: 'names both ends of the road', sole: 'the only road to that place' }[p.roadHow] || 'no road identified'];
    if (p.cat !== 'info') out.push('signal word' + (p.matched.length > 1 ? 's' : '') + ' “' + p.matched.join('”, “') + '”');
    else out.push('no closure or clearance words found');
    if (p.photo) out.push('photo attached');
    if (p.hedge.length) out.push('hedged (“' + p.hedge[0] + '”)');
    return out.concat(p.reason || []).join(' · ');
  }
  function roadChip(p, act) {
    var r = road(p.roadId);
    if (r) return '<button class="chip roadchip' + (r.blocked ? ' off' : '') + '" data-act="' + (act || 'gotoroad') + '" data-id="' + r.id + '"><i data-lucide="route"></i>' + esc(C.roadName(G(), r)) + ' · ' + esc(C.roadTitle(G(), r)) + '</button>';
    if (p.roadId) return '<span class="chip roadchip">road removed</span>';
    var pl = p.placeId ? node(p.placeId) : null;
    return '<span class="chip roadchip dim">near ' + esc(pl ? pl.name : '—') + ' · no road</span>';
  }
  function postHTML(p) {
    return '<article class="post' + (p.case && p.case.status === 'pending' ? ' pending' : '') + '"><div class="phead"><span class="avatar" style="background:' + hue(p.author) + '">' + esc(initials(p.author)) + '</span>' +
      '<div class="pwho"><b>' + esc(p.author) + '</b><small>' + CR.ago(p.ts) + '</small></div><span class="cat c-' + p.cat + '">' + (C.CATS[p.cat] || C.CATS.info).label + '</span></div>' +
      (p.text ? '<p class="ptext">' + esc(p.text) + '</p>' : '') +
      (p.photo ? '<button class="pph" data-act="zoom" data-id="' + p.id + '"><img src="' + p.photo + '" alt="Report photo"></button>' : '') +
      '<div class="ptags">' + roadChip(p) + '</div><div class="why">' + esc(why(p)) + '</div><div class="pfoot">' + verdictHTML(p) + '</div></article>';
  }
  function viewLive() {
    var c = closedCount(), co = S.composer, r = co.roadId ? road(co.roadId) : null;
    var list = CR.posts.filter(function (p) {
      if (S.filter === 'closed') return p.cat !== 'info' && p.cat !== 'clear';
      if (S.filter === 'clear') return p.cat === 'clear';
      return true;
    });
    var h = '<div class="pad"><div class="ttlrow"><div><div class="ttl">Live updates</div><div class="sub2">' +
      (c ? c + ' road' + (c > 1 ? 's' : '') + ' closed' : 'All roads open') + (pending().length ? ' · ' + pending().length + ' waiting for the admin' : '') + '</div></div>' +
      '<div class="filter">' + [['all', 'All'], ['closed', 'Problems'], ['clear', 'Cleared']].map(function (f) { return '<button class="' + (S.filter === f[0] ? 'on' : '') + '" data-act="filter" data-tab="' + f[0] + '">' + f[1] + '</button>'; }).join('') + '</div></div>';
    h += '<div class="card composer"><div class="crow"><span class="avatar" style="background:' + hue(CR.author || '?') + '">' + esc(initials(CR.author || '?')) + '</span><input class="inp ghost" data-in="author" placeholder="Your name" value="' + esc(CR.author) + '" maxlength="24"></div>' +
      '<textarea class="area" data-in="text" rows="3" placeholder="What’s happening on the roads?  e.g. “Tree fallen — the road to the library is blocked”">' + esc(co.text) + '</textarea>' +
      (co.photo ? '<div class="pthumb"><img src="' + co.photo + '" alt=""><button class="xbtn" data-act="rmpostphoto" aria-label="Remove photo"><i data-lucide="x"></i></button></div>' : '') +
      '<div class="crow"><button class="btn sm" data-act="addpostphoto"><i data-lucide="camera"></i>Photo</button>' +
      '<button class="btn sm' + (S.pickRoad ? ' picking' : '') + '" data-act="pickroad"><i data-lucide="map-pin"></i>' + (S.pickRoad ? 'Cancel' : r ? esc(C.roadName(G(), r)) + ' ✓' : 'Road: tap map') + '</button>' +
      '<button class="btn sm primary grow" data-act="post"><i data-lucide="send"></i>Post update</button></div>' +
      '<div class="note">Say which road and what happened — clear reports close or reopen roads on their own, vague ones go to the admin.</div></div>';
    h += '<div class="feed" id="feed">';
    if (!list.length) h += '<div class="empty"><span class="eic"><i data-lucide="radio"></i></span><p>' + (CR.posts.length ? 'Nothing in this filter yet.' : 'No updates yet.') + '</p><small>Post the first report above, or see how the automatic system reacts to a few realistic ones.</small>' +
      (CR.posts.length ? '' : '<button class="btn sm" data-act="sample"><i data-lucide="sparkles"></i>Try 3 sample reports</button>') + '</div>';
    else h += list.map(postHTML).join('');
    return h + '</div></div>';
  }

  // ───────── Admin ─────────
  function kpi(icon, label, val, cls) { return '<div class="kpi ' + (cls || '') + '"><span class="kic"><i data-lucide="' + icon + '"></i></span><div><small>' + label + '</small><b>' + val + '</b></div></div>'; }
  function caseHTML(p) {
    var t = p.case.type, r = road(p.roadId);
    var title = { 'keep-block': 'Closed automatically — keep it closed?', block: 'Close this road?', reopen: 'Reported clear — reopen it?', 'ack-reopen': 'Reopened automatically — was that right?' }[t];
    var btns = {
      'keep-block': '<button class="btn sm primary" data-act="resolve" data-id="' + p.id + '" data-res="keep"><i data-lucide="check"></i>Keep closed</button><button class="btn sm" data-act="resolve" data-id="' + p.id + '" data-res="reopen"><i data-lucide="unlock"></i>Reopen road</button>',
      block: '<button class="btn sm danger" data-act="resolve" data-id="' + p.id + '" data-res="block"><i data-lucide="ban"></i>Close road</button><button class="btn sm" data-act="resolve" data-id="' + p.id + '" data-res="ignore">Ignore</button>',
      reopen: '<button class="btn sm primary" data-act="resolve" data-id="' + p.id + '" data-res="reopen"><i data-lucide="unlock"></i>Reopen road</button><button class="btn sm" data-act="resolve" data-id="' + p.id + '" data-res="keep">Keep closed</button>',
      'ack-reopen': '<button class="btn sm primary" data-act="resolve" data-id="' + p.id + '" data-res="ack"><i data-lucide="check"></i>That’s right</button><button class="btn sm" data-act="resolve" data-id="' + p.id + '" data-res="again"><i data-lucide="ban"></i>Close it again</button>'
    }[t];
    return '<div class="case"><div class="ctitle">' + title + '</div>' + postHTML(p) + '<div class="row acts">' + btns + '</div></div>';
  }
  function viewAdmin() {
    var now = Date.now(), closed = G().roads.filter(function (r) { return r.blocked; }), pend = pending();
    var auto = G().roads.filter(function (r) { return r.blocked && r.meta && r.meta.by === 'auto'; }).length;
    var day = CR.posts.filter(function (p) { return now - p.ts < 864e5; }).length;
    var h = '<div class="pad"><div class="ttlrow"><div class="ttl">Control room</div><div class="seg small">' +
      [['queue', 'Queue' + (pend.length ? ' <i class="rdot">' + pend.length + '</i>' : '')], ['rules', 'Rules'], ['log', 'Log']].map(function (t) {
        return '<button data-act="admin-tab" data-tab="' + t[0] + '" class="' + (S.adminTab === t[0] ? 'on' : '') + '">' + t[1] + '</button>';
      }).join('') + '</div></div>';
    h += '<div class="brief"><span class="bic"><i data-lucide="sparkles"></i></span><div><b>Automatic watch</b>' + C.brief(G(), CR.posts, now).map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '<small>Written on this device from the live reports — nothing is sent anywhere.</small></div></div>';
    h += '<div class="kpis">' + kpi('ban', 'Roads closed', closed.length + ' / ' + G().roads.length, 'red') + kpi('zap', 'Closed on a report', auto, 'amber') + kpi('shield', 'Waiting for you', pend.length, pend.length ? 'blue' : '') + kpi('megaphone', 'Reports · 24 h', day) + '</div>';
    if (S.adminTab === 'queue') {
      h += '<div class="feed">';
      if (!pend.length) h += '<div class="empty"><span class="eic"><i data-lucide="shield-check"></i></span><p>All clear — nothing needs your decision.</p><small>When a report closes a road, or is too vague to act on alone, it lands here.</small></div>';
      else h += pend.map(caseHTML).join('');
      h += '</div>';
    } else if (S.adminTab === 'rules') {
      h += '<div class="card"><div class="ct">What happens to each kind of report</div>';
      C.BLOCKERS.forEach(function (cat) {
        h += '<label class="rule"><span class="cdot" style="background:' + C.CATS[cat].color + '"></span><span class="rl">' + C.CATS[cat].label + '</span><select class="sel" data-ch="rulemode" data-cat="' + cat + '">' +
          '<option value="auto"' + (CR.rules.mode[cat] === 'auto' ? ' selected' : '') + '>Close road at once</option><option value="review"' + (CR.rules.mode[cat] === 'review' ? ' selected' : '') + '>Ask admin first</option><option value="none"' + (CR.rules.mode[cat] === 'none' ? ' selected' : '') + '>Ignore</option></select></label>';
      });
      h += '<label class="rule"><span class="rl">Reports needed before auto-closing</span><select class="sel" data-ch="minReports">' + [1, 2, 3].map(function (n) { return '<option value="' + n + '"' + (CR.rules.minReports === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
        '<label class="rule chk"><input type="checkbox" data-ch="autoReopen"' + (CR.rules.autoReopen ? ' checked' : '') + '><span>Reopen a road automatically when a report clearly says it is clear <small>only for closures you have not confirmed yet</small></span></label>' +
        '<label class="rule"><span class="rl">Admin code <small>needed to unlock admin mode on any device</small></span><input class="inp" data-in="admincode" value="' + esc(CR.adminCode) + '" maxlength="24" style="max-width:170px" autocomplete="off"></label></div>';
      h += '<div class="card"><div class="ct">Signal words <small>add your own — any language written in English letters</small></div>';
      Object.keys(C.CATS).forEach(function (cat) {
        h += '<div class="kwgroup"><b style="color:' + C.CATS[cat].color + '">' + C.CATS[cat].label + '</b><div class="kws">' +
          (CR.kw[cat] || []).map(function (w) { return '<span class="kw own">' + esc(w) + '<button data-act="delkw" data-cat="' + cat + '" data-word="' + esc(w) + '" aria-label="Remove word">×</button></span>'; }).join('') +
          '<input class="kwin" data-in="kw-' + cat + '" placeholder="Add a word" maxlength="24"><details class="kwdef"><summary>' + C.KEYWORDS[cat].length + ' built-in</summary><span class="kws">' + C.KEYWORDS[cat].map(function (w) { return '<span class="kw">' + esc(w) + '</span>'; }).join('') + '</span></details></div></div>';
      });
      h += '</div>';
    } else {
      h += '<div class="tl">' + (CR.activity.length ? CR.activity.map(function (a) {
        return '<div class="ev e-' + a.kind + '"><span class="ed"></span><div>' + esc(a.text) + '<small>' + CR.ago(a.ts) + '</small></div></div>';
      }).join('') : '<div class="sempty">No activity yet.</div>') + '</div>';
    }
    return h + '</div>';
  }

  // ───────── one render entry point ─────────
  CR.renderPanel = function () {
    var side = $('#side');
    side.className = 'side' + ((S.mode === 'live' || S.mode === 'admin') ? ' wide' : '');
    side.innerHTML = S.mode === 'navigate' ? (S.tab === 'route' ? viewRoute() : S.tab === 'algo' ? viewAlgo() : viewRoads())
      : S.mode === 'design' ? viewDesign() : S.mode === 'live' ? viewLive() : S.mode === 'questions' ? viewQuestions() : viewAdmin();
    CR.icons();
  };
  CR.syncBadges = function () {
    var a = $('#cnt-admin'), n = pending().length;
    a.hidden = !n; a.textContent = n;
    var qb = $('#cnt-q'), qn = CR.qs.filter(function (x) { return !(x.replies || []).length; }).length;
    if (qb) { qb.hidden = !qn; qb.textContent = qn; }
  };
  function qHTML(q) {
    var pl = q.nodeId ? node(q.nodeId) : null;
    var h = '<article class="post"><div class="phead"><span class="avatar" style="background:' + hue(q.author) + '">' + esc(initials(q.author)) + '</span>' +
      '<div class="pwho"><b>' + esc(q.author) + '</b><small>' + CR.ago(q.ts) + (pl ? ' · about ' + esc(pl.name) : ' · general') + '</small></div>' +
      ((q.replies || []).length ? '<span class="cat c-clear">Answered</span>' : '<span class="cat c-works">Open</span>') + '</div>' +
      '<p class="ptext">' + esc(q.text) + '</p>';
    (q.replies || []).forEach(function (r) {
      h += '<div class="reply"><b>' + esc(r.by) + '</b> <span>' + esc(r.text) + '</span><small>' + CR.ago(r.ts) + '</small></div>';
    });
    if (CR.role === 'admin') h += '<div class="crow" style="margin-top:2px"><input class="inp" data-in="reply-' + q.id + '" placeholder="Reply as admin…" maxlength="200"><button class="btn sm primary" data-act="replyq" data-id="' + q.id + '" aria-label="Reply"><i data-lucide="send"></i></button></div>';
    return h + '</article>';
  }
  function viewQuestions() {
    var ab = S.qAbout && node(S.qAbout);
    var h = '<div class="pad"><div class="ttlrow"><div><div class="ttl">Questions</div><div class="sub2">' +
      (CR.qs.length ? CR.qs.length + ' question' + (CR.qs.length > 1 ? 's' : '') + ' from citizens' : 'Ask about anything on campus') + '</div></div></div>';
    h += '<div class="card composer"><div class="crow"><span class="avatar" style="background:' + hue(CR.author || '?') + '">' + esc(initials(CR.author || '?')) + '</span><input class="inp ghost" data-in="author" placeholder="Your name" value="' + esc(CR.author) + '" maxlength="24"></div>' +
      '<textarea class="area" data-in="qtext" rows="3" placeholder="Raise a question — about a road, a place, anything">' + esc(S.qText || '') + '</textarea>' +
      '<div class="crow"><button class="btn sm' + (S.pickQ ? ' picking' : '') + '" data-act="pickq"><i data-lucide="map-pin"></i>' + (S.pickQ ? 'Cancel' : ab ? esc(ab.name) + ' ✓' : 'About: tap map') + '</button>' +
      '<button class="btn sm primary grow" data-act="askq"><i data-lucide="send"></i>Raise question</button></div>' +
      '<div class="note">The admin sees every question and replies here.</div></div><div class="feed">';
    if (!CR.qs.length) h += '<div class="empty"><span class="eic"><i data-lucide="messages-square"></i></span><p>No questions yet</p><small>Raise the first one — tap a place on the map so it is clear what it is about.</small></div>';
    else h += CR.qs.map(qHTML).join('');
    return h + '</div></div>';
  }

  // ───────── reports ─────────
  function logAct(kind, text, roadId) { CR.activity.unshift({ ts: Date.now(), kind: kind, text: text, roadId: roadId || null }); if (CR.activity.length > 200) CR.activity.length = 200; }
  function reviewLink() { return ' · <u data-act="gotoadmin">Review</u>'; }

  // Read a report, let the automatic system act on it, tell everyone. Returns the post.
  function runPost(input, quiet) {
    var G_ = G();
    var p = Object.assign({ id: CR.uid('p'), ts: Date.now(), photo: null }, input);
    var v = C.assess(G_, p.text, { roadId: p.roadId, photo: p.photo, keywords: CR.kw });
    var d = C.decide(v, { g: G_, posts: CR.posts, rules: CR.rules, now: p.ts });
    Object.assign(p, v, d);
    if (d.caseType) p.case = { status: 'pending', type: d.caseType };
    CR.posts.unshift(p);
    var r = p.roadId ? road(p.roadId) : null, rn = r ? C.roadName(G_, r) : '';
    if (d.action === 'blocked') {
      d.trigger.forEach(function (id) { var q = CR.posts.filter(function (x) { return x.id === id; })[0]; if (q) { q.action = 'blocked'; q.reason = []; if (!q.case) q.case = { status: 'pending', type: 'keep-block' }; } });
      r.blocked = true; r.meta = { by: 'auto', postId: p.id, ts: p.ts, confirmed: false };
      logAct('auto', 'Road ' + rn + ' closed automatically — “' + (p.matched[0] || p.cat) + '” reported by ' + p.author + ' (' + p.score + '% sure)', r.id);
      if (!quiet) CR.toast('Road <b>' + esc(rn) + '</b> closed automatically — ' + p.score + '% sure' + reviewLink(), 'auto', openAdmin);
    } else if (d.action === 'reopened') {
      r.blocked = false; r.meta = null;
      logAct('ok', 'Road ' + rn + ' reopened automatically — reported clear by ' + p.author + ' (' + p.score + '% sure)', r.id);
      if (!quiet) CR.toast('Road <b>' + esc(rn) + '</b> reopened automatically' + reviewLink(), 'ok', openAdmin);
    } else if (d.action === 'review-block' || d.action === 'review-reopen') {
      logAct('wait', 'Waiting for the admin: ' + (d.action === 'review-block' ? 'close ' : 'reopen ') + rn + '? — ' + p.author + ' is ' + p.score + '% sure', r.id);
      if (!quiet) CR.toast('A report on <b>' + esc(rn) + '</b> needs a decision' + reviewLink(), 'wait', openAdmin);
    }
    CR.persist(); CR.saveGraph(); CR.recompute(); CR.renderGraph(); CR.renderPanel(); CR.syncBadges(); CR.share();
    return p;
  }
  function openAdmin() { CR.setMode('admin'); CR.renderPanel(); }
  CR.openAdmin = openAdmin;

  function resolveCase(id, res) {
    var p = CR.posts.filter(function (x) { return x.id === id; })[0]; if (!p || !p.case || p.case.status !== 'pending') return;
    var r = p.roadId ? road(p.roadId) : null, rn = r ? C.roadName(G(), r) : '';
    if (r) {
      if (res === 'keep') { if (r.meta) r.meta.confirmed = true; logAct('ok', 'Admin kept road ' + rn + ' closed', r.id); }
      else if (res === 'reopen') { r.blocked = false; r.meta = null; logAct('ok', 'Admin reopened road ' + rn, r.id); }
      else if (res === 'block' || res === 'again') { r.blocked = true; r.meta = { by: 'admin', postId: p.id, ts: Date.now(), confirmed: true }; logAct('warn', 'Admin closed road ' + rn, r.id); }
      else if (res === 'ack') logAct('ok', 'Admin agreed: road ' + rn + ' stays open', r.id);
      else if (res === 'ignore') logAct('info', 'Admin ignored a report on road ' + rn, r.id);
    }
    p.case.status = 'resolved'; p.case.resolution = res; p.case.resolvedTs = Date.now();
    CR.persist(); CR.afterBlocksChanged(); CR.syncBadges();
    CR.toast(res === 'reopen' ? 'Road ' + esc(rn) + ' is open again' : res === 'ignore' ? 'Report dismissed' : 'Done — road ' + esc(rn) + ' is ' + (r && r.blocked ? 'closed' : 'open'), 'ok');
  }

  function readImage(file, maxSide, q) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onerror = rej;
      fr.onload = function () {
        var img = new Image();
        img.onerror = rej;
        img.onload = function () {
          var k = Math.min(1, maxSide / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          try { res(cv.toDataURL('image/jpeg', q)); } catch (e) { rej(e); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function submitPost() {
    var co = S.composer, text = co.text.trim();
    if (!text && !co.photo) { CR.toast('Write a line or add a photo first'); return; }
    if (!co.roadId) { CR.toast('Tip: tap a road on the map so the system knows which one you mean'); }
    var author = (CR.author || '').trim() || 'Someone';
    runPost({ author: author, text: text, photo: co.photo, roadId: co.roadId });
    S.composer = { text: '', photo: null, roadId: null }; S.pickRoad = null;
    CR.renderPanel(); CR.syncHint();
  }

  // ───────── panel actions ─────────
  CR.act = function (act, b) {
    var id = b.getAttribute('data-id'), cat, r;
    switch (act) {
      case 'tab': S.tab = b.getAttribute('data-tab'); CR.renderPanel(); break;
      case 'slot': var k = b.getAttribute('data-slot'); if (S.activeSlot === k && S[k]) S[k] = null; S.activeSlot = k; CR.recompute(); CR.renderPanel(); break;
      case 'swap': r = S.start; S.start = S.end; S.end = r; CR.recompute(); CR.renderPanel(); break;
      case 'clearstop': S.stops = S.stops.filter(function (x) { return x !== id; }); CR.recompute(); CR.renderPanel(); break;
      case 'addstop': S.pickNode = function (nid) { if (nid === S.start || nid === S.end || S.stops.indexOf(nid) >= 0) CR.toast('That place is already in the trip'); else { S.stops.push(nid); CR.recompute(); } }; CR.syncHint(); break;
      case 'watch': CR.play(); break;
      case 'play': CR.togglePlay(); break;
      case 'step': CR.step(); break;
      case 'skip': CR.skip(); break;
      case 'restart': CR.restart(); break;
      case 'unblock': G().roads.forEach(function (x) { x.blocked = false; x.meta = null; }); logAct('ok', 'All roads reopened by hand'); CR.afterBlocksChanged(); CR.syncBadges(); CR.toast('All roads are open again', 'ok'); break;
      case 'cleartrip': S.start = S.end = null; S.stops = []; S.activeSlot = 'start'; CR.recompute(); CR.renderPanel(); CR.syncHint(); break;
      case 'gotoroad': flashRoad(id); break;
      // design
      case 'pal': S.addType = b.getAttribute('data-type'); S.tool = 'add'; CR.syncTools(); CR.renderPanel(); CR.syncHint(); break;
      case 'newtype': $('#file-photo-type').click(); break;
      case 'canceltype': S.pendingType = null; CR.renderPanel(); break;
      case 'addtype':
        if (!S.pendingType) return;
        var tid = 't' + Date.now().toString(36).slice(-5);
        CR.types[tid] = { id: tid, name: (S.pendingType.name || '').trim() || 'Photo place', img: S.pendingType.img };
        CR.lsSet('types', CR.types); S.addType = tid; S.tool = 'add'; S.pendingType = null;
        CR.renderPanel(); CR.syncTools(); CR.syncHint(); CR.toast('Place type added — tap the map to put one down'); break;
      case 'deltype': tid = b.getAttribute('data-type'); delete CR.types[tid]; CR.lsSet('types', CR.types); if (S.addType === tid) S.addType = 'gate'; CR.renderPanel(); break;
      case 'delnode': if (S.selNode) CR.eraseNode(node(S.selNode)); break;
      case 'delroads': var n0 = node(S.selNode); if (n0) { CR.pushUndo(); G().roads.filter(function (x) { return x.pts.indexOf(n0.id) >= 0; }).forEach(function (x) { C.deleteRoad(G(), x.id); }); CR.settle(); CR.afterChange(); } break;
      case 'savedesign': var inp = $('#savename'), name = (inp.value || '').trim() || ('Design ' + (CR.designs.length + 1)); CR.designs.unshift({ name: name, ts: Date.now(), graph: JSON.parse(JSON.stringify(G())), types: usedTypes() }); CR.lsSet('designs', CR.designs); CR.renderPanel(); CR.toast('Saved “' + esc(name) + '”', 'ok'); break;
      case 'load': var dsg = CR.designs[+id]; if (dsg) { CR.loadDesign(dsg); CR.toast('Loaded “' + esc(dsg.name) + '”', 'ok'); } break;
      case 'deldesign': CR.designs.splice(+id, 1); CR.lsSet('designs', CR.designs); CR.renderPanel(); break;
      case 'exportcode':
        var payload = { name: ($('#savename') ? $('#savename').value : '') || 'CampusRoute design', graph: JSON.parse(JSON.stringify(G())), types: usedTypes() }, code = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
        if ($('#iocode')) $('#iocode').value = code;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () { CR.toast('Export code copied — paste it on another device', 'ok'); }, function () { CR.toast('The code is in the text box — copy it from there'); });
        } else CR.toast('The code is in the text box — copy it from there');
        break;
      case 'importcode':
        try {
          var raw = ($('#iocode') ? $('#iocode').value : '').trim(); if (!raw) { CR.toast('Paste an export code first'); break; }
          CR.loadDesign(JSON.parse(decodeURIComponent(escape(atob(raw))))); CR.toast('Design imported', 'ok');
        } catch (e) { CR.toast('That code could not be read — copy the whole thing'); } break;
      case 'resetmap': CR.resetMap(); break;
      // live
      case 'filter': S.filter = b.getAttribute('data-tab'); CR.renderPanel(); break;
      case 'pickroad': if (S.pickRoad) { CR.cancelPick(); break; } S.pickRoad = function (rid) { S.composer.roadId = rid; }; CR.syncHint(); CR.renderPanel(); break;
      case 'addpostphoto': $('#file-post').click(); break;
      case 'rmpostphoto': S.composer.photo = null; CR.renderPanel(); break;
      case 'post': submitPost(); break;
      case 'zoom': var zp = CR.posts.filter(function (x) { return x.id === id; })[0]; if (zp && zp.photo) { $('#lightbox img').src = zp.photo; $('#lightbox').hidden = false; } break;
      case 'sample': C.sampleReports(G()).forEach(function (s) { runPost(s, true); }); CR.toast('3 sample reports added — see what the system did with them' + reviewLink(), 'auto', openAdmin); break;
      // questions
      case 'pickq': S.pickQ = !S.pickQ; CR.syncHint(); CR.renderPanel(); break;
      case 'askq': {
        var qt = (S.qText || '').trim();
        if (!qt) { CR.toast('Write the question first'); break; }
        CR.qs.unshift({ id: CR.uid('q'), ts: Date.now(), author: (CR.author || '').trim() || 'Someone', text: qt, nodeId: S.qAbout || null, replies: [] });
        S.qText = ''; S.qAbout = null; S.pickQ = false;
        CR.persist(); CR.share(); CR.renderPanel(); CR.syncBadges(); CR.syncHint();
        CR.toast('Question raised — the admin will see it', 'ok');
        break;
      }
      case 'replyq': {
        var q0 = CR.qs.filter(function (x) { return x.id === id; })[0]; if (!q0) break;
        var ri = document.querySelector('[data-in="reply-' + id + '"]');
        var rt = ri ? ri.value.trim() : '';
        if (!rt) { CR.toast('Write a reply first'); break; }
        q0.replies.push({ ts: Date.now(), by: 'Admin', text: rt });
        CR.persist(); CR.share(); CR.renderPanel(); CR.syncBadges();
        CR.toast('Reply posted', 'ok');
        break;
      }
      // admin
      case 'admin-tab': S.adminTab = b.getAttribute('data-tab'); CR.renderPanel(); break;
      case 'resolve': resolveCase(id, b.getAttribute('data-res')); break;
      case 'gotoadmin': openAdmin(); break;
      case 'delkw': cat = b.getAttribute('data-cat'); var w = b.getAttribute('data-word'); CR.kw[cat] = (CR.kw[cat] || []).filter(function (x) { return x !== w; }); C.relock(); CR.persist(); CR.share(); CR.renderPanel(); break;
    }
  };

  function usedTypes() { var t = {}; G().nodes.forEach(function (n) { if (CR.types[n.type]) t[n.type] = CR.types[n.type]; }); return t; }
  function flashRoad(rid) {
    var r = road(rid); if (!r) return;
    CR.closePop();
    var g = document.querySelector('g.road[data-road="' + rid + '"]');
    if (g) { g.classList.add('flash'); setTimeout(function () { g.classList.remove('flash'); }, 1500); }
    CR.toast('Road <b>' + esc(C.roadName(G(), r)) + '</b> · ' + esc(C.roadTitle(G(), r)) + ' · ' + C.meters(C.roadPx(G(), r)) + ' m' + (r.blocked ? ' · closed' : ''));
  }

  // (pushUndo, settle, afterChange and eraseNode are defined in app.js, with the rest of the design edits)
  CR.loadDesign = function (d) {
    if (!d || !d.graph || !Array.isArray(d.graph.nodes)) { CR.toast('That design could not be read'); return false; }
    Object.keys(d.types || {}).forEach(function (k) { CR.types[k] = d.types[k]; }); CR.lsSet('types', CR.types);
    CR.G = C.normalize(JSON.parse(JSON.stringify(d.graph))); S.start = S.end = null; S.stops = []; S.activeSlot = 'start'; S.selNode = null; S.undo = [];
    CR.afterChange(); CR.fitView && CR.fitView(); CR.syncTools();
    return true;
  };
  CR.resetMap = function () {
    CR.G = C.defaultGraph(); S.start = S.end = null; S.stops = []; S.activeSlot = 'start'; S.selNode = null; S.undo = [];
    CR.afterChange(); CR.fitView && CR.fitView(); CR.syncTools(); CR.toast('Map reset to the sample campus', 'ok');
  };

  // ───────── inputs ─────────
  $('#app').addEventListener('input', function (ev) {
    var el = ev.target, k = el.getAttribute('data-in'); if (!k) return;
    if (k === 'text') S.composer.text = el.value;
    else if (k === 'qtext') S.qText = el.value;
    else if (k === 'admincode') { CR.adminCode = el.value.trim() || 'ADMIN2026'; CR.persist(); CR.share(); }
    else if (k === 'author') { CR.author = el.value; CR.lsSet('author', CR.author); }
    else if (k === 'ntname' && S.pendingType) S.pendingType.name = el.value;
    else if (k === 'nodename' && S.selNode) { var n = node(S.selNode); if (n && el.value.trim()) { n.name = el.value.trim(); CR.saveGraph(); CR.syncGraph(); } }
  });
  $('#app').addEventListener('change', function (ev) {
    var el = ev.target, k = el.getAttribute('data-ch'); if (!k) return;
    if (k === 'road') { var r = road(el.getAttribute('data-id')); if (r) { CR.setBlocked(r.id, el.checked, { by: 'manual', ts: Date.now() }); CR.share(); CR.toast(r.blocked ? 'Road ' + esc(C.roadName(G(), r)) + ' closed' : 'Road ' + esc(C.roadName(G(), r)) + ' reopened', r.blocked ? 'warn' : 'ok'); } }
    else if (k === 'rulemode') { CR.rules.mode[el.getAttribute('data-cat')] = el.value; CR.persist(); CR.share(); }
    else if (k === 'autoReopen') { CR.rules.autoReopen = el.checked; CR.persist(); CR.share(); }
    else if (k === 'minReports') { CR.rules.minReports = +el.value || 1; CR.persist(); CR.share(); }
  });
  $('#app').addEventListener('keydown', function (ev) {
    var inK = ev.target.getAttribute && ev.target.getAttribute('data-in');
    if (ev.key === 'Enter' && inK && inK.indexOf('kw-') === 0) {
      ev.preventDefault();
      var c = inK.slice(3), w = ev.target.value.trim().toLowerCase();
      if (w) { CR.kw[c] = (CR.kw[c] || []).concat([w]).filter(function (x, i, a) { return a.indexOf(x) === i; }); C.relock(); CR.persist(); CR.share(); CR.renderPanel(); var i2 = document.querySelector('[data-in="kw-' + c + '"]'); if (i2) i2.focus(); }
      return;
    }
    if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter' && inK === 'text') { ev.preventDefault(); submitPost(); return; }
    if (ev.key === 'Enter' && ev.target.id === 'admin-code') { document.querySelector('[data-role="admin"]').click(); return; }
    if (ev.key === 'Escape') { $('#lightbox').hidden = true; if (S.pickRoad || S.pickNode || S.pickQ) { CR.cancelPick(); return; } CR.closePop(); }
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && S.mode === 'design' && !/INPUT|TEXTAREA/.test(ev.target.tagName)) { ev.preventDefault(); CR.undo(); }
  });
  $('#file-photo-type').addEventListener('change', function (ev) {
    var f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    readImage(f, 200, 0.82).then(function (img) { S.pendingType = { img: img, name: '' }; CR.renderPanel(); var i = document.querySelector('[data-in="ntname"]'); if (i) i.focus(); }, function () { CR.toast('That image could not be read'); });
  });
  $('#file-post').addEventListener('change', function (ev) {
    var f = ev.target.files[0]; ev.target.value = '';
    if (!f) return;
    readImage(f, 900, 0.7).then(function (img) { S.composer.photo = img; CR.renderPanel(); }, function () { CR.toast('That image could not be read'); });
  });

  CR.init();
})();
