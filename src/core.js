/* CampusRoute 2 — core logic. Pure functions, no DOM.
   Runs in the browser as window.CRCore and in Node (module.exports) for tests. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CRCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PX_PER_M = 9;   // map scale: 9 px = 1 m
  var SNAP = 11;      // px — a node this close to a road connects to it
  var MIN_SEG = 10;   // px — smallest road piece left around a crossing

  // ───────── geometry ─────────
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  // Intersection of segment AB with segment CD (null when parallel).
  // t = position along AB, u = position along CD (0..1 inside the segment).
  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    var rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
    var den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    var qx = cx - ax, qy = cy - ay;
    var t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    return { t: t, u: u, x: ax + t * rx, y: ay + t * ry };
  }

  // Closest point of segment AB to P.
  function nearestOnSeg(px, py, ax, ay, bx, by) {
    var rx = bx - ax, ry = by - ay, L2 = rx * rx + ry * ry;
    var t = L2 ? ((px - ax) * rx + (py - ay) * ry) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    var x = ax + t * rx, y = ay + t * ry;
    return { t: t, x: x, y: y, d: dist(px, py, x, y) };
  }

  // Closest point of a road's polyline to P (a road may bend through junctions).
  function nearestOnRoad(g, r, px, py) {
    var best = null;
    for (var i = 0; i < r.pts.length - 1; i++) {
      var A = nodeById(g, r.pts[i]), B = nodeById(g, r.pts[i + 1]);
      if (!A || !B) continue;
      var q = nearestOnSeg(px, py, A.x, A.y, B.x, B.y);
      if (!best || q.d < best.d) { best = q; best.i = i; }
    }
    return best;
  }

  function bounds(g) {
    if (!g.nodes.length) return null;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    g.nodes.forEach(function (n) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ───────── graph ─────────
  // graph = { nodes: [{id, code, name, type, x, y, kind?}], roads: [{id, pts:[nodeIds…], blocked, meta?}] }
  // A road is a chain of nodes; every consecutive pair is one edge of the graph.
  // kind 'cross' marks a junction the app created where two roads cross.
  function nodeById(g, id) { for (var i = 0; i < g.nodes.length; i++) if (g.nodes[i].id === id) return g.nodes[i]; return null; }
  function roadById(g, id) { for (var i = 0; i < g.roads.length; i++) if (g.roads[i].id === id) return g.roads[i]; return null; }

  function edgesOf(g) {
    var out = [];
    g.roads.forEach(function (r) {
      for (var i = 0; i < r.pts.length - 1; i++) out.push({ road: r.id, a: r.pts[i], b: r.pts[i + 1], i: i });
    });
    return out;
  }

  function roadPx(g, r) {
    var s = 0;
    for (var i = 0; i < r.pts.length - 1; i++) {
      var A = nodeById(g, r.pts[i]), B = nodeById(g, r.pts[i + 1]);
      if (A && B) s += dist(A.x, A.y, B.x, B.y);
    }
    return s;
  }
  function meters(px) { return Math.max(1, Math.round(px / PX_PER_M)); }
  function edgeMeters(g, a, b) {
    var A = nodeById(g, a), B = nodeById(g, b);
    return (A && B) ? meters(dist(A.x, A.y, B.x, B.y)) : 1;
  }
  function code(g, id) { var n = nodeById(g, id); return n ? n.code : '?'; }
  function roadName(g, r) { return code(g, r.pts[0]) + ' ↔ ' + code(g, r.pts[r.pts.length - 1]); }
  function roadTitle(g, r) {
    var a = nodeById(g, r.pts[0]), b = nodeById(g, r.pts[r.pts.length - 1]);
    return (a ? a.name : '?') + ' to ' + (b ? b.name : '?');
  }
  function roadMid(g, r) {
    var half = roadPx(g, r) / 2, run = 0;
    for (var i = 0; i < r.pts.length - 1; i++) {
      var A = nodeById(g, r.pts[i]), B = nodeById(g, r.pts[i + 1]);
      if (!A || !B) continue;
      var L = dist(A.x, A.y, B.x, B.y);
      if (run + L >= half) { var t = L ? (half - run) / L : 0; return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; }
      run += L;
    }
    var F = nodeById(g, r.pts[0]);
    return F ? { x: F.x, y: F.y } : { x: 0, y: 0 };
  }
  function insertIntoRoad(g, roadId, nodeId, beforeId) {
    var r = roadById(g, roadId); if (!r) return;
    var i = r.pts.indexOf(beforeId); if (i < 0) return;
    r.pts.splice(i, 0, nodeId);
  }

  // Next free short label: J1, J2 … for junctions; single letters for places.
  function nextCode(g, prefix) {
    if (!prefix) {
      var used = {}; g.nodes.forEach(function (n) { used[n.code] = 1; });
      var letters = 'EFGHJKLMNPQRSTUVWXYZABCDEFGHIJKLMNPQRSTUVWXYZ';
      for (var i = 0; i < letters.length; i++) if (!used[letters[i]]) return letters[i];
      prefix = 'P';
    }
    var max = 0, re = new RegExp('^' + prefix + '(\\d+)$');
    g.nodes.forEach(function (n) { var m = re.exec(n.code || ''); if (m) max = Math.max(max, +m[1]); });
    return prefix + (max + 1);
  }

  // Connect every node that sits on a road, and put a junction wherever two
  // roads cross. mk(x, y) creates the crossing node. Returns the new crossing ids.
  function planarize(g, mk) {
    var made = [];
    for (var guard = 0; guard < 400; guard++) {
      var E = edgesOf(g), again = false, i, j;

      // 1) a node lying on the inside of an edge joins that road
      for (i = 0; i < g.nodes.length && !again; i++) {
        var n = g.nodes[i];
        for (j = 0; j < E.length; j++) {
          var e = E[j];
          if (e.a === n.id || e.b === n.id) continue;
          var A = nodeById(g, e.a), B = nodeById(g, e.b);
          if (!A || !B) continue;
          var q = nearestOnSeg(n.x, n.y, A.x, A.y, B.x, B.y);
          if (q.t <= 0 || q.t >= 1 || q.d >= SNAP) continue;
          if (dist(q.x, q.y, A.x, A.y) < SNAP || dist(q.x, q.y, B.x, B.y) < SNAP) continue;
          insertIntoRoad(g, e.road, n.id, e.b);
          again = true; break;
        }
      }
      if (again) continue;

      // 2) two edges that cross each other
      for (i = 0; i < E.length && !again; i++) {
        for (j = i + 1; j < E.length; j++) {
          var e1 = E[i], e2 = E[j];
          if (e1.road === e2.road) continue;
          if (e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b) continue;
          var p1 = nodeById(g, e1.a), p2 = nodeById(g, e1.b), p3 = nodeById(g, e2.a), p4 = nodeById(g, e2.b);
          if (!p1 || !p2 || !p3 || !p4) continue;
          var X = segSeg(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y, p4.x, p4.y);
          if (!X || X.t <= 1e-4 || X.t >= 1 - 1e-4 || X.u <= 1e-4 || X.u >= 1 - 1e-4) continue;
          // crossing lands on top of an existing end of one road → join that node instead
          var near = [p1, p2, p3, p4].filter(function (p) { return dist(X.x, X.y, p.x, p.y) < SNAP; })[0];
          if (near) {
            if (near === p1 || near === p2) insertIntoRoad(g, e2.road, near.id, e2.b);
            else insertIntoRoad(g, e1.road, near.id, e1.b);
          } else {
            var J = mk(X.x, X.y);
            insertIntoRoad(g, e1.road, J.id, e1.b);
            insertIntoRoad(g, e2.road, J.id, e2.b);
            made.push(J.id);
          }
          again = true; break;
        }
      }
      if (!again) break;
    }
    return made;
  }

  // Where must a crossing junction sit? It is pinned to the crossing of its two roads.
  // Returns {x, y}, or {dissolve:true} when the roads no longer cross, or {free:true}
  // when the node is no longer a crossing of exactly two through-roads.
  function solveCross(g, J) {
    var lines = [];
    g.roads.forEach(function (r) {
      var i = r.pts.indexOf(J.id);
      if (i <= 0 || i >= r.pts.length - 1) return;
      var P = null, Q = null, k;
      for (k = i - 1; k >= 0 && !P; k--) { var a = nodeById(g, r.pts[k]); if (a.kind !== 'cross') P = a; }
      for (k = i + 1; k < r.pts.length && !Q; k++) { var b = nodeById(g, r.pts[k]); if (b.kind !== 'cross') Q = b; }
      if (P && Q) lines.push({ P: P, Q: Q, prev: nodeById(g, r.pts[i - 1]), next: nodeById(g, r.pts[i + 1]) });
    });
    if (lines.length !== 2) return { free: true };
    var l1 = lines[0], l2 = lines[1];
    var X = segSeg(l1.P.x, l1.P.y, l1.Q.x, l1.Q.y, l2.P.x, l2.P.y, l2.Q.x, l2.Q.y);
    if (!X || X.t <= 0 || X.t >= 1 || X.u <= 0 || X.u >= 1) return { dissolve: true };
    var ok = [l1, l2].every(function (l) {
      return dist(X.x, X.y, l.prev.x, l.prev.y) >= MIN_SEG && dist(X.x, X.y, l.next.x, l.next.y) >= MIN_SEG;
    });
    if (!ok) return { dissolve: true };
    return { x: X.x, y: X.y };
  }

  function dissolve(g, J) {
    g.roads.forEach(function (r) { var i = r.pts.indexOf(J.id); if (i >= 0) r.pts.splice(i, 1); });
    g.nodes = g.nodes.filter(function (n) { return n.id !== J.id; });
  }

  // Keep crossing junctions honest after something moved or was erased.
  // dry = only move them (used while dragging); otherwise un-crossed ones are removed.
  function resolveCrossings(g, dry) {
    var changed = false;
    g.nodes.slice().forEach(function (n) {
      if (n.kind !== 'cross') return;
      var s = solveCross(g, n);
      if (s.free) { n.kind = 'junction'; return; }
      if (s.dissolve) { if (!dry) { dissolve(g, n); changed = true; } return; }
      if (Math.abs(s.x - n.x) > 0.01 || Math.abs(s.y - n.y) > 0.01) { n.x = s.x; n.y = s.y; changed = true; }
    });
    return changed;
  }

  function pruneCross(g) {
    g.nodes.slice().forEach(function (n) {
      if (n.kind !== 'cross') return;
      var interior = 0, anywhere = 0;
      g.roads.forEach(function (r) {
        var i = r.pts.indexOf(n.id);
        if (i >= 0) { anywhere++; if (i > 0 && i < r.pts.length - 1) interior++; }
      });
      if (interior >= 2) return;
      if (anywhere === 0) { g.nodes = g.nodes.filter(function (x) { return x.id !== n.id; }); }
      else if (interior === 1 && anywhere === 1) dissolve(g, n);
      else n.kind = 'junction';
    });
  }

  function deleteNode(g, id) {
    g.roads = g.roads.filter(function (r) {
      var i = r.pts.indexOf(id);
      if (i < 0) return true;
      if (i === 0 || i === r.pts.length - 1) return false;   // road ended here → it goes too
      r.pts.splice(i, 1); return true;                        // road passed through → it carries on
    });
    g.nodes = g.nodes.filter(function (n) { return n.id !== id; });
  }

  function deleteRoad(g, id) {
    g.roads = g.roads.filter(function (r) { return r.id !== id; });
    pruneCross(g);
  }

  function edgeBetween(g, a, b) {
    var found = null;
    edgesOf(g).forEach(function (e) {
      if ((e.a === a && e.b === b) || (e.a === b && e.b === a)) {
        if (!found || !roadById(g, found.road).blocked) found = e;
      }
    });
    return found;
  }

  function normalize(g) {
    g = g || {}; g.nodes = Array.isArray(g.nodes) ? g.nodes : []; g.roads = Array.isArray(g.roads) ? g.roads : [];
    var seen = {};
    g.nodes = g.nodes.filter(function (n) { return n && typeof n.id === 'string' && !seen[n.id] && (seen[n.id] = 1); });
    g.nodes.forEach(function (n) {
      n.x = +n.x || 0; n.y = +n.y || 0; n.name = String(n.name || 'Place'); n.type = n.type || 'gate';
      n.code = n.code || nextCode({ nodes: g.nodes.filter(function (o) { return o.code; }) }, '');
    });
    g.roads = g.roads.filter(function (r) { return r && typeof r.id === 'string'; });
    g.roads.forEach(function (r) {
      var pts = [];
      (Array.isArray(r.pts) ? r.pts : []).forEach(function (id) {
        if (nodeById(g, id) && pts.indexOf(id) < 0) pts.push(id);
      });
      r.pts = pts; r.blocked = !!r.blocked; if (!r.meta) r.meta = null;
    });
    g.roads = g.roads.filter(function (r) { return r.pts.length >= 2; });
    return g;
  }

  function defaultGraph() {
    return {
      nodes: [
        { id: 'nC', code: 'C', name: 'Library', type: 'library', x: 80, y: 80 },
        { id: 'nB', code: 'B', name: 'Labs', type: 'lab', x: 665, y: 80 },
        { id: 'nD', code: 'D', name: 'Cafeteria', type: 'cafeteria', x: 80, y: 440 },
        { id: 'nA', code: 'A', name: 'Office', type: 'office', x: 700, y: 340 },
        { id: 'nM', code: 'M', name: 'Junction M', type: 'junction', x: 428, y: 226 }
      ],
      roads: [['nC', 'nB'], ['nC', 'nD'], ['nB', 'nA'], ['nD', 'nA'], ['nC', 'nM'], ['nD', 'nM'], ['nM', 'nB'], ['nM', 'nA']]
        .map(function (p, i) { return { id: 'r' + i, pts: [p[0], p[1]], blocked: false, meta: null }; })
    };
  }

  // ───────── Dijkstra with a full step log ─────────
  // opts.leg labels the run when a trip has several legs; opts.ignoreBlocked = "if nothing were closed".
  function dijkstra(g, src, dst, opts) {
    opts = opts || {};
    var out = { steps: [], dist: Infinity, path: [], found: false, picks: 0 };
    var ids = g.nodes.map(function (n) { return n.id; }), dist = {}, prev = {}, vis = {}, inQ = {}, adj = {};
    ids.forEach(function (id) { dist[id] = Infinity; prev[id] = null; vis[id] = false; inQ[id] = true; adj[id] = []; });
    if (dist[src] === undefined || dist[dst] === undefined || src === dst) return out;
    dist[src] = 0;
    var closed = [];
    edgesOf(g).forEach(function (e) {
      var r = roadById(g, e.road), open = !r.blocked || !!opts.ignoreBlocked, w = edgeMeters(g, e.a, e.b);
      adj[e.a].push({ to: e.b, w: w, open: open, road: e.road });
      adj[e.b].push({ to: e.a, w: w, open: open, road: e.road });
      if (!open && closed.indexOf(e.road) < 0) closed.push(e.road);
    });
    function snap() {
      var d = {}, p = {}, v = [];
      ids.forEach(function (k) { d[k] = dist[k]; p[k] = prev[k]; if (vis[k]) v.push(k); });
      return { d: d, p: p, v: v };
    }
    var st = [], leg = opts.leg || 1, told = {};
    st.push({ t: 'leg', src: src, dst: dst, text: '▶ Leg ' + leg + ' — ' + code(g, src) + ' → ' + code(g, dst), snap: snap() });
    st.push({ t: 'init', text: 'init · dist(' + code(g, src) + ') = 0 · all others ∞' +
      (closed.length ? ' · ⛔ closed: ' + closed.map(function (id) { return roadName(g, roadById(g, id)); }).join(', ') : ''), snap: snap() });
    for (var guard = 0; guard <= ids.length + 1; guard++) {
      var u = null, best = Infinity;
      ids.forEach(function (k) { if (inQ[k] && dist[k] < best) { best = dist[k]; u = k; } });
      if (u === null) { st.push({ t: 'stuck', text: 'no reachable unvisited node left — run ends', snap: snap() }); break; }
      inQ[u] = false; vis[u] = true;
      st.push({ t: 'pick', node: u, d: best, text: 'visit ' + code(g, u) + ' · dist ' + best + ' m — final ✔', snap: snap() });
      if (u === dst) break;
      var cu = code(g, u);
      adj[u].forEach(function (a) {
        if (vis[a.to]) return;
        var cv = code(g, a.to);
        if (!a.open) {
          if (!told[a.road]) { told[a.road] = 1; st.push({ t: 'blocked', text: 'road ' + roadName(g, roadById(g, a.road)) + ' (' + roadTitle(g, roadById(g, a.road)) + ') is closed ⛔ — skipped', snap: snap() }); }
          return;
        }
        var cand = best + a.w, old = dist[a.to];
        if (cand < old) {
          dist[a.to] = cand; prev[a.to] = u;
          st.push({ t: 'relax', from: u, to: a.to, improved: true, text: 'relax ' + cu + '–' + cv + ': ' + best + ' + ' + a.w + ' = ' + cand + ' m < ' + (old === Infinity ? '∞' : old + ' m') + ' ⇒ dist(' + cv + ') = ' + cand + ' m', snap: snap() });
        } else {
          st.push({ t: 'relax', from: u, to: a.to, improved: false, text: 'relax ' + cu + '–' + cv + ': ' + cand + ' m ≥ ' + (old === Infinity ? '∞' : old + ' m') + ' — keep current', snap: snap() });
        }
      });
    }
    var found = dist[dst] < Infinity, path = [];
    if (found) { var c = dst; while (c) { path.unshift(c); c = prev[c]; } }
    st.push({ t: 'done', found: found, d: dist[dst], path: path, snap: snap(),
      text: found ? '✔ route found: ' + path.map(function (id) { return code(g, id); }).join(' → ') + ' — ' + dist[dst] + ' m'
        : '✖ no route from ' + code(g, src) + ' to ' + code(g, dst) + ' — destination is cut off' });
    var picks = 0; st.forEach(function (s) { if (s.t === 'pick') picks++; });
    return { steps: st, dist: dist[dst], path: path, found: found, picks: picks };
  }

  // A trip with stops = one Dijkstra run per leg. Also prices the same trip with
  // every road open, so the UI can say how much the closures cost.
  function planRoute(g, pts) {
    var legs = [], steps = [], total = 0, ok = true;
    for (var i = 0; i < pts.length - 1; i++) {
      var leg = dijkstra(g, pts[i], pts[i + 1], { leg: i + 1 });
      legs.push(leg); steps = steps.concat(leg.steps);
      if (!leg.found) { ok = false; break; }
      total += leg.dist;
    }
    var base = 0, bok = true;
    for (var j = 0; j < pts.length - 1; j++) {
      var bl = dijkstra(g, pts[j], pts[j + 1], { leg: j + 1, ignoreBlocked: true });
      if (!bl.found) { bok = false; break; }
      base += bl.dist;
    }
    return { legs: legs, steps: steps, total: total, ok: ok, baseline: bok ? base : null };
  }

  // ───────── reading a report ─────────
  var CATS = {
    closure: { label: 'Road closed', color: '#ef4444' },
    hazard: { label: 'Hazard', color: '#f43f5e' },
    works: { label: 'Work going on', color: '#f59e0b' },
    event: { label: 'Event', color: '#8b5cf6' },
    clear: { label: 'Cleared', color: '#16a34a' },
    info: { label: 'Update', color: '#6b7280' }
  };
  var BLOCKERS = ['closure', 'hazard', 'works', 'event'];

  // Exact words (plus the usual -s / -ed / -ing endings on longer ones), so
  // "Lab Block" or "close to the gate" never read as a closure.
  var KEYWORDS = {
    closure: ['blocked', 'blocking', 'blockade', 'closed', 'closing', 'closure', 'shut', 'shutdown', 'barricade', 'diverted',
      'diversion', 'sealed', 'cordoned', 'no entry', 'noentry', 'not allowed', 'cut off', 'inaccessible', 'impassable', 'off limits', 'out of bounds'],
    hazard: ['flood', 'waterlogging', 'water logging', 'waterlogged', 'fallen tree', 'tree fallen', 'tree fell', 'trees fell', 'fell down',
      'uprooted', 'landslide', 'landslip', 'mudslide', 'accident', 'crashed', 'collided', 'collision', 'fire', 'flames', 'burning', 'smoke',
      'blast', 'explosion', 'short circuit', 'electrocuted', 'live wire', 'snapped', 'pothole', 'crater', 'cracked', 'collapse', 'caved',
      'sinkhole', 'slush', 'broken glass', 'spilled', 'oil spill', 'leaking', 'overflowing', 'storm', 'hail'],
    works: ['construction', 'repair', 'digging', 'dug', 'excavation', 'excavator', 'maintenance', 'renovation', 'painting', 'crane', 'cement',
      'concreting', 'tarring', 'drilling', 'welding', 'roadwork', 'road work', 'pipeline work', 'cable work', 'work in progress', 'in progress',
      'under construction', 'jcb', 'bulldozer', 'earthmover', 'steamroller'],
    event: ['procession', 'rally', 'marathon', 'parade', 'festival', 'crowd', 'concert', 'vip', 'vvip', 'convoy', 'cavalcade', 'protest', 'strike',
      'bandh', 'dharna', 'sports day', 'sports meet', 'annual day', 'ceremony', 'inauguration', 'exhibition', 'career fair', 'fete', 'fiesta',
      'prayer meeting', 'assembly', 'flash mob', 'walkathon', 'cyclothon', 'event'],
    info: [],
    clear: ['open', 'opened', 'reopening', 'reopened', 'reopen', 'clear', 'cleared', 'clearing', 'finished', 'complete', 'completed', 'resumed',
      'resume', 'resuming', 'normal', 'restored', 'passable', 'accessible', 'unblocked', 'removing', 'back to normal', 'good to go', 'all good']
  };
  // Words that make a report uncertain or stale — it is then queued for a person instead of acted on.
  var HEDGES = ['might', 'may', 'maybe', 'perhaps', 'possibly', 'probably', 'likely', 'i think', 'not sure', 'unsure', 'rumour', 'rumor', 'heard',
    'apparently', 'supposedly', 'planned', 'planning', 'tomorrow', 'next week', 'yesterday', 'last week', 'last night', 'last month'];

  function norm(text) { return ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
  function hasWord(t, w) { return t.indexOf(' ' + w + ' ') >= 0; }
  var kwCache = {};
  function kwRe(kw) {
    if (!kwCache[kw]) {
      var esc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var parts = kw.split(' '), last = parts.pop();
      var suf = last.length >= 5 ? '(?:s|es|ed|d|ing|ies)?' : '';
      kwCache[kw] = new RegExp(' ' + parts.concat(esc(last) + suf).join(' ') + '(?= )');
    }
    return kwCache[kw];
  }
  function relock() { kwCache = {}; }

  // Which place names does the text mention? (ends of the road, or places it passes through)
  function inferRoad(g, t) {
    var best = null, bestHits = 0;
    g.roads.forEach(function (r) {
      var hits = 0;
      r.pts.forEach(function (id, i) {
        var n = nodeById(g, id);
        if (!n || n.kind === 'cross' || !n.name || norm(n.name).trim().length < 3) return;
        if (t.indexOf(norm(n.name)) >= 0) hits++;
      });
      if (hits > bestHits) { bestHits = hits; best = r; }
    });
    if (best && bestHits >= 2) return { roadId: best.id, how: 'named', placeId: null };
    var places = 0, sole = null, soleRoad = null;
    g.nodes.forEach(function (n) {
      if (n.kind === 'cross' || !n.name || norm(n.name).trim().length < 3 || t.indexOf(norm(n.name)) < 0) return;
      places++;
      var on = g.roads.filter(function (r) { return r.pts.indexOf(n.id) >= 0; });
      if (on.length === 1 && !sole) { sole = n; soleRoad = on[0]; }
    });
    if (places === 1 && sole) return { roadId: soleRoad.id, how: 'sole', placeId: sole.id };
    return { roadId: null, how: null, placeId: null };
  }

  // Read one report: what happened, which road, how sure we are (0–100).
  // opts: { roadId (the reporter tapped a road), photo, keywords: { cat: [extra words] } }
  function assess(g, text, opts) {
    opts = opts || {};
    var t = norm(text), matched = {}, best = null, bestScore = -1;
    Object.keys(KEYWORDS).forEach(function (cat) {
      var hits = [];
      KEYWORDS[cat].concat((opts.keywords && opts.keywords[cat]) || []).forEach(function (kw) {
        kw = String(kw).toLowerCase().trim(); if (!kw) return;
        var m = kwRe(kw).exec(t);
        if (m) hits.push(kw);
      });
      if (hits.length) matched[cat] = hits;
    });
    Object.keys(matched).forEach(function (cat) {
      // "cleared" outranks the problem it refers to ("road reopened after the block")
      var s = matched[cat].length + (cat === 'clear' ? 1 : 0);
      if (s > bestScore) { bestScore = s; best = cat; }
    });
    var hedge = HEDGES.filter(function (w) { return hasWord(t, w); });
    var roadId = null, roadHow = null, placeId = null;
    if (opts.roadId && roadById(g, opts.roadId)) { roadId = opts.roadId; roadHow = 'picked'; }
    else { var inf = inferRoad(g, t); roadId = inf.roadId; roadHow = inf.how; placeId = inf.placeId; }
    var score = { picked: 45, named: 45, sole: 30 }[roadHow] || 0;
    if (best && best !== 'info') score += 25;
    if (best && matched[best] && matched[best].length >= 2) score += 10;
    if (opts.photo) score += 15;
    if (hedge.length) score -= 30;
    score = Math.max(0, Math.min(100, score));
    return {
      cat: best || 'info', matched: (best && matched[best]) || [], hedge: hedge, score: score,
      level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low', roadId: roadId, roadHow: roadHow, placeId: placeId
    };
  }

  var DEFAULT_RULES = {
    mode: { closure: 'auto', hazard: 'auto', works: 'auto', event: 'review' },
    minReports: 1,      // reports needed before a road is closed automatically
    autoReopen: false   // reopen an unconfirmed block when a report clearly says the road is clear
  };

  // What the automatic system does with a report. env: { g, posts, rules, now }.
  // action: blocked | counting | agree | review-block | review-reopen | reopened | none
  function decide(v, env) {
    var g = env.g, rules = env.rules || DEFAULT_RULES, posts = env.posts || [], now = env.now || Date.now();
    var out = { action: 'none', caseType: null, reason: [], trigger: [] }, r = v.roadId ? roadById(g, v.roadId) : null;
    if (v.cat === 'info') { out.reason.push('nothing to act on'); return out; }
    if (!r) { out.reason.push('no road identified, so nothing was touched'); return out; }
    if (v.cat === 'clear') {
      if (!r.blocked) { out.reason.push('road is already open'); return out; }
      if (v.level === 'low') { out.reason.push('not sure enough to ask about reopening'); return out; }
      var provisional = r.meta && r.meta.by === 'auto' && !r.meta.confirmed;
      if (v.level === 'high' && rules.autoReopen && provisional) { out.action = 'reopened'; out.caseType = 'ack-reopen'; }
      else { out.action = 'review-reopen'; out.caseType = 'reopen'; }
      return out;
    }
    if (r.blocked) { out.action = 'agree'; out.reason.push('road is already closed'); return out; }
    var mode = rules.mode[v.cat] || 'review';
    if (v.level === 'low') { out.reason.push('only ' + v.score + '% sure — left for a person to judge'); return out; }
    if (v.level === 'medium') { out.action = 'review-block'; out.caseType = 'block'; out.reason.push('only ' + v.score + '% sure — left for a person to decide'); return out; }
    if (mode === 'review') { out.action = 'review-block'; out.caseType = 'block'; out.reason.push('rule: "' + CATS[v.cat].label + '" asks the admin first'); return out; }
    if (mode === 'none') { out.reason.push('rule: "' + CATS[v.cat].label + '" is set to ignore'); return out; }
    var need = Math.max(1, +rules.minReports || 1);
    var waiting = posts.filter(function (p) {
      return p.roadId === r.id && p.action === 'counting' && now - p.ts < 864e5;
    });
    if (waiting.length + 1 < need) {
      out.action = 'counting'; out.reason.push('waiting for ' + (need - waiting.length - 1) + ' more report' + (need - waiting.length > 2 ? 's' : ''));
      return out;
    }
    out.action = 'blocked'; out.caseType = 'keep-block'; out.trigger = waiting.map(function (p) { return p.id; });
    return out;
  }

  // Plain-language situation summary for the admin, written from the live data.
  function brief(g, posts, now) {
    now = now || Date.now();
    var out = [];
    if (!posts.length) return ['No reports yet — nothing is closed.'];
    var closed = g.roads.filter(function (r) { return r.blocked; });
    var pending = posts.filter(function (p) { return p.case && p.case.status === 'pending'; });
    var day = posts.filter(function (p) { return now - p.ts < 864e5; });
    out.push(day.length ? day.length + ' report' + (day.length > 1 ? 's' : '') + ' in the last 24 h.' : 'No reports in the last 24 h.');
    out.push(closed.length ? closed.length + ' road' + (closed.length > 1 ? 's' : '') + ' closed: ' + closed.map(function (r) { return roadName(g, r); }).join(', ') + '.' : 'All roads are open.');
    if (pending.length) out.push(pending.length + ' decision' + (pending.length > 1 ? 's' : '') + ' waiting for you.');
    var count = {}, hot = null, hn = 1;
    posts.forEach(function (p) { if (p.roadId && roadById(g, p.roadId)) count[p.roadId] = (count[p.roadId] || 0) + 1; });
    Object.keys(count).forEach(function (id) { if (count[id] > hn) { hn = count[id]; hot = id; } });
    if (hot) out.push('Most reported: ' + roadTitle(g, roadById(g, hot)) + ' (' + hn + '×).');
    return out;
  }

  // Three believable reports for a first look at the Live feed.
  function sampleReports(g) {
    function pick(a, b, fallback) {
      var r = g.roads.filter(function (x) { return x.pts.indexOf(a) >= 0 && x.pts.indexOf(b) >= 0; })[0];
      return (r || g.roads[fallback] || g.roads[0] || {}).id || null;
    }
    return [
      { author: 'Anu', text: 'The road past the library is blocked — a tree fell in the storm.', roadId: pick('nC', 'nM', 0) },
      { author: 'Rahul', text: 'Waterlogging near the junction, two-wheelers are stuck.', roadId: pick('nD', 'nM', 1) },
      { author: 'Meera', text: 'Stage is being set up for the festival on the main road, it may be closed tomorrow.', roadId: pick('nC', 'nB', 2) }
    ];
  }

  return {
    PX_PER_M: PX_PER_M, SNAP: SNAP, CATS: CATS, BLOCKERS: BLOCKERS, KEYWORDS: KEYWORDS, HEDGES: HEDGES, DEFAULT_RULES: DEFAULT_RULES,
    dist: dist, segSeg: segSeg, nearestOnSeg: nearestOnSeg, nearestOnRoad: nearestOnRoad, bounds: bounds,
    nodeById: nodeById, roadById: roadById, edgesOf: edgesOf, roadPx: roadPx, meters: meters, edgeMeters: edgeMeters,
    code: code, roadName: roadName, roadTitle: roadTitle, roadMid: roadMid, nextCode: nextCode,
    planarize: planarize, solveCross: solveCross, resolveCrossings: resolveCrossings, deleteNode: deleteNode, deleteRoad: deleteRoad,
    edgeBetween: edgeBetween, normalize: normalize, defaultGraph: defaultGraph,
    dijkstra: dijkstra, planRoute: planRoute,
    norm: norm, assess: assess, decide: decide, brief: brief, sampleReports: sampleReports, relock: relock
  };
});
