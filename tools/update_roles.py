# Role gate (citizen/admin) + Questions feature. Safe to re-run: skips edits already applied.
import pathlib


def apply(path, reps):
    p = pathlib.Path(path)
    s = p.read_text(encoding='utf-8')
    for old, new in reps:
        if new in s:
            continue                      # already applied
        n = s.count(old)
        if n != 1:
            raise SystemExit('ANCHOR x%d in %s: %s' % (n, path, old[:90]))
        s = s.replace(old, new)
    p.write_text(s, encoding='utf-8', newline='\n')
    print('ok', path)


apply('src/app.js', [
    # questions mode: tapping a place attaches it to the question; hint text
    ("    if (tg.node) { tapNode(tg.node.id); return; }\n",
     "    if (S.mode === 'questions') { S.qAbout = tg.node ? tg.node.id : null; S.pickQ = false; syncHint(); CR.renderPanel(); return; }\n"
     "    if (tg.node) { tapNode(tg.node.id); return; }\n"),
    ("    else if (S.mode === 'live') t = '<b>Reports show up on the roads</b> · tap a road to read or add an update';\n",
     "    else if (S.mode === 'live') t = '<b>Reports show up on the roads</b> · tap a road to read or add an update';\n"
     "    else if (S.mode === 'questions') t = '<b>Tap any place</b> on the map to make your question about it';\n"),
    ("if (Array.isArray(d.qs)) CR.qs = d.qs;",
     "if (Array.isArray(d.qs)) CR.qs = d.qs; if (d.adminCode) CR.adminCode = d.adminCode;"),
    ("    fitView(); renderGraph(); CR.renderPanel(); CR.syncBadges(); syncTools(); syncHint(); CR.icons();",
     "    fitView(); renderGraph(); CR.renderPanel(); CR.syncBadges(); syncTools(); syncHint(); CR.applyRole(); CR.icons();"),
])

QFN = """  function qHTML(q) {
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
"""

apply('src/views.js', [
    ("      : S.mode === 'design' ? viewDesign() : S.mode === 'live' ? viewLive() : viewAdmin();",
     "      : S.mode === 'design' ? viewDesign() : S.mode === 'live' ? viewLive() : S.mode === 'questions' ? viewQuestions() : viewAdmin();"),
    ("    if (k === 'text') S.composer.text = el.value;",
     "    if (k === 'text') S.composer.text = el.value;\n"
     "    else if (k === 'qtext') S.qText = el.value;\n"
     "    else if (k === 'admincode') { CR.adminCode = el.value.trim() || 'ADMIN2026'; CR.persist(); CR.share(); }"),
    ("  var a = $('#cnt-admin'), n = pending().length;\n    a.hidden = !n; a.textContent = n;\n  };\n",
     "  var a = $('#cnt-admin'), n = pending().length;\n    a.hidden = !n; a.textContent = n;\n"
     "    var qb = $('#cnt-q'), qn = CR.qs.filter(function (x) { return !(x.replies || []).length; }).length;\n"
     "    if (qb) { qb.hidden = !qn; qb.textContent = qn; }\n  };\n" + QFN),
    ("      // admin\n      case 'admin-tab':",
     "      // questions\n"
     "      case 'pickq': S.pickQ = !S.pickQ; CR.syncHint(); CR.renderPanel(); break;\n"
     "      case 'askq': {\n"
     "        var qt = (S.qText || '').trim();\n"
     "        if (!qt) { CR.toast('Write the question first'); break; }\n"
     "        CR.qs.unshift({ id: CR.uid('q'), ts: Date.now(), author: (CR.author || '').trim() || 'Someone', text: qt, nodeId: S.qAbout || null, replies: [] });\n"
     "        S.qText = ''; S.qAbout = null; S.pickQ = false;\n"
     "        CR.persist(); CR.share(); CR.renderPanel(); CR.syncBadges(); CR.syncHint();\n"
     "        CR.toast('Question raised — the admin will see it', 'ok');\n"
     "        break;\n"
     "      }\n"
     "      case 'replyq': {\n"
     "        var q0 = CR.qs.filter(function (x) { return x.id === id; })[0]; if (!q0) break;\n"
     "        var ri = document.querySelector('[data-in=\"reply-' + id + '\"]');\n"
     "        var rt = ri ? ri.value.trim() : '';\n"
     "        if (!rt) { CR.toast('Write a reply first'); break; }\n"
     "        q0.replies.push({ ts: Date.now(), by: 'Admin', text: rt });\n"
     "        CR.persist(); CR.share(); CR.renderPanel(); CR.syncBadges();\n"
     "        CR.toast('Reply posted', 'ok');\n"
     "        break;\n"
     "      }\n"
     "      // admin\n      case 'admin-tab':"),
    ("</span></label></div>';\n      h += '<div class=\"card\"><div class=\"ct\">Signal words",
     "</span></label>' +\n"
     "        '<label class=\"rule\"><span class=\"rl\">Admin code <small>needed to unlock admin mode on any device</small></span><input class=\"inp\" data-in=\"admincode\" value=\"' + esc(CR.adminCode) + '\" maxlength=\"24\" style=\"max-width:170px\" autocomplete=\"off\"></label></div>';\n"
     "      h += '<div class=\"card\"><div class=\"ct\">Signal words"),
    ("    if (ev.key === 'Escape') { $('#lightbox').hidden = true; if (S.pickRoad || S.pickNode) { CR.cancelPick(); return; } CR.closePop(); }",
     "    if (ev.key === 'Enter' && ev.target.id === 'admin-code') { document.querySelector('[data-role=\"admin\"]').click(); return; }\n"
     "    if (ev.key === 'Escape') { $('#lightbox').hidden = true; if (S.pickRoad || S.pickNode || S.pickQ) { CR.cancelPick(); return; } CR.closePop(); }"),
])

apply('src/index.html', [
    ("Live<span class=\"cnt\" id=\"cnt-live\" hidden></span></button>",
     "Live<span class=\"cnt\" id=\"cnt-live\" hidden></span></button>\n"
     "      <button class=\"mode\" data-act=\"mode\" data-mode=\"questions\"><i data-lucide=\"messages-square\"></i>Questions<span class=\"cnt\" id=\"cnt-q\" hidden></span></button>"),
    ("    </nav>\n  </header>",
     "    </nav>\n    <button class=\"rolebtn\" id=\"rolebtn\" data-act=\"signout\" hidden></button>\n  </header>"),
    ("  </main>\n</div>",
     "  </main>\n"
     "  <div class=\"gate\" id=\"gate\" hidden>\n"
     "    <div class=\"gatebox\">\n"
     "      <span class=\"logo\"><i data-lucide=\"route\"></i></span>\n"
     "      <h1>CampusRoute</h1>\n"
     "      <p>Who is signing in?</p>\n"
     "      <button class=\"btn primary wide\" data-act=\"role\" data-role=\"citizen\"><i data-lucide=\"user\"></i>Enter as citizen</button>\n"
     "      <button class=\"btn wide\" data-act=\"role\" data-role=\"adminpick\"><i data-lucide=\"shield\"></i>Admin mode</button>\n"
     "      <div id=\"adminbox\" hidden>\n"
     "        <input class=\"inp\" id=\"admin-code\" placeholder=\"Paste the admin code\" autocomplete=\"off\">\n"
     "        <button class=\"btn primary wide\" data-act=\"role\" data-role=\"admin\"><i data-lucide=\"lock-open\"></i>Unlock admin mode</button>\n"
     "        <div id=\"adminmsg\"></div>\n"
     "      </div>\n"
     "    </div>\n"
     "  </div>\n</div>"),
])

css = pathlib.Path('src/style.css')
s = css.read_text(encoding='utf-8')
if 'sign-in gate + role' not in s:
    s += """
/* sign-in gate + role */
.gate{position:fixed;inset:0;background:linear-gradient(160deg,#f4f2ec,#e9e5da);display:grid;place-items:center;z-index:80;padding:20px}
.gatebox{width:min(340px,92vw);background:#fff;border:1px solid var(--line);border-radius:22px;padding:26px 22px;box-shadow:0 30px 80px -30px rgba(32,36,46,.45);display:flex;flex-direction:column;gap:10px;text-align:center}
.gatebox .logo{width:52px;height:52px;border-radius:16px;margin:0 auto}
.gatebox .logo svg{width:26px;height:26px}
.gatebox h1{margin:6px 0 0;font-size:22px;font-weight:600}
.gatebox>p{margin:0 0 8px;color:var(--muted);font-size:13.5px}
#adminbox{display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px dashed var(--line)}
#adminmsg{color:var(--red);font-size:12.5px;min-height:16px;text-align:center}
.rolebtn{padding:7px 14px;border-radius:999px;border:1.5px solid var(--line2);background:#fff;font-size:13px;font-weight:500;color:var(--muted);display:inline-flex;gap:7px;align-items:center;white-space:nowrap;flex:none;margin-left:8px}
.rolebtn b{color:var(--ink);font-weight:600}
.rolebtn:hover{color:var(--ink);border-color:var(--dim)}
.reply{background:var(--green-soft);border-radius:10px;padding:7px 10px;font-size:13px;line-height:1.4;display:flex;flex-direction:column;text-align:left}
.reply b{font-size:12px;color:var(--green)}
.reply small{color:var(--dim);font-size:11px;margin-top:2px}
"""
    css.write_text(s, encoding='utf-8', newline='\n')
print('ok src/style.css')
print('ALL EDITS APPLIED')
