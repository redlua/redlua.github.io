# RedGet

**A complete code forge that runs entirely in your browser.**

Accounts, organizations, forges, files, commits, branches, issues, pull requests
with reviews, CI-style workflow runs, project boards, wikis, releases,
discussions, packages, gists, codespaces with a working terminal, notifications,
SSH and GPG keys, a marketplace, a command palette and a code editor — all of it
real, all of it local.

No server. No database service. No account anywhere else. No third-party domain
is ever contacted. Every byte lives in this browser's `localStorage` on this
machine.

---

## Start it

```bash
./red.sh serve            # Linux / macOS
red.bat serve             # Windows
```

Then open <http://localhost:4173>. Stop with `Ctrl+C`.

Any static file server works too (`python3 -m http.server 4173`, `npx serve .`).
Double-clicking `index.html` works for looking around, but browsers treat
`file://` as an opaque origin, so your account may not survive a reload — serve
it instead.

**Full guide:** [`startup.txt`](startup.txt) — or `./red.sh startup`.

## Install the `red` command (optional)

Want to type `red` from any folder, the way you type `git`? Run the installer
once. It needs Node 18+ and writes a tiny launcher that points at this folder —
nothing is downloaded, and the website itself never needs any of this.

```bash
bash install.sh             # Linux / macOS  → puts `red` on your PATH
install.bat                 # Windows        → installs red.cmd + updates PATH
```

Then, from anywhere:

```bash
red            # same as red help
red --info     # what this is, where it lives, every command
red --help
red serve      # run the site on http://localhost:4173
red export <forge>
```

Remove it again with `bash install.sh --uninstall` or `install.bat /uninstall`.
You can also always run `./red.sh …` / `red.bat …` from this folder without
installing anything.

## First run

1. Press **Create an account** and choose a username. That is all you enter.
2. RedGet generates a **15-character key**. That key *is* your password: anyone
   who has it can sign in as you, and there is no reset link, because there is
   no server to reset it with.
3. Copy or download the key immediately. Lose it and the account is unreachable.

You start **completely empty** — no seeded users, no fake badge counts, no
invented notifications, no automatic followers. Everything you see afterwards is
something you created.

Want something to look at first? **Settings → Data → "Load a demo workspace"**
builds a real organization, two forges with files and commits, a workflow that
actually runs, issues, a pull request with a review, a project board, wiki pages,
a release, a gist and a codespace — through the same code paths the UI uses.

## The `red` command

| Command | What it does |
| --- | --- |
| `red help` | every command and option |
| `red version` | version, Node release, file inventory |
| `red info` | about this install — what, where, every command |
| `red startup` | print the full startup guide |
| `red serve [port]` | run the site (default port 4173) |
| `red list` | every forge in an exported database |
| `red export <forge> [dir]` | copy a forge's files to your computer |
| `red export --all [dir]` | copy every forge out, one folder each |
| `red check` | run the whole validation suite |
| `red doctor` | diagnose this install |

Flags work as well: `red --help`, `red --info`, `red --version`, `red --startup`, `red --serve`.

### Copying a forge out

RedGet has no API to query, so the CLI reads the JSON you export from the app:

```bash
# 1. in RedGet: Settings → Data → "Export data as JSON"   (redget-data.json)
# 2. put that file next to red.sh, then:

red list                            # what is in there
red export atlas                    # one forge → ./atlas
red export redget-labs/beacon       # owner + name, no ambiguity
red export --all ./backup           # everything, one folder per forge
red export atlas ./out --json       # also write the full forge record
red export atlas --branch fix/x     # only files that branch changed
red list --db ~/Downloads/redget-data.json
```

Each export writes a `FORGE.md` describing what came out — owner, visibility,
language, branch, file and commit counts, and when you copied it. Paths listed in
[`.redignore`](.redignore) are never written out, and a file name that could
escape the target folder (`../`, absolute paths, drive letters) is refused.

## Checking the build

```bash
red check          # imports/exports · icon names · smoke test · link check
red doctor         # is Node new enough, is jsdom there, are the files present
```

Individually:

| Tool | What it proves |
| --- | --- |
| `tools/check-imports.mjs` | every import resolves, every named import really exists, no re-export of a name that is not imported, no external domain anywhere in the shipped source |
| `tools/check-icons.mjs` | every icon name used in `src/` exists in `ICONS` |
| `tools/smoke.mjs` | boots the real app in jsdom and walks **143 routes** — signed out, signed in, and with a v4 database that must migrate — then checks the DOM for dead ends and external domains |
| `tools/check-links.mjs` | follows every internal link across **400 pages**; nothing may 404 or render empty |
| `tools/bundle.mjs` | ESM → one classic script, so jsdom can run the app (test helper only) |

The smoke test needs jsdom once: `npm install jsdom@24`. Nothing else is
required — the app itself has **zero runtime dependencies** and no build step.

## Layout

```
index.html              the page shell
red.sh / red.bat        the red command
startup.txt             the full guide
redget.manifest.json    project metadata (not a database export)
.redignore              paths an export leaves out
assets/css/             tokens · base · components · header · views · overlay · extras
assets/favicon.svg      the mark
src/app.js              boot: theme → db → session → header → router → bindings
src/state.js            localStorage database, session, v4 → v5 migration
src/icons.js            every inline SVG icon (165)
src/core/               router, dom, util, keys, avatars, markdown, highlight,
                        modal, toast, theme, palette, social, notify, forges,
                        account, model, header, auth, bind, render, menu, orgs,
                        projects, wiki, actions, gists, codespaces, marketplace,
                        security, sshKeys, shortcuts, globals, demo
src/views/              landing, dashboard, profile, forge, forgeExtras, newForge,
                        explore, global, settings, projects, gists, codespaces,
                        marketplace, docs
tools/                  the validation suite
legacy/                 the previous build, kept for reference
```

## Vocabulary

RedGet uses its own words throughout: a project is a **forge**, its address is
`#/owner/name`, copying one out is **`red export`** (in the UI, *Copy this
forge* / `red copy`), the file a forge leaves out is **`.redignore`**, and
workflows live in **`.redget/workflows/`**. The in-codespace shell command is
**`rgt`** (`rgt status|log|branch|copy|pr|actions`).

## Rules this build keeps

- Original throughout — its own vocabulary, icons and markup. No third-party
  code host is referenced anywhere, and the validators fail the build if one is.
- No network calls: no CDN, no external fonts, scripts, images or APIs.
- Nothing fake: no seeded users, no invented counts, no placeholder routes.
- Every button, link and route does something real; nothing dead-ends.
- Vanilla ES modules — no build step, no runtime dependencies.

## Data

One `localStorage` entry: **`redget.db.v5`**.

- **Back up** — Settings → Data → *Export data as JSON*.
- **Copy forges out** — `red export …` (above).
- **Wipe** — Settings → Data → *Reset all data*, or Danger Zone → *Reset RedGet*.

Storage is per browser, per profile, per origin. Another browser, another
profile, a private window, or a different port all have their own separate
database — keep the JSON export as your backup.

---

RedGet 2.0.0
