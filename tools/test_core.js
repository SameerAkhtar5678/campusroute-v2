// Logic tests for CampusRoute core.  Usage: node test_core.js PATH_TO_core.js
'use strict';
const C = require(process.argv[2]);
let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('FAIL:', msg); } else console.log('ok  :', msg); }
function mk(g) {
  return (x, y) => { const n = { id: 'x' + g.nodes.length, code: C.nextCode(g, 'X'), name: 'Crossing', type: 'junction', x, y, kind: 'cross' }; g.nodes.push(n); return n; };
}
// any two road pieces that cross without sharing a node?
function crossPair(g) {
  const E = C.edgesOf(g);
  for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) {
    const a = E[i], b = E[j];
    if (a.road === b.road || [a.a, a.b].some(x => x === b.a || x === b.b)) continue;
    const p = [a.a, a.b, b.a, b.b].map(id => C.nodeById(g, id));
    const X = C.segSeg(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y);
    if (X && X.t > 1e-3 && X.t < 1 - 1e-3 && X.u > 1e-3 && X.u < 1 - 1e-3) return [a, b];
  }
  return null;
}
const near = (a, b) => Math.abs(a - b) < 1e-6;

// ── Dijkstra ─────────────────────────────────────────────────────────────
let g = C.defaultGraph();
let r = C.planRoute(g, ['nC', 'nA']);
ok(r.ok && r.total === 75 && r.legs[0].path.join() === 'nC,nM,nA', 'C to A goes C-M-A, 75 m (got ' + r.total + ', ' + (r.legs[0] || {}).path + ')');
ok(r.steps.some(s => s.t === 'relax' && s.improved) && r.steps.some(s => s.t === 'pick'), 'the run is logged step by step (' + r.steps.length + ' lines)');
g.roads[4].blocked = true; g.roads[5].blocked = true;                 // C-M and D-M closed
r = C.planRoute(g, ['nC', 'nA']);
ok(r.ok && r.total === 94 && r.legs[0].path.join() === 'nC,nB,nA', 'with C-M closed: C to A detours C-B-A, 94 m (got ' + r.total + ')');
ok(r.baseline === 75, 'the same trip with every road open would be 75 m (got ' + r.baseline + ')');
ok(r.steps.filter(s => s.t === 'blocked').length >= 1, 'closed roads are logged as skipped');
g = C.defaultGraph(); [0, 1, 4].forEach(i => { g.roads[i].blocked = true; });   // C cut off on all three sides
r = C.planRoute(g, ['nC', 'nA']);
ok(!r.ok && r.steps[r.steps.length - 1].t === 'done' && !r.steps[r.steps.length - 1].found, 'C sealed off: no route, and the log says so');
r = C.planRoute(C.defaultGraph(), ['nC', 'nB', 'nD']);
ok(r.ok && r.total === 65 + 76 && r.legs.length === 2, 'trip with a stop: C-B (65) then B-M-D (76) = two legs, 141 m (got ' + r.total + ')');

// ── crossings ────────────────────────────────────────────────────────────
function box() {
  const n = (id, x, y) => ({ id, code: id, name: id, type: 'gate', x, y });
  const g = { nodes: [n('L', 100, 300), n('R', 900, 300), n('T', 500, 100), n('Bo', 500, 500)], roads: [
    { id: 'H', pts: ['L', 'R'], blocked: false, meta: null }, { id: 'V', pts: ['T', 'Bo'], blocked: false, meta: null }] };
  return g;
}
g = box();
let made = C.planarize(g, mk(g));
ok(made.length === 1 && g.nodes.length === 5, 'a horizontal and a vertical road → one junction created (' + made.length + ')');
const X = C.nodeById(g, made[0]);
ok(X && near(X.x, 500) && near(X.y, 300), 'the junction sits exactly where the roads cross (' + X.x + ', ' + X.y + ')');
ok(g.roads.find(x => x.id === 'H').pts.join() === 'L,' + X.id + ',R' && g.roads.find(x => x.id === 'V').pts.join() === 'T,' + X.id + ',Bo', 'both roads now pass through the junction');
ok(!crossPair(g), 'no two road pieces cross without a node any more');
ok(C.edgesOf(g).length === 4, 'two roads through one junction = 4 road pieces (' + C.edgesOf(g).length + ')');

// drag the right end down: the junction must slide along the vertical road
C.nodeById(g, 'R').y = 500;
C.resolveCrossings(g, false);
ok(g.nodes.length === 5 && near(X.x, 500) && near(X.y, 400), 'dragging an end of one road moves the junction to the new crossing (' + X.x + ', ' + X.y + ')');

// drag further so the roads stop crossing: the junction should vanish
C.nodeById(g, 'R').y = 760;
C.resolveCrossings(g, false); C.planarize(g, mk(g));
ok(g.nodes.length === 4 && g.roads.find(x => x.id === 'H').pts.join() === 'L,R', 'when the roads no longer cross the junction is removed again (' + g.nodes.length + ' nodes)');

// a road drawn across several roads gets a junction at every crossing
g = C.defaultGraph();
g.nodes.push({ id: 'nE', code: 'E', name: 'Hostel', type: 'hostel', x: 560, y: 480 });
g.roads.push({ id: 'rE', pts: ['nB', 'nE'], blocked: false, meta: null });
const before = crossPairAll(g);
function crossPairAll(gg) { const out = []; const E = C.edgesOf(gg); for (let i = 0; i < E.length; i++) for (let j = i + 1; j < E.length; j++) { const a = E[i], b = E[j]; if (a.road === b.road || [a.a, a.b].some(x => x === b.a || x === b.b)) continue; const p = [a.a, a.b, b.a, b.b].map(id => C.nodeById(gg, id)); const q = C.segSeg(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y); if (q && q.t > 1e-3 && q.t < 1 - 1e-3 && q.u > 1e-3 && q.u < 1 - 1e-3) out.push(1); } return out.length; }
made = C.planarize(g, mk(g));
ok(made.length === before && before >= 1 && !crossPair(g), 'a new road crossing ' + before + ' roads gets ' + made.length + ' junctions, none missing');
made.forEach(id => { const j = C.nodeById(g, id), on = g.roads.filter(x => x.pts.indexOf(id) > 0 && x.pts.indexOf(id) < x.pts.length - 1); ok(on.length === 2, 'junction ' + j.code + ' is passed through by exactly 2 roads'); });
r = C.planRoute(g, ['nB', 'nD']);
ok(r.ok, 'Dijkstra still routes through the re-cut roads (B to D = ' + r.total + ' m)');

// dropping a place onto a road connects it (a T-junction)
g = box(); const xid = C.planarize(g, mk(g))[0]; g.nodes.push({ id: 'S', code: 'S', name: 'Shop', type: 'store', x: 700, y: 520 }, { id: 'P', code: 'P', name: 'Gate', type: 'gate', x: 700, y: 300 }); g.roads.push({ id: 'S1', pts: ['S', 'P'], blocked: false, meta: null });
made = C.planarize(g, mk(g));
ok(made.length === 0 && g.roads.find(x => x.id === 'H').pts.join() === 'L,' + xid + ',P,R', 'a road that ends on another road joins it at a shared node instead of crossing it');

// erasing a road removes the junction it created
g = box(); C.planarize(g, mk(g)); C.deleteRoad(g, 'H');
ok(g.nodes.length === 4 && g.roads[0].pts.join() === 'T,Bo', 'erasing one road removes its crossing junction (' + g.nodes.length + ' nodes)');

// ── reading reports ──────────────────────────────────────────────────────
g = C.defaultGraph();
const rules = JSON.parse(JSON.stringify(C.DEFAULT_RULES)), posts = [], NOW = 1700000000000;
function read(text, roadId, extra) {
  const v = C.assess(g, text, Object.assign({ roadId: roadId }, extra || {}));
  const d = C.decide(v, { g, posts, rules, now: NOW });
  return Object.assign({}, v, d);
}
function feed(p) { posts.unshift({ roadId: p.roadId, action: p.action, cat: p.cat, ts: NOW }); }
let p = read('The road past the library is blocked — a tree fell in the storm.', 'r4');
ok((p.cat === 'closure' || p.cat === 'hazard') && p.level === 'high' && p.action === 'blocked', '“road … is blocked” + tapped road → Road closed, ' + p.score + '%, closes at once (got ' + p.cat + '/' + p.level + '/' + p.action + ')'); feed(p);
g.roads[4].blocked = true; g.roads[4].meta = { by: 'auto', confirmed: false };
p = read('Waterlogging near the junction, two-wheelers are stuck.', 'r5');
ok(p.cat === 'hazard' && p.action === 'blocked', '“waterlogging” → Hazard, closes at once (got ' + p.cat + '/' + p.action + ')'); feed(p);
p = read('Stage is being set up for the festival on the main road, it may be closed tomorrow.', 'r0');
ok(p.level === 'medium' && p.action === 'review-block', '“may be closed tomorrow” → hedged, goes to the admin (got ' + p.cat + '/' + p.level + '/' + p.action + ')'); feed(p);
p = read('Road to the labs from the library is closed for repair.', null);
ok(p.roadHow === 'named' && p.roadId === 'r0' && p.action === 'blocked', 'no road tapped, but both ends are named → finds road C-B itself (got ' + p.roadHow + '/' + p.roadId + '/' + p.action + ')'); feed(p);
p = read('Road reopened, the fallen tree is cleared.', 'r4');
ok(p.cat === 'clear' && p.action === 'review-reopen', '“reopened” on a closed road → asks the admin to reopen (got ' + p.cat + '/' + p.action + ')');
p = read('Meeting at 4 in the B block.', 'r1');
ok(p.cat === 'info' && p.action === 'none', '“B block” is a building, not a closure (got ' + p.cat + '/' + p.action + ')');
p = read('The library road is close to the gate.', 'r4');
ok(p.cat === 'info' && p.action === 'none', '“close to the gate” is a location, not a closure (got ' + p.cat + '/' + p.action + ')');
p = read('Canteen food was great today.', 'r2');
ok(p.cat === 'info' && p.action === 'none', 'chit-chat is noted, nothing happens (got ' + p.cat + '/' + p.action + ')');
p = read('Road is blocked near the office.', null);
ok(p.roadHow === null && p.action === 'none', '“blocked” with no road identified → nothing is touched (got ' + p.roadHow + '/' + p.action + ')');
p = read('I think the cafeteria road might be blocked.', 'r3');
ok(p.level === 'medium' && p.action === 'review-block', '“I think … might be” → not sure enough to act alone (got ' + p.level + '/' + p.action + ')');
p = read('Blocked, barricade up, diverted.', 'r6');
ok(p.matched.length >= 2 && p.score >= 80, 'several signal words raise the confidence (' + p.score + '%)');

rules.autoReopen = true;
p = read('Tree removed, road reopened and clear.', 'r4');
ok(p.action === 'reopened', 'with auto-reopen on, a clear report on an unconfirmed closure reopens the road (got ' + p.action + ')');
g.roads[4].meta.confirmed = true;
p = read('Tree removed, road reopened and clear.', 'r4');
ok(p.action === 'review-reopen', '…but never one the admin has confirmed (got ' + p.action + ')');

rules.minReports = 2; const saved = [];
p = read('Road closed for the parade.', 'r2'); saved.push(p); feed(p);
ok(p.action === 'counting', 'needs 2 reports: the first is only counted (got ' + p.action + ')');
p = read('Procession has blocked the road.', 'r2');
ok(p.action === 'blocked' && p.trigger.length === 1, '…the second one closes it, and the first is marked as agreed (' + p.action + ', ' + p.trigger.length + ')');
rules.minReports = 1; rules.mode.works = 'review';
p = read('Digging on the road, repair work in progress.', 'r1');
ok(p.action === 'review-block', 'the admin can make any category ask first (got ' + p.action + ')');

const b = C.brief(g, posts.concat(saved), NOW);
ok(b.length >= 3 && /closed/.test(b.join(' ')), 'situation brief is written from the data: ' + b.join(' '));

console.log(fails ? '\n' + fails + ' FAILED' : '\nALL PASSED');
process.exit(fails ? 1 : 0);
