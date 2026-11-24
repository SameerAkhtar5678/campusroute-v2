"""Apply small glue fixes to the freshly written sources. Fails loudly if an anchor is missing.

Usage: patch.py SRC_DIR
"""
import pathlib
import sys

src = pathlib.Path(sys.argv[1])

PATCHES = {
    "app.js": [
        # finishDraft: know which nodes existed before the drag, so a rejected road leaves nothing behind
        ("""    if (target && target.id === p.from) return;
    pushUndo();
    var from = p.from ? C.nodeById(CR.G, p.from) : addJunction(p.x0, p.y0);
""", """    if (target && target.id === p.from) return;
    var G = CR.G, before = G.nodes.map(function (n) { return n.id; });
    var from = p.from ? C.nodeById(G, p.from) : addJunction(p.x0, p.y0);
"""),
        ("""      var near = rEl ? { road: C.roadById(CR.G, rEl.getAttribute('data-road')), q: C.nearestOnRoad(CR.G, C.roadById(CR.G, rEl.getAttribute('data-road')), pt.x, pt.y) } : nearestRoad(pt, C.SNAP);
      to = near && near.road ? addJunction(near.q.x, near.q.y) : addJunction(pt.x, pt.y);
""", """      var onRoad = rEl ? { road: C.roadById(G, rEl.getAttribute('data-road')) } : nearestRoad(pt, C.SNAP);
      var q = onRoad && onRoad.road ? C.nearestOnRoad(G, onRoad.road, pt.x, pt.y) : null;
      to = q ? addJunction(q.x, q.y) : addJunction(pt.x, pt.y);
"""),
        ("""    var dup = C.edgeBetween(CR.G, from.id, to.id);
    if (dup) {
      S.undo.pop(); syncTools();
""", """    var dup = C.edgeBetween(G, from.id, to.id);
    if (dup) {
      G.nodes = G.nodes.filter(function (n) { return before.indexOf(n.id) >= 0; });
"""),
        ("""      CR.toast('Those places are already joined by road ' + C.roadName(CR.G, C.roadById(CR.G, dup.road)));
      CR.G.nodes = CR.G.nodes.filter(function (n) { return n.id !== from.id || p.from || CR.G.roads.some(function (r) { return r.pts.indexOf(n.id) >= 0; }); });
      return;
    }
    CR.G.roads.push({ id: uid('r'), pts: [from.id, to.id], blocked: false, meta: null });
    var made = settle();
    afterChange();
    CR.toast(made ? 'Road added — a junction appeared where the roads cross' : 'Road ' + C.roadName(CR.G, CR.G.roads[CR.G.roads.length - 1]) + ' added');
""", """      CR.toast('Those places are already joined by road ' + C.roadName(G, C.roadById(G, dup.road)));
      return;
    }
    pushUndo();
    var road = { id: uid('r'), pts: [from.id, to.id], blocked: false, meta: null };
    G.roads.push(road);
    var made = settle();
    afterChange();
    CR.toast(made ? 'Road added — ' + made + ' junction' + (made > 1 ? 's' : '') + ' appeared where the roads cross' : 'Road ' + C.roadName(G, road) + ' added');
"""),
        # let views.js use the design helpers
        ("""    afterChange(); syncTools();
  };
""", """    afterChange(); syncTools();
  };
  CR.pushUndo = pushUndo; CR.settle = settle; CR.afterChange = afterChange; CR.eraseNode = eraseNode; CR.fitView = fitView;
"""),
        ("""CR.toast(r.blocked ? 'Road ' + C.roadName(CR.G, r) + ' reopened' : 'Road ' + C.roadName(CR.G, r) + ' closed'); } closePop(); break; }""",
         """CR.toast(r.blocked ? 'Road ' + C.roadName(CR.G, r) + ' closed' : 'Road ' + C.roadName(CR.G, r) + ' reopened', r.blocked ? 'warn' : 'ok'); } closePop(); break; }"""),
        ("""el.addEventListener('click', function (e) { if (e.target.closest('[data-act]')) return; fn(); el.remove(); });""",
         """el.addEventListener('click', function (e) { if (e.target.closest('[data-act="undo"]')) return; fn(); el.remove(); });"""),
        ("""  // ───────── persistence + other tabs ─────────
""", """  $('#toasts').addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('[data-act="undo"]') : null; if (!a) return;
    CR.undo(); var t = a.closest('.toast'); if (t) t.remove();
  });
  // ───────── persistence + other tabs ─────────
"""),
    ],
    "views.js": [
        # these live in app.js, next to the rest of the design edits
        ("""  CR.pushUndo = function () { S.undo.push(JSON.stringify({ nodes: G().nodes, roads: G().roads })); if (S.undo.length > 40) S.undo.shift(); CR.syncTools(); };
  CR.eraseNode = function (n) {
    CR.pushUndo(); C.deleteNode(G(), n.id); CR.settle(); CR.afterChange();
    CR.toast(n.name + ' deleted · <u data-act="undo">Undo</u>');
  };
  CR.settle = function () { C.resolveCrossings(G(), false); return C.planarize(G(), function (x, y) { var j = { id: CR.uid('n'), code: C.nextCode(G(), 'X'), name: 'Crossing', type: 'junction', x: x, y: y, kind: 'cross' }; G().nodes.push(j); return j; }).length; };
  CR.afterChange = function () {
    ['start', 'end'].forEach(function (k) { if (S[k] && !node(S[k])) S[k] = null; });
    S.stops = S.stops.filter(function (x) { return !!node(x); });
    if (S.selNode && !node(S.selNode)) S.selNode = null;
    S.watch = false; CR.saveGraph(); CR.recompute(); CR.renderGraph(); CR.renderPanel(); CR.syncHint();
  };
""", """  // (pushUndo, settle, afterChange and eraseNode are defined in app.js, with the rest of the design edits)
"""),
        ("""  function openAdmin() { S.mode = 'admin'; S.pickRoad = null; CR.closePop(); document.querySelectorAll('#modes .mode').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mode') === 'admin'); }); $('#tools').hidden = true; CR.renderPanel(); CR.syncHint(); CR.syncGraph(); }""",
         """  function openAdmin() { CR.setMode('admin'); CR.renderPanel(); }"""),
        ("""      case 'delroads': var n0 = node(S.selNode); if (n0) { CR.pushUndo(); G().roads = G().roads.filter(function (x) { return x.pts.indexOf(n0.id) < 0; }); C.pruneCross(G()); CR.settle(); CR.afterChange(); } break;""",
         """      case 'delroads': var n0 = node(S.selNode); if (n0) { CR.pushUndo(); G().roads.filter(function (x) { return x.pts.indexOf(n0.id) >= 0; }).forEach(function (x) { C.deleteRoad(G(), x.id); }); CR.settle(); CR.afterChange(); } break;"""),
        ("""        try { navigator.clipboard.writeText(code); CR.toast('Export code copied — paste it on another device', 'ok'); } catch (e) { CR.toast('Copy the code from the text box'); } break;
""", """        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(function () { CR.toast('Export code copied — paste it on another device', 'ok'); }, function () { CR.toast('The code is in the text box — copy it from there'); });
        } else CR.toast('The code is in the text box — copy it from there');
        break;
"""),
        ("""    var auto = CR.posts.filter(function (p) { return p.action === 'blocked'; }).length;""",
         """    var auto = G().roads.filter(function (r) { return r.blocked && r.meta && r.meta.by === 'auto'; }).length;"""),
        ("""kpi('zap', 'Closed automatically', auto, 'amber')""", """kpi('zap', 'Closed on a report', auto, 'amber')"""),
    ],
    "core.js": [
        # equal counts keep the earlier category (closure > hazard > works > event); "clear" still outranks the problem it mentions
        ("""    var t = norm(text), matched = {}, lastAt = {}, best = null, bestScore = -1;""",
         """    var t = norm(text), matched = {}, best = null, bestScore = -1;"""),
        ("""      var hits = [], lp = -1;""", """      var hits = [];"""),
        ("""        if (m) { hits.push(kw); lp = Math.max(lp, m.index); }""", """        if (m) hits.push(kw);"""),
        ("""      if (hits.length) { matched[cat] = hits; lastAt[cat] = lp; }""", """      if (hits.length) matched[cat] = hits;"""),
        ("""      // "cleared" beats the problem it refers to ("road reopened after the block")
      var s = matched[cat].length + (cat === 'clear' ? 1 : 0) + lastAt[cat] / (t.length + 1);
""", """      // "cleared" outranks the problem it refers to ("road reopened after the block")
      var s = matched[cat].length + (cat === 'clear' ? 1 : 0);
"""),
    ],
}

for name, fixes in PATCHES.items():
    path = src / name
    text = path.read_text(encoding="utf-8")
    for old, new in fixes:
        n = text.count(old)
        if n != 1:
            sys.exit("PATCH FAILED in %s: anchor found %d times:\n%s" % (name, n, old[:160]))
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8", newline="\n")
    print("patched", name, "-", len(fixes), "fixes")
