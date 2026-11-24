"""Inline the CSS and JS into one standalone app/index.html.

Usage: build.py SRC_DIR APP_OUT_DIR [LUCIDE_JS_TO_COPY]
"""
import pathlib
import shutil
import sys

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
html = (src / "index.html").read_text(encoding="utf-8")
for token, name in (("/*__CSS__*/", "style.css"), ("/*__CORE__*/", "core.js"), ("/*__APP__*/", "app.js"), ("/*__VIEWS__*/", "views.js")):
    body = (src / name).read_text(encoding="utf-8")
    assert "</script" not in body.lower(), name + " contains a script-closing tag"
    assert html.count(token) == 1, "token " + token + " must appear exactly once"
    html = html.replace(token, body)
assert "/*__" not in html, "a placeholder token was left behind"

out.mkdir(parents=True, exist_ok=True)
(out / "index.html").write_text(html, encoding="utf-8", newline="\n")
if len(sys.argv) > 3:
    shutil.copyfile(sys.argv[3], out / "lucide.min.js")
print("built", out / "index.html", "-", len(html), "chars")
