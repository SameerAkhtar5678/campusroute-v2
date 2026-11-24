# CampusRoute v2

Campus routes, live reports and the admin control room — a school project.

- **Navigate** — tap where you are, tap where you're going: Dijkstra finds the shortest route and shows every step of its log.
- **Design** — place buildings (or photograph one and upload the picture as a new marker type), drag roads between them; wherever two roads cross, a junction node is created automatically.
- **Live** — anyone posts what's happening ("tree fell, road blocked") with photos; clear reports close or reopen roads automatically, vague ones go to the admin.
- **Questions** — citizens raise questions, the admin replies.
- **Admin** — code-protected control room: confirm closures, tune the automatic rules, add signal words, see the activity log.

## Run it

- Web: open `app/index.html` (works offline from a double-click), or host this folder.
- Windows: run `CampusRoute-Setup.exe` (built with Electron — see below) and it installs with one click.

**Admin code:** the default is `ADMIN2026` — change it in Admin → Rules.
