/**
 * RedGet — mock repository content.
 *
 * Real, self-contained source files for the flagship repository so the Code tab,
 * blob view, blame, history, search, syntax highlighting, diffs and the wiki all
 * have something truthful to render. No external URLs are referenced anywhere in
 * this content: links are RedGet-relative placeholders such as /octored/redget-core.
 */

export const README_MD = `# RedGet Core

> Where the crimson code lives. RedGet Core is the reference implementation of the
> RedGet source-collaboration platform: repositories, issues, pull requests,
> RedGet Actions, projects, wikis and the security surface — all in one app.

![build status](/octored/redget-core/actions/badge.svg)
![coverage](/octored/redget-core/coverage.svg)
![license](/octored/redget-core/license.svg)

**RedGet** is a fully local, red-and-black themed collaboration platform. Every
route is a relative placeholder (\`/octored/redget-core\`, \`/octored/redget-core/issues/12\`)
and all data lives in your browser through \`localStorage\`. Nothing is fetched
from a network — there is no RedGet URL yet.

---

## Table of contents

- [Why RedGet](#why-redget)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Feature matrix](#feature-matrix)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Theming](#theming)
- [Contributing](#contributing)
- [License](#license)

## Why RedGet

| Concern | Traditional forge | RedGet |
| --- | --- | --- |
| Visual identity | blue/grey | **crimson on black** |
| Data location | remote service | local mock database |
| Themes | 2 | 5 (dark, crimson, light, 2 high contrast) |
| Offline | no | yes, fully |
| Accessibility | partial | ARIA-complete, keyboard-first |

RedGet renders the same information architecture you already know — repository
tabs, timelines, merge boxes, workflow runs — while guaranteeing that a screen
reader, a keyboard and a high-contrast display all get a first-class experience.

## Quick start

Serve the directory with any static server that falls back to \`index.html\`:

\`\`\`bash
# bundled development server (recommended)
node server.mjs --port 3000

# or plain python
python3 -m http.server 3000
\`\`\`

Then open \`/dashboard\`. The seeded dataset contains 2 organizations, 14 users and
9 repositories with issues, pull requests, workflow runs, releases and alerts.

### Reset the demo data

\`\`\`bash
node tools/seed.mjs --reset      # prints the reset instructions
\`\`\`

Or use the in-app menu: **avatar → Settings → Danger Zone → Reset local data**.

## Architecture

\`\`\`
redget/
├── index.html              # app shell: skip link, header slot, main, dialogs
├── server.mjs              # static dev server with SPA fallback
├── assets/
│   ├── css/                # tokens, base, header, repo, markdown, ui
│   └── icons/sprite.svg    # inline <symbol> icon set (currentColor)
├── data/                   # deterministic mock database + file contents
├── src/
│   ├── config.js           # brand, storage keys, routes, shortcuts
│   ├── core/               # bus, dom, i18n, router, store, theme, util
│   ├── components/         # header, repo chrome, diff, markdown, overlays
│   └── pages/              # one module per route family
└── tools/                  # validator + seed helpers
\`\`\`

### Rendering pipeline

1. \`router.js\` matches the pathname against \`ROUTE_PATTERNS\`.
2. The page module builds DOM nodes with \`h()\` from \`core/dom.js\`.
3. \`store.js\` supplies entities; mutations debounce-write to \`localStorage\`.
4. \`overlay.js\` owns dialogs, menus, toasts and tooltips.

> [!NOTE]
> All markup is created with \`createElement\`, never \`innerHTML\` interpolation of
> user data, so mock content can never inject script into the page.

> [!IMPORTANT]
> The command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>) indexes routes, repositories,
> issues, pull requests, files and settings — it is the fastest way around.

## Feature matrix

- [x] Repository code browser with tree, blob, blame, history and raw views
- [x] Issues with labels, milestones, assignees, reactions, timelines and filters
- [x] Pull requests with reviews, checks, suggested changes and three merge methods
- [x] RedGet Actions: workflows, runs, jobs, steps, logs, artifacts, caches
- [x] Projects (board / table / roadmap) with custom fields and views
- [x] Wiki with 10 markup formats, page history and custom sidebar
- [x] Security: advisories, Dependabot, code scanning, secret scanning
- [x] Insights: pulse, contributors, traffic, commit activity, dependency graph
- [x] Settings: general, access, branches, Actions, webhooks, danger zone
- [x] Profiles, organizations, teams, explore, search, notifications, gists
- [ ] Real network sync — *out of scope by design*

## Keyboard shortcuts

Press <kbd>?</kbd> anywhere for the full list. The essentials:

| Keys | Action |
| :--- | --- |
| <kbd>s</kbd> or <kbd>/</kbd> | Focus search |
| <kbd>Ctrl</kbd>+<kbd>K</kbd> | Command palette |
| <kbd>g</kbd> then <kbd>i</kbd> | Go to issues |
| <kbd>t</kbd> | File finder |
| <kbd>Shift</kbd>+<kbd>Y</kbd> | Toggle split / unified diff |
| <kbd>e</kbd> | Focus the comment editor |

## Theming

Themes are pure CSS custom properties on \`<html data-theme="…">\`:

\`\`\`css
[data-theme="dark"] {
  --bg-page: #0a0a0c;
  --accent: #d61a2f;
  --fg-link: #ff5f6d;
  --focus-ring: 0 0 0 3px rgba(255, 77, 95, 0.45);
}
\`\`\`

Switch themes from the avatar menu, or cycle them with the theme switcher in the
header. High-contrast variants raise text contrast to at least 7:1.

## Contributing

1. Fork \`/octored/redget-core\` from the repository header.
2. Create a branch: \`git switch -c feature/crimson-diffs\`.
3. Open a pull request against \`main\` and fill in the template.
4. Run \`node tools/validate.mjs\` — it parses every HTML, CSS, JS, JSON, YAML,
   Markdown, SVG, SQL, shell and config file in the repository and checks that
   every internal route resolves.

See [CONTRIBUTING.md](/octored/redget-core/blob/main/.redget/CONTRIBUTING.md) and
the [code of conduct](/octored/redget-core/blob/main/CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](/octored/redget-core/blob/main/LICENSE).

---

<details>
<summary>Roadmap and deferred ideas</summary>

The following are deliberately deferred until a real RedGet URL exists:

1. Server-side rendering of the route table
2. Signed commits and attestation verification against a real registry
3. Webhook delivery to third-party endpoints
4. Billing, plans and usage metering against a live account

Everything else in the product surface is rendered locally with mock data.

</details>

Built with :heart: in crimson and black.
`;

export const CONTRIBUTING_MD = `# Contributing to RedGet Core

Thanks for your interest in making RedGet redder. This document explains how the
local mock platform is organised and what we expect from a change.

## Ground rules

- Every link is relative. Never introduce an absolute external URL.
- Every colour comes from a token in \`assets/css/tokens.css\`.
- Every interactive element needs an accessible name and a visible focus ring.
- New markup is created with \`h()\` from \`src/core/dom.js\`.

## Development loop

\`\`\`bash
node server.mjs --port 3000
node tools/validate.mjs
\`\`\`

## Commit style

| Prefix | Use for |
| --- | --- |
| \`feat:\` | new user-visible capability |
| \`fix:\` | defect repair |
| \`style:\` | tokens, spacing, themes |
| \`docs:\` | markdown and the docs page |
| \`refactor:\` | no behaviour change |
| \`test:\` | validators and tools |

## Pull request checklist

- [ ] Ran \`node tools/validate.mjs\` with zero errors
- [ ] Added or updated mock data in \`data/\`
- [ ] Checked all five themes
- [ ] Checked the 375 px and 1280 px breakpoints
- [ ] Updated \`docs/\` if the HTML structure changed

## Reporting issues

Use the issue templates under \`.redget/ISSUE_TEMPLATE/\`. Security problems go to
the private reporting flow described in [SECURITY.md](/octored/redget-core/blob/main/SECURITY.md).
`;

export const CODE_OF_CONDUCT_MD = `# Contributor Covenant Code of Conduct

## Our Pledge

We as members, contributors, and leaders pledge to make participation in our
community a harassment-free experience for everyone, regardless of age, body
size, visible or invisible disability, ethnicity, sex characteristics, gender
identity and expression, level of experience, education, socio-economic status,
nationality, personal appearance, race, religion, or sexual identity and
orientation.

## Our Standards

Examples of behaviour that contributes to a positive environment:

* Using welcoming and inclusive language
* Being respectful of differing viewpoints and experiences
* Gracefully accepting constructive criticism
* Focusing on what is best for the community

Examples of unacceptable behaviour:

* Trolling, insulting or derogatory comments, and personal or political attacks
* Public or private harassment
* Publishing others' private information without explicit permission

## Enforcement

Instances of abusive, harassing, or otherwise unacceptable behaviour may be
reported to the community leaders responsible for enforcement at
\`conduct@redget.local\`. All complaints will be reviewed and investigated
promptly and fairly.

## Attribution

This Code of Conduct is adapted from the Contributor Covenant, version 2.1.
`;

export const SECURITY_MD = `# Security policy

RedGet Core takes security seriously, even though this build runs entirely on
local mock data.

## Supported versions

| Version | Supported |
| ------- | --------- |
| 4.x     | :white_check_mark: |
| 3.x     | :white_check_mark: |
| < 3.0   | :x: |

## Reporting a vulnerability

Please **do not** open a public issue. Use the private vulnerability reporting
flow at \`/octored/redget-core/security/advisories/new\` or email
\`security@redget.local\`.

You should receive a response within 48 hours. If the report is accepted we will:

1. Confirm the affected surface and assign a severity (CVSS 3.1).
2. Publish a draft security advisory under \`/octored/redget-core/security\`.
3. Ship a patch and request a CVE through our CNA process.
4. Credit you in the advisory unless you ask to remain anonymous.

## Scope

In scope: DOM injection, prototype pollution, storage poisoning, XSS through
markdown rendering, route matching bypasses.

Out of scope: anything requiring a network egress path — RedGet never makes one.
`;

export const LICENSE_TEXT = `MIT License

Copyright (c) 2026 RedGet, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

export const GITIGNORE = `# dependencies
node_modules/
.pnp
.pnp.js

# build output
dist/
build/
out/
coverage/

# caches
.cache/
.turbo/
.vite/
*.tsbuildinfo

# editors
.idea/
.vscode/*
!.vscode/extensions.json
*.swp

# os
.DS_Store
Thumbs.db

# redget local
.redget/local/
*.local.json
.env
.env.*
!.env.example

# logs
npm-debug.log*
yarn-error.log*
logs/
*.log
`;

export const PACKAGE_JSON = `{
  "name": "redget-core",
  "version": "4.2.0",
  "private": false,
  "description": "RedGet Core — the crimson-and-black source collaboration platform.",
  "type": "module",
  "license": "MIT",
  "author": {
    "name": "RedGet, Inc.",
    "email": "engineering@redget.local"
  },
  "keywords": [
    "redget",
    "crimson",
    "forge",
    "offline",
    "accessible"
  ],
  "engines": {
    "node": ">=20.0.0"
  },
  "scripts": {
    "start": "node server.mjs --port 3000",
    "dev": "node server.mjs --port 3000 --watch",
    "validate": "node tools/validate.mjs",
    "seed": "node tools/seed.mjs",
    "test": "node tools/validate.mjs --strict"
  },
  "dependencies": {},
  "devDependencies": {},
  "redget": {
    "topic": "platform",
    "defaultBranch": "main",
    "pages": {
      "source": "/docs",
      "branch": "main"
    }
  }
}
`;

export const REDGET_CONFIG_YML = `# RedGet repository configuration.
# Every value here is a placeholder: RedGet has no public URL yet, so all
# endpoints are local relative routes.
version: 4
repository:
  name: redget-core
  visibility: public
  default_branch: main
  topics:
    - redget
    - crimson
    - accessibility
    - offline-first
features:
  issues: true
  discussions: true
  wiki: true
  projects: true
  actions: true
  packages: true
  pages: true
  sponsors: true
merge:
  methods:
    - merge
    - squash
    - rebase
  auto_delete_head_branch: true
  require_signed_commits: false
  queue:
    enabled: true
    concurrency: 4
    merge_method: squash
branch_protection:
  - pattern: main
    required_reviews: 2
    required_status_checks:
      - validate
      - build
      - a11y-audit
    dismiss_stale_reviews: true
    require_code_owner_reviews: true
    allow_force_pushes: false
    allow_deletions: false
  - pattern: "release/**"
    required_reviews: 1
    required_status_checks:
      - validate
security:
  dependabot:
    alerts: true
    security_updates: true
    version_updates:
      schedule: weekly
      open_pull_requests_limit: 8
  code_scanning:
    tool: redql
    schedule: "0 3 * * 1"
    severity_threshold: medium
  secret_scanning:
    enabled: true
    push_protection: true
    custom_patterns:
      - name: redget-deploy-token
        pattern: "rgt_deploy_[A-Za-z0-9]{32}"
notifications:
  participating: true
  watching: true
  channel:
    email: true
    web: true
    mobile: false
`;

export const WORKFLOW_CI_YML = `name: RedGet CI

on:
  push:
    branches: [main, "release/**"]
    paths-ignore:
      - "docs/**"
      - "**.md"
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, ready_for_review]
  workflow_dispatch:
    inputs:
      matrix:
        description: "Browser matrix"
        required: false
        default: "chromium"
        type: choice
        options: [chromium, firefox, webkit]
  schedule:
    - cron: "17 4 * * 1-5"
  merge_group:
    types: [checks_requested]

permissions:
  contents: read
  pull-requests: write
  id-token: write

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: "20"
  REDGET_THEME: dark

jobs:
  validate:
    name: Validate sources
    runs-on: redget-runner
    timeout-minutes: 10
    steps:
      - name: Check out the repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Set up Node
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: npm

      - name: Parse every source file
        run: node tools/validate.mjs --strict

      - name: Verify internal routes
        run: node tools/validate.mjs --routes

      - name: Upload validation report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: validation-report
          path: .redget/reports/
          retention-days: 14

  build:
    name: Build \${{ matrix.target }}
    needs: validate
    runs-on: redget-runner
    strategy:
      fail-fast: false
      matrix:
        target: [web, static, bundle]
        theme: [dark, crimson, light]
    steps:
      - uses: actions/checkout@v4
      - name: Build
        run: node tools/build.mjs --target \${{ matrix.target }} --theme \${{ matrix.theme }}
      - name: Cache build output
        uses: actions/cache@v4
        with:
          path: dist/
          key: build-\${{ matrix.target }}-\${{ matrix.theme }}

  a11y-audit:
    name: Accessibility audit
    needs: build
    runs-on: redget-runner
    environment:
      name: staging
      url: /octored/redget-core/deployments/staging
    steps:
      - uses: actions/checkout@v4
      - name: Audit ARIA roles and semantics
        run: node tools/validate.mjs --aria
      - name: Contrast check across themes
        run: node tools/validate.mjs --contrast
      - name: Publish summary
        if: success()
        run: node tools/report.mjs --out .redget/reports/a11y.json

  publish:
    name: Publish artefacts
    needs: [build, a11y-audit]
    if: github.ref == 'refs/heads/main'
    runs-on: redget-runner
    permissions:
      contents: write
      packages: write
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - name: Create release archive
        run: |
          mkdir -p dist
          tar --create --gzip --file dist/redget-core.tar.gz assets src data index.html
      - name: Attest provenance
        run: node tools/attest.mjs --sbom dist/sbom.spdx.json
      - name: Publish package
        run: node tools/publish.mjs --registry /octored/redget-core/packages
`;

export const WORKFLOW_RELEASE_YML = `name: Release

on:
  push:
    tags:
      - "v*.*.*"
  workflow_dispatch:
    inputs:
      version:
        description: "Release version (for example v4.3.0)"
        required: true
        type: string
      prerelease:
        description: "Mark as pre-release"
        required: false
        type: boolean
        default: false

permissions:
  contents: write

jobs:
  release:
    runs-on: redget-runner
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        run: node tools/changelog.mjs --from \${{ github.event.inputs.version }}

      - name: Create draft release
        run: |
          node tools/release.mjs \\
            --tag "\${{ github.ref_name }}" \\
            --draft \\
            --notes-file CHANGELOG.md
`;

export const APP_JS = `/**
 * RedGet Core — application bootstrap (excerpt of the mock repository content).
 * This file exists as demo content inside the seeded repository; the real
 * application entry point lives at /src/app.js.
 */

import { createRouter } from './router.js';
import { createStore } from './store.js';
import { applyTheme } from './theme.js';

export async function bootstrap(rootElement) {
  const store = createStore({ persistence: 'local' });
  const router = createRouter({ mode: 'history', root: rootElement });

  applyTheme(store.prefs.theme);
  router.add('/', () => store.select('dashboard'));
  router.add('/:owner/:repo', ({ params }) => store.select('repository', params));

  await store.hydrate();
  return router.start();
}

if (import.meta.url === \`file://\${process.argv[1]}\`) {
  bootstrap(document.getElementById('main')).catch((error) => {
    console.error('[redget] bootstrap failed', error);
    process.exitCode = 1;
  });
}
`;

export const ROUTER_JS = `/**
 * RedGet Core — route matching (demo content).
 */

const PARAM = /^:([A-Za-z_][\\w]*)(\\*)?$/;

export function createRouter({ mode = 'history', root } = {}) {
  const routes = [];
  let current = null;

  function compile(pattern) {
    return pattern
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        const match = PARAM.exec(segment);
        return match ? { name: match[1], splat: Boolean(match[2]) } : { literal: segment.toLowerCase() };
      });
  }

  function add(pattern, handler) {
    routes.push({ pattern, parts: compile(pattern), handler });
  }

  function match(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    for (const route of routes) {
      const params = {};
      let ok = true;
      for (let i = 0; i < route.parts.length; i += 1) {
        const part = route.parts[i];
        if (part.literal) {
          if (part.literal !== (segments[i] || '').toLowerCase()) { ok = false; break; }
          continue;
        }
        if (part.splat) {
          params[part.name] = segments.slice(i).join('/');
          break;
        }
        if (segments[i] == null) { ok = false; break; }
        params[part.name] = decodeURIComponent(segments[i]);
      }
      if (ok) return { route, params };
    }
    return null;
  }

  function render(pathname) {
    const found = match(pathname);
    current = found;
    if (!found) return { status: 404, node: null };
    return { status: 200, node: found.route.handler({ params: found.params, root }) };
  }

  return { add, match, render, start: () => render('/'), get current() { return current; } };
}
`;

export const STORE_JS = `/**
 * RedGet Core — store (demo content).
 */

const STORAGE_KEY = 'redget:demo-store';

export function createStore({ persistence = 'local' } = {}) {
  const state = { prefs: { theme: 'dark' }, entities: new Map() };
  const subscribers = new Set();

  function load() {
    if (persistence !== 'local') return state;
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (raw) Object.assign(state.prefs, JSON.parse(raw).prefs || {});
    } catch (error) {
      console.warn('[store] could not read persistence', error);
    }
    return state;
  }

  function save() {
    if (persistence !== 'local') return;
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ prefs: state.prefs }));
    } catch (error) {
      console.warn('[store] could not write persistence', error);
    }
  }

  return {
    prefs: state.prefs,
    hydrate: async () => load(),
    select: (kind, params) => ({ kind, params }),
    set: (key, value) => {
      state.prefs[key] = value;
      save();
      subscribers.forEach((fn) => fn(state.prefs));
    },
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
`;

export const THEME_JS = `/**
 * RedGet Core — theming (demo content).
 */

const VALID = new Set(['dark', 'crimson', 'light', 'contrast-dark', 'contrast-light']);

export function applyTheme(id) {
  const theme = VALID.has(id) ? id : 'dark';
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'light' || theme === 'contrast-light' ? 'light' : 'dark';
  return theme;
}

export function cycleTheme() {
  const order = ['dark', 'crimson', 'light', 'contrast-dark', 'contrast-light'];
  const current = document.documentElement.dataset.theme || 'dark';
  const next = order[(order.indexOf(current) + 1) % order.length];
  return applyTheme(next);
}
`;

export const TOKENS_CSS = `/* RedGet Core — theme tokens (demo content). */

[data-theme="dark"] {
  --bg-page: #0a0a0c;
  --bg-canvas: #0d0d10;
  --fg-default: #f0ecec;
  --fg-muted: #a29a9c;
  --accent: #d61a2f;
  --accent-emphasis: #ff4d5f;
  --border-default: #2b2b33;
}

[data-theme="crimson"] {
  --bg-page: #140406;
  --bg-canvas: #190508;
  --fg-default: #ffe9ec;
  --fg-muted: #e0a7ae;
  --accent: #ff3d54;
  --accent-emphasis: #ff6b7d;
  --border-default: #46131c;
}

[data-theme="light"] {
  --bg-page: #ffffff;
  --bg-canvas: #faf7f7;
  --fg-default: #1f1215;
  --fg-muted: #59484c;
  --accent: #c01526;
  --accent-emphasis: #c01526;
  --border-default: #d8cfcf;
}
`;

export const STYLES_CSS = `/* RedGet Core — component styles (demo content). */

:root {
  --radius: 6px;
  --transition: 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.repo-card {
  padding: 16px;
  background-color: var(--bg-canvas);
  border: 1px solid var(--border-default);
  border-radius: var(--radius);
  transition: border-color var(--transition);
}

.repo-card:hover {
  border-color: var(--accent);
}

.repo-card__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg-default);
}

.repo-card__title a {
  color: var(--accent-emphasis);
  text-decoration: none;
}

.repo-card__title a:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .repo-card { padding: 12px; }
}
`;

export const INDEX_HTML = `<!DOCTYPE html>
<!-- RedGet Core — demo page shipped inside the mock repository. -->
<html lang="en" data-theme="dark">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RedGet Core</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="app-header">
      <nav aria-label="Global">
        <a href="/">RedGet</a>
        <a href="/dashboard">Dashboard</a>
        <a href="/octored/redget-core">redget-core</a>
      </nav>
    </header>
    <main id="main">
      <section class="repo-card">
        <h1 class="repo-card__title">
          <a href="/octored/redget-core">redget-core</a>
        </h1>
        <p>The crimson-and-black source collaboration platform.</p>
      </section>
    </main>
    <script type="module" src="/app.js"></script>
  </body>
</html>
`;

export const SCHEMA_SQL = `-- RedGet Core — local schema for the seeded mock database.
-- Written as ANSI SQL so it parses in any engine; RedGet itself stores data as JSON.

CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    login         TEXT NOT NULL UNIQUE,
    name          TEXT,
    email         TEXT,
    type          TEXT NOT NULL DEFAULT 'user',
    bio           TEXT,
    company       TEXT,
    location      TEXT,
    website       TEXT,
    followers     INTEGER NOT NULL DEFAULT 0,
    following     INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizations (
    id            INTEGER PRIMARY KEY,
    login         TEXT NOT NULL UNIQUE,
    name          TEXT,
    description   TEXT,
    plan          TEXT NOT NULL DEFAULT 'team',
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE repositories (
    id                INTEGER PRIMARY KEY,
    owner_login       TEXT NOT NULL REFERENCES users(login) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    description       TEXT,
    visibility        TEXT NOT NULL DEFAULT 'public'
                      CHECK (visibility IN ('public', 'private', 'internal')),
    default_branch    TEXT NOT NULL DEFAULT 'main',
    language          TEXT,
    stars             INTEGER NOT NULL DEFAULT 0,
    forks             INTEGER NOT NULL DEFAULT 0,
    watchers          INTEGER NOT NULL DEFAULT 0,
    open_issues       INTEGER NOT NULL DEFAULT 0,
    fork_parent       TEXT,
    archived          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (owner_login, name)
);

CREATE TABLE branches (
    repository_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    protected         BOOLEAN NOT NULL DEFAULT FALSE,
    ahead_by          INTEGER NOT NULL DEFAULT 0,
    behind_by         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (repository_id, name)
);

CREATE TABLE commits (
    sha               TEXT PRIMARY KEY,
    repository_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    branch            TEXT NOT NULL,
    author_login      TEXT REFERENCES users(login),
    message           TEXT NOT NULL,
    body              TEXT,
    additions         INTEGER NOT NULL DEFAULT 0,
    deletions         INTEGER NOT NULL DEFAULT 0,
    verified          BOOLEAN NOT NULL DEFAULT TRUE,
    committed_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE issues (
    id                INTEGER PRIMARY KEY,
    repository_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    number            INTEGER NOT NULL,
    title             TEXT NOT NULL,
    body              TEXT,
    state             TEXT NOT NULL DEFAULT 'open'
                      CHECK (state IN ('open', 'closed')),
    author_login      TEXT NOT NULL REFERENCES users(login),
    milestone_id      INTEGER,
    locked            BOOLEAN NOT NULL DEFAULT FALSE,
    pinned            BOOLEAN NOT NULL DEFAULT FALSE,
    comments_count    INTEGER NOT NULL DEFAULT 0,
    reactions_count   INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at         TIMESTAMP,
    UNIQUE (repository_id, number)
);

CREATE INDEX issues_state_idx ON issues (repository_id, state);
CREATE INDEX issues_updated_idx ON issues (repository_id, updated_at DESC);

CREATE TABLE pull_requests (
    issue_id          INTEGER PRIMARY KEY REFERENCES issues(id) ON DELETE CASCADE,
    head_branch       TEXT NOT NULL,
    base_branch       TEXT NOT NULL,
    draft             BOOLEAN NOT NULL DEFAULT FALSE,
    merged            BOOLEAN NOT NULL DEFAULT FALSE,
    mergeable_state   TEXT NOT NULL DEFAULT 'clean'
                      CHECK (mergeable_state IN ('clean', 'dirty', 'blocked', 'unstable', 'unknown')),
    additions         INTEGER NOT NULL DEFAULT 0,
    deletions         INTEGER NOT NULL DEFAULT 0,
    changed_files     INTEGER NOT NULL DEFAULT 0,
    merged_at         TIMESTAMP,
    merged_by         TEXT
);

CREATE TABLE labels (
    id                INTEGER PRIMARY KEY,
    repository_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    color             TEXT NOT NULL DEFAULT 'd61a2f',
    description       TEXT,
    UNIQUE (repository_id, name)
);

CREATE TABLE workflow_runs (
    id                INTEGER PRIMARY KEY,
    repository_id     INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    workflow_id       TEXT NOT NULL,
    name              TEXT NOT NULL,
    status            TEXT NOT NULL CHECK (status IN ('queued', 'in_progress', 'completed')),
    conclusion        TEXT CHECK (conclusion IN
                      ('success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral')),
    branch            TEXT NOT NULL,
    event             TEXT NOT NULL,
    duration_ms       INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE VIEW open_issue_counts AS
    SELECT r.owner_login, r.name, COUNT(i.id) AS open_issues
    FROM repositories r
    LEFT JOIN issues i ON i.repository_id = r.id AND i.state = 'open'
    GROUP BY r.owner_login, r.name;

-- Most recently updated public repositories, newest first.
SELECT r.owner_login,
       r.name,
       r.stars,
       r.language
FROM repositories r
WHERE r.visibility = 'public'
  AND r.archived = FALSE
ORDER BY r.updated_at DESC
LIMIT 25;
`;

export const DEPLOY_SH = `#!/usr/bin/env bash
# RedGet Core — local deploy helper (demo content).
# Nothing here contacts a network; artefacts are copied into ./dist.

set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
readonly DIST_DIR="\${SCRIPT_DIR}/dist"
TARGET="\${1:-staging}"
VERSION="\${2:-0.0.0-dev}"

log() { printf '\\033[31m[redget]\\033[0m %s\\n' "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

command -v node >/dev/null 2>&1 || die "node is required"

log "Building RedGet Core \${VERSION} for \${TARGET}"
rm -rf "\${DIST_DIR}"
mkdir -p "\${DIST_DIR}"

cp -R assets src data index.html "\${DIST_DIR}/"

if [[ "\${TARGET}" == "production" ]]; then
  log "Minifying bundles"
  node tools/build.mjs --minify --out "\${DIST_DIR}"
fi

node tools/validate.mjs --strict || die "validation failed"

FILES=$(find "\${DIST_DIR}" -type f | wc -l | tr -d ' ')
BYTES=$(du -sk "\${DIST_DIR}" | cut -f1)
log "Deployed \${FILES} files (\${BYTES} KB) to \${DIST_DIR}"
log "Preview locally: node server.mjs --root \${DIST_DIR} --port 3000"
`;

export const DOCKERFILE = `# RedGet Core — container image (demo content)
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node tools/build.mjs --target static --out dist

FROM nginx:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="redget-core" \\
      org.opencontainers.image.vendor="RedGet, Inc." \\
      org.opencontainers.image.licenses="MIT"
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
`;

export const CODEOWNERS = `# RedGet Core — code ownership
# Order matters: later patterns take precedence.

*                               @octored @crimsonfox

/src/core/                      @octored
/src/components/diff.js         @nightshade
/src/components/markdown.js     @velvetbyte
/assets/css/tokens.css          @scarletui
/data/                          @crimsonfox
/tools/                         @octored
/docs/                          @docs-guild
SECURITY.md                     @security-guild
`;

export const FUNDING_YML = `# RedGet Core — sponsorship configuration (demo content)
# All targets are local placeholders.
custom:
  - /sponsors/redget-collective
  - /octored
patreon: null
open_collective: redget
ko_fi: null
tidelift: null
community_bridge: null
liberapay: redget
issuehunt: null
lfx_crowdfunding: null
polar: null
buy_me_a_coffee: null
thanks_dev: null
`;

export const CITATION_CFF = `cff-version: 1.2.0
message: "If you use RedGet Core, please cite it as below."
title: "RedGet Core: a crimson source collaboration platform"
version: 4.2.0
date-released: 2026-03-14
license: MIT
type: software
authors:
  - family-names: "Red"
    given-names: "Octavia"
    orcid: "https://orcid.local/0000-0002-1825-0097"
  - family-names: "Crimson"
    given-names: "Fox"
repository-code: "/octored/redget-core"
keywords:
  - collaboration
  - accessibility
  - offline-first
`;

export const ISSUE_TEMPLATE_BUG = `---
name: Bug report
about: Something in RedGet is broken
title: "[bug] "
labels: ["bug", "triage"]
assignees: []
projects: ["octored/1"]
---

## What happened?

<!-- Describe the defect in one paragraph. -->

## Steps to reproduce

1. Go to \`/octored/redget-core\`
2. Click on …
3. Observe …

## Expected behaviour

## Environment

| Field | Value |
| --- | --- |
| RedGet version |  |
| Browser |  |
| Theme | dark / crimson / light / contrast-dark / contrast-light |
| Viewport | desktop / tablet / mobile |

## Evidence

- [ ] I attached a screenshot or a recording
- [ ] I checked the browser console for errors
- [ ] I searched existing issues at \`/octored/redget-core/issues?q=is:issue\`
`;

export const ISSUE_TEMPLATE_FEATURE = `---
name: Feature request
about: Propose an improvement
title: "[feat] "
labels: ["enhancement"]
---

## Problem

What problem does this solve? Link the discussion if one exists.

## Proposed solution

Describe the behaviour you want. Include the HTML structure if it is a new UI
surface, for example:

\`\`\`html
<section class="empty-state">
  <h2>No workflows yet</h2>
  <a class="btn btn-primary" href="/octored/redget-core/actions/new">New workflow</a>
</section>
\`\`\`

## Alternatives considered

## Additional context
`;

export const PR_TEMPLATE = `<!-- RedGet Core pull request template -->

## What does this change?

<!-- One or two sentences. Link the issue with #123. -->

Fixes #

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation only
- [ ] Refactor (no behaviour change)

## How was this tested?

- [ ] \`node tools/validate.mjs\` passes
- [ ] Manual check at 375 px and 1280 px
- [ ] All five themes reviewed
- [ ] Keyboard-only navigation verified
- [ ] Screen reader announcement verified

## Screenshots

| Before | After |
| --- | --- |
|  |  |

## Checklist

- [ ] My code follows the style in \`CONTRIBUTING.md\`
- [ ] I added or updated mock data under \`data/\`
- [ ] I updated the docs page if the HTML structure changed
- [ ] I self-reviewed the diff for stray debug code
`;

export const WIKI_PAGES = [
  {
    title: 'Home',
    format: 'markdown',
    body: `# RedGet Core wiki

Welcome to the RedGet Core wiki. This space holds long-form documentation that
does not belong in the repository itself.

## Pages

- [[Getting started]] — install, seed and run the local platform
- [[Architecture]] — modules, data flow and the render pipeline
- [[Theming guide]] — tokens, the five themes and contrast rules
- [[Accessibility contract]] — ARIA roles used by every component
- [[Route reference]] — the full placeholder route table
- [[Actions reference]] — workflow syntax supported by RedGet CI
- [[API reference]] — local store and router APIs
- [[FAQ]] — common questions and troubleshooting
- [[Release process]] — how a RedGet release is cut

## Conventions

Every wiki page supports ten markup formats: Markdown, reStructuredText,
AsciiDoc, Org mode, Creole, MediaWiki, Textile, RDoc, Pod and plain text.

> [!TIP]
> Use the sidebar on the right to jump between pages, and the **History** tab to
> see who changed what.
`,
  },
  {
    title: 'Getting started',
    format: 'markdown',
    body: `# Getting started

## 1. Serve the app

\`\`\`bash
node server.mjs --port 3000
\`\`\`

The bundled server rewrites unknown paths to \`index.html\`, so deep links such as
\`/octored/redget-core/issues/12\` work on a hard refresh.

## 2. Seed the database

The first visit seeds a deterministic dataset into \`localStorage\` under
\`redget:db:v4\`. Reset it any time from **Settings → Danger Zone**.

## 3. Sign in as the demo user

You are signed in as **octored**. The avatar menu lets you switch users, which is
useful for testing permission-gated UI such as private repositories and
organization settings.

## 4. Learn the shortcuts

Press <kbd>?</kbd> for the shortcut reference, or <kbd>Ctrl</kbd>+<kbd>K</kbd> for
the command palette.
`,
  },
  {
    title: 'Architecture',
    format: 'markdown',
    body: `# Architecture

## Modules

| Module | Responsibility |
| --- | --- |
| \`core/router.js\` | pattern matching, history/hash modes, scroll memory |
| \`core/store.js\` | persisted database, session, preferences |
| \`core/dom.js\` | \`h()\` hyperscript, tables, focus traps |
| \`core/i18n.js\` | string tables, plural rules, date formatting |
| \`core/theme.js\` | theme application, system preference sync |
| \`components/*\` | header, repo chrome, markdown, diff, overlays |
| \`pages/*\` | one module per route family |

## Data flow

1. A navigation resolves a route and calls the page handler.
2. The handler reads entities from the store (never from the DOM).
3. Nodes are created with \`h()\` and mounted into \`<main id="main">\`.
4. Mutations call \`store.mutate()\`, which debounces a write to localStorage and
   emits \`data:change\` so live regions (counters, badges) update.

## Why no framework?

A dependency-free build keeps the syntax surface small enough to validate
completely, guarantees the app boots from \`file://\` in hash mode, and removes
network fetches entirely.
`,
  },
  {
    title: 'Theming guide',
    format: 'markdown',
    body: `# Theming guide

## The five themes

| id | surfaces | accent | notes |
| --- | --- | --- | --- |
| \`dark\` | near-black | \`#d61a2f\` | default identity |
| \`red\` | deep crimson | \`#ff3d54\` | maximal red |
| \`light\` | white | \`#c01526\` | red header, white canvas |
| \`contrast-dark\` | pure black | \`#ff5f72\` | 7:1+ text contrast |
| \`contrast-light\` | pure white | \`#a01120\` | 7:1+ text contrast |

## Rules

1. Never hardcode a colour in a component stylesheet.
2. Add new colours to \`tokens.css\` in all five theme blocks.
3. Focus rings must use \`--focus-ring\` so high contrast keeps a 3px white ring.
4. Selection colour uses \`--selection-bg\` with readable \`--selection-fg\`.
5. Scrollbars pick up \`--scrollbar-thumb\` and turn crimson on hover.

## Testing

\`\`\`bash
node tools/validate.mjs --contrast
\`\`\`
`,
  },
  {
    title: 'Accessibility contract',
    format: 'markdown',
    body: `# Accessibility contract

Every RedGet surface has a documented structure. This is the contract the
validator checks.

| Surface | Structure |
| --- | --- |
| Global header | \`<header>\` containing \`<nav>\` with \`<ul>\`/\`<li>\`/\`<a>\`/\`<button>\` |
| Repo header | \`<div class="repo-header">\` + \`<nav aria-label="Repository breadcrumb">\` |
| File list | \`<table>\` with \`<thead><tr><th>Name</th><th>Last commit message</th><th>Last commit time</th></tr></thead><tbody>\` |
| Diff view | \`<div class="diff">\` + \`<table class="diff">\` + \`<span class="line-add">\` / \`<span class="line-del">\` |
| Command palette | \`<dialog>\` with \`<input>\` and \`<ul role="listbox">\` |
| Dropdown | \`<details><summary>\` or \`<button aria-expanded>\` + \`<ul role="menu">\` |
| Tabs | \`<div role="tablist">\` + \`<button role="tab">\` + \`<div role="tabpanel">\` |
| Modal | \`<dialog>\` with \`aria-labelledby\` |
| Toast | \`<div role="status" aria-live="polite">\` |
| Tooltip | \`<div role="tooltip">\` referenced by \`aria-describedby\` |
| Skeleton | \`<div class="skeleton" aria-hidden="true">\` inside \`aria-busy\` |
| Empty state | \`<section class="empty-state">\` with a heading and a primary action |
| Pagination | \`<nav aria-label="Pagination">\` with \`aria-current="page"\` |

## Keyboard model

- \`Tab\` moves through every control; focus is always visible.
- Menus implement roving tabindex with Arrow/Home/End and typeahead.
- Dialogs trap focus and restore it to the opener on close.
- \`Esc\` closes the topmost overlay only.
`,
  },
  {
    title: 'Route reference',
    format: 'markdown',
    body: `# Route reference

All routes are relative placeholders. There is no RedGet host yet.

## Global

| Route | Page |
| --- | --- |
| \`/\` | landing / dashboard |
| \`/explore\` | explore |
| \`/search\` | search |
| \`/notifications\` | inbox |
| \`/issues\` | all assigned issues |
| \`/pulls\` | all pull requests |
| \`/codespaces\` | codespaces |
| \`/marketplace\` | marketplace |
| \`/settings\` | account settings |
| \`/docs\` | HTML structure documentation |

## Repository

| Route | Page |
| --- | --- |
| \`/<user>/<repo>\` | code overview |
| \`/<user>/<repo>/tree/<branch>\` | directory listing |
| \`/<user>/<repo>/blob/<branch>/<path>\` | file view |
| \`/<user>/<repo>/blame/<branch>/<path>\` | blame |
| \`/<user>/<repo>/commits/<branch>\` | commit history |
| \`/<user>/<repo>/commit/<sha>\` | commit detail |
| \`/<user>/<repo>/issues\` | issue list |
| \`/<user>/<repo>/issues/<number>\` | issue detail |
| \`/<user>/<repo>/pulls\` | pull request list |
| \`/<user>/<repo>/pull/<number>\` | pull request detail |
| \`/<user>/<repo>/actions\` | workflow runs |
| \`/<user>/<repo>/actions/runs/<id>\` | run detail |
| \`/<user>/<repo>/projects\` | projects |
| \`/<user>/<repo>/wiki\` | wiki |
| \`/<user>/<repo>/security\` | security overview |
| \`/<user>/<repo>/insights\` | insights |
| \`/<user>/<repo>/settings\` | repository settings |
| \`/<user>/<repo>/releases\` | releases |
| \`/<user>/<repo>/compare\` | compare branches |
`,
  },
  {
    title: 'Actions reference',
    format: 'markdown',
    body: `= Actions reference
:doctype: book
:toc: left
:sectnums:

== Supported workflow syntax

RedGet CI understands the standard workflow schema:

[source,yaml]
----
name: RedGet CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
  schedule:
    - cron: "17 4 * * 1-5"
jobs:
  validate:
    runs-on: redget-runner
    steps:
      - uses: actions/checkout@v4
      - run: node tools/validate.mjs
----

== Triggers

[cols="1,3"]
|===
|Event |Description

|push
|Branch and tag pushes, with +paths+ and +paths-ignore+ filters.

|pull_request
|Includes +pull_request_target+ semantics for privileged checks.

|workflow_dispatch
|Manual runs with typed inputs: string, boolean, choice, environment.

|schedule
|Cron expressions evaluated in UTC.

|merge_group
|Runs when a pull request enters the merge queue.

|repository_dispatch
|Local placeholder event used by the mock API.
|===

== Secrets and variables

Secrets are stored per repository, environment or organization. Values are never
rendered: the UI shows the name, the scope, the last update time and the set of
repositories with access.
`,
  },
  {
    title: 'API reference',
    format: 'markdown',
    body: `# API reference

All APIs are local. There is no network surface.

## Store

\`\`\`js
import { getDb, mutate, getCurrentUser } from '/src/core/store.js';

const db = getDb();
mutate((next) => {
  const repo = next.repos.find((r) => r.name === 'redget-core');
  repo.stars += 1;
}, 'repos');
\`\`\`

## Router

\`\`\`js
import { navigate, resolve, addRoute } from '/src/core/router.js';

addRoute('/:login/:repo', handler, { title: (m) => \`\${m.params.login}/\${m.params.repo}\` });
navigate('/octored/redget-core/issues', { query: { q: 'is:open label:bug' } });
\`\`\`

## Overlays

\`\`\`js
import { openDialog, toast, dropdown } from '/src/components/overlay.js';

openDialog({ title: 'Delete branch?', confirmLabel: 'Delete', danger: true });
toast({ title: 'Merged', message: 'Pull request #14 was merged.', variant: 'success' });
\`\`\`
`,
  },
  {
    title: 'FAQ',
    format: 'markdown',
    body: `# FAQ

## Does RedGet talk to the network?

No. Every asset is local: the icon sprite, the stylesheets, the fonts (system
stack) and the data. There is no RedGet URL yet, so all links are relative
placeholders.

## Where is my data?

In \`localStorage\` under \`redget:db:v4\`. Clearing site data resets the demo.

## Can I add my own repositories?

Yes — use **New repository** from the + menu. The form validates the name,
visibility, licence, .gitignore template and README option, then creates the
repository with an initial commit.

## Why are some numbers not changing?

Counts derived from mock data (traffic, clones, referrers) are deterministic per
repository so screenshots stay stable. Interactive counters — stars, watches,
forks, issue states — update immediately and persist.

## Which markup formats does the wiki support?

Markdown, reStructuredText, AsciiDoc, Org mode, Creole, MediaWiki, Textile,
RDoc, Pod and plain text.
`,
  },
  {
    title: 'Release process',
    format: 'markdown',
    body: `# Release process

1. Cut a branch: \`git switch -c release/4.3\`.
2. Update the version in \`package.json\` and \`data/manifest.js\`.
3. Run \`node tools/validate.mjs --strict\`.
4. Tag: \`git tag -s v4.3.0\`.
5. Push the tag — the **Release** workflow drafts the notes from conventional
   commits.
6. Review the draft at \`/octored/redget-core/releases\`, attach artefacts, and
   publish.

## Artefacts

| Artefact | Contents |
| --- | --- |
| \`redget-core.tar.gz\` | assets, src, data, index.html |
| \`redget-core-static.zip\` | pre-rendered static export |
| \`sbom.spdx.json\` | software bill of materials |
| \`attestation.json\` | provenance attestation |
`,
  },
];

export const WIKI_SIDEBAR = `## RedGet Core

**Overview**
* [[Home]]
* [[Getting started]]
* [[FAQ]]

**Design**
* [[Architecture]]
* [[Theming guide]]
* [[Accessibility contract]]

**Reference**
* [[Route reference]]
* [[Actions reference]]
* [[API reference]]
* [[Release process]]

---
[Repository](/octored/redget-core) ·
[Issues](/octored/redget-core/issues) ·
[Pull requests](/octored/redget-core/pulls) ·
[Actions](/octored/redget-core/actions)
`;

export const WIKI_FOOTER = `RedGet Core wiki · last edited by @octored ·
[Edit this page](/octored/redget-core/wiki/_edit) ·
[History](/octored/redget-core/wiki/_history) ·
[Clone](/octored/redget-core/wiki/_clone)
`;

export const CHANGELOG_MD = `# Changelog

All notable changes to RedGet Core are documented here.
This project adheres to semantic versioning.

## [4.2.0] - 2026-03-14

### Added

- Command palette with fuzzy route, issue and file search (\`Ctrl\`+\`K\`).
- Split diff view with paired deletion/addition alignment.
- Wiki support for AsciiDoc and reStructuredText.
- Merge queue with configurable concurrency in repository settings.
- Five themes including two high-contrast variants.

### Changed

- Repository tab bar is now sticky below the global header.
- File list hides the commit message column below 768 px.
- Toasts stack from the bottom right and cap at four.

### Fixed

- Blame groups no longer repeat the same commit for adjacent lines.
- Relative time now respects the user's chosen time zone.
- Focus is restored to the trigger when a dropdown closes with \`Esc\`.

## [4.1.0] - 2026-01-28

### Added

- Secret scanning push protection simulation with custom patterns.
- Dependabot version updates with grouped minor/patch pulls.
- Project roadmap view with iteration fields.

### Fixed

- Keyboard navigation in the branch selector (Arrow/Home/End/typeahead).

## [4.0.0] - 2025-11-02

### Added

- Initial public surface: repositories, issues, pull requests, Actions, wiki,
  projects, security, insights, settings, profiles and organizations.

### Changed

- Rebranded the whole surface from blue to crimson on black.
`;

export const DEMO_DATA_JSON = `{
  "schema": "redget.mock.v4",
  "generatedAt": "2026-03-14T09:00:00.000Z",
  "counts": {
    "users": 14,
    "organizations": 2,
    "repositories": 9,
    "issues": 42,
    "pullRequests": 18,
    "workflowRuns": 26
  },
  "flags": {
    "network": false,
    "externalDomains": false,
    "localStorage": true,
    "deterministic": true
  },
  "sampleIssue": {
    "number": 12,
    "title": "Split diff misaligns paired deletions on long files",
    "state": "open",
    "labels": ["bug", "diff", "priority: high"],
    "assignees": ["nightshade"],
    "reactions": { "+1": 8, "-1": 0, "heart": 3 }
  },
  "sampleWorkflowRun": {
    "id": 90210,
    "name": "RedGet CI",
    "status": "completed",
    "conclusion": "success",
    "branch": "main",
    "event": "push",
    "durationMs": 214000
  }
}
`;

export const NGINX_CONF = `# RedGet Core — local static server configuration (demo content)
server {
    listen 80;
    server_name redget.local;
    root /usr/share/nginx/html;
    index index.html;

    # Single-page fallback so deep links resolve.
    location / {
        try_files $uri $uri/ /index.html;
    }

    location /assets/ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    location = /healthz {
        access_log off;
        return 200 "ok\\n";
        add_header Content-Type text/plain;
    }

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;
    gzip_min_length 1024;
}
`;

export const DOCS_MD = `# RedGet documentation index

This repository ships an in-app documentation page at \`/docs\` that describes the
HTML structure of every surface. The wiki mirrors it for editing.

## Sections

1. Global header
2. Repository chrome
3. Code, blob and blame views
4. Diffs and reviews
5. Issues and pull requests
6. Actions
7. Projects and wiki
8. Security and insights
9. Settings
10. Profiles and organizations
11. Overlays: dialogs, menus, toasts, tooltips
12. States: loading, empty, error, disabled

Read it in the app at \`/docs\` or browse the wiki at \`/octored/redget-core/wiki\`.
`;

export const DEMO_IMAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320" role="img" aria-label="RedGet identity card">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a0206"/>
      <stop offset="55%" stop-color="#4d0a14"/>
      <stop offset="100%" stop-color="#0a0a0c"/>
    </linearGradient>
    <linearGradient id="stroke" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff4d5f"/>
      <stop offset="100%" stop-color="#8b1220"/>
    </linearGradient>
  </defs>
  <rect width="640" height="320" rx="18" fill="url(#bg)"/>
  <rect x="16" y="16" width="608" height="288" rx="12" fill="none" stroke="url(#stroke)" stroke-width="2"/>
  <text x="48" y="120" font-family="Helvetica, Arial, sans-serif" font-size="56" font-weight="800" fill="#ff4d5f">RedGet</text>
  <text x="48" y="160" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#e0a7ae">Where the crimson code lives.</text>
  <g fill="#ff4d5f" opacity="0.85">
    <rect x="48" y="200" width="120" height="8" rx="4"/>
    <rect x="180" y="200" width="60" height="8" rx="4"/>
    <rect x="48" y="220" width="200" height="8" rx="4"/>
    <rect x="48" y="240" width="90" height="8" rx="4"/>
  </g>
</svg>
`;

/**
 * The repository file tree for the flagship repo.
 * `type`: 'dir' | 'file'. `content` is the literal file body for files.
 */
export const REDGET_CORE_TREE = [
  { path: '.redget', type: 'dir' },
  {
    path: '.redget/config.yml', type: 'file', content: REDGET_CONFIG_YML,
    message: 'ci: enable merge queue and grouped dependabot updates',
  },
  { path: '.redget/ISSUE_TEMPLATE', type: 'dir' },
  {
    path: '.redget/ISSUE_TEMPLATE/bug_report.md', type: 'file', content: ISSUE_TEMPLATE_BUG,
    message: 'docs: add structured bug report template',
  },
  {
    path: '.redget/ISSUE_TEMPLATE/feature_request.md', type: 'file', content: ISSUE_TEMPLATE_FEATURE,
    message: 'docs: add feature request template with HTML hints',
  },
  {
    path: '.redget/PULL_REQUEST_TEMPLATE.md', type: 'file', content: PR_TEMPLATE,
    message: 'docs: require a11y checkboxes in the PR template',
  },
  { path: '.redget/workflows', type: 'dir' },
  {
    path: '.redget/workflows/ci.yml', type: 'file', content: WORKFLOW_CI_YML,
    message: 'ci: add merge_group trigger and OIDC provenance',
  },
  {
    path: '.redget/workflows/release.yml', type: 'file', content: WORKFLOW_RELEASE_YML,
    message: 'ci: draft releases from tags',
  },
  { path: 'docs', type: 'dir' },
  {
    path: 'docs/README.md', type: 'file', content: DOCS_MD,
    message: 'docs: index the in-app documentation page',
  },
  { path: 'scripts', type: 'dir' },
  {
    path: 'scripts/deploy.sh', type: 'file', content: DEPLOY_SH,
    message: 'build: validate before deploying',
  },
  { path: 'src', type: 'dir' },
  { path: 'src/core', type: 'dir' },
  {
    path: 'src/core/router.js', type: 'file', content: ROUTER_JS,
    message: 'feat(router): support splat params for blob paths',
  },
  {
    path: 'src/core/store.js', type: 'file', content: STORE_JS,
    message: 'feat(store): debounce persistence to localStorage',
  },
  {
    path: 'src/core/theme.js', type: 'file', content: THEME_JS,
    message: 'feat(theme): add crimson and high contrast themes',
  },
  {
    path: 'src/app.js', type: 'file', content: APP_JS,
    message: 'refactor: split bootstrap from route table',
  },
  { path: 'styles', type: 'dir' },
  {
    path: 'styles/tokens.css', type: 'file', content: TOKENS_CSS,
    message: 'style: centralize theme tokens',
  },
  {
    path: 'styles/styles.css', type: 'file', content: STYLES_CSS,
    message: 'style: card hover uses accent border',
  },
  { path: 'sql', type: 'dir' },
  {
    path: 'sql/schema.sql', type: 'file', content: SCHEMA_SQL,
    message: 'data: document the mock schema as ANSI SQL',
  },
  { path: 'assets', type: 'dir' },
  {
    path: 'assets/logo.svg', type: 'file', content: DEMO_IMAGE_SVG,
    message: 'assets: refresh the identity card',
  },
  {
    path: 'index.html', type: 'file', content: INDEX_HTML,
    message: 'feat: add skip link and semantic landmarks',
  },
  {
    path: 'README.md', type: 'file', content: README_MD,
    message: 'docs: rewrite the README with the feature matrix',
  },
  {
    path: 'CONTRIBUTING.md', type: 'file', content: CONTRIBUTING_MD,
    message: 'docs: describe the validation loop',
  },
  {
    path: 'CODE_OF_CONDUCT.md', type: 'file', content: CODE_OF_CONDUCT_MD,
    message: 'docs: adopt contributor covenant 2.1',
  },
  {
    path: 'SECURITY.md', type: 'file', content: SECURITY_MD,
    message: 'docs: publish the security policy',
  },
  {
    path: 'CHANGELOG.md', type: 'file', content: CHANGELOG_MD,
    message: 'docs: cut 4.2.0',
  },
  {
    path: 'LICENSE', type: 'file', content: LICENSE_TEXT,
    message: 'chore: add MIT licence',
  },
  {
    path: 'CODEOWNERS', type: 'file', content: CODEOWNERS,
    message: 'chore: assign docs guild ownership',
  },
  {
    path: 'FUNDING.yml', type: 'file', content: FUNDING_YML,
    message: 'chore: point funding at the local sponsors page',
  },
  {
    path: 'CITATION.cff', type: 'file', content: CITATION_CFF,
    message: 'docs: add citation metadata',
  },
  {
    path: 'package.json', type: 'file', content: PACKAGE_JSON,
    message: 'chore: bump to 4.2.0',
  },
  {
    path: '.gitignore', type: 'file', content: GITIGNORE,
    message: 'chore: ignore local redget overrides',
  },
  {
    path: 'Dockerfile', type: 'file', content: DOCKERFILE,
    message: 'build: multi-stage image with healthcheck',
  },
  {
    path: 'nginx.conf', type: 'file', content: NGINX_CONF,
    message: 'build: SPA fallback for deep links',
  },
  {
    path: 'redget-core.svg', type: 'file', content: DEMO_IMAGE_SVG, binary: false,
    message: 'assets: add the identity card graphic',
  },
];

/** Simple README for every other seeded repository. */
export function genericReadme(name, description, ownerLogin) {
  return `# ${name}

${description || `${name} — a RedGet project.`}

## About

This repository is part of the local RedGet demo dataset. Everything you see is
rendered from mock data stored in your browser; no network request is made.

## Usage

\`\`\`bash
git clone /${ownerLogin}/${name}.git
cd ${name}
node index.js
\`\`\`

## Links

- [Issues](/${ownerLogin}/${name}/issues)
- [Pull requests](/${ownerLogin}/${name}/pulls)
- [Actions](/${ownerLogin}/${name}/actions)
- [Wiki](/${ownerLogin}/${name}/wiki)
- [Releases](/${ownerLogin}/${name}/releases)

## Licence

MIT © ${ownerLogin}
`;
}

/** Extra files for secondary repositories, keyed by repo name. */
export const SECONDARY_TREES = {
  'crimson-ui': [
    { path: 'src', type: 'dir' },
    { path: 'src/Button.svelte', type: 'file', content: `<script>\n  export let variant = 'primary';\n  export let disabled = false;\n</script>\n\n<button class="btn btn-{variant}" {disabled} on:click>\n  <slot />\n</button>\n\n<style>\n  .btn {\n    padding: 6px 16px;\n    border-radius: 6px;\n    border: 1px solid var(--border-default, #46131c);\n    background-color: var(--accent, #ff3d54);\n    color: #fff;\n    font-weight: 600;\n  }\n  .btn:disabled { opacity: 0.55; cursor: not-allowed; }\n  .btn-ghost { background-color: transparent; color: var(--accent, #ff3d54); }\n</style>\n`, message: 'feat(button): add ghost variant' },
    { path: 'src/theme.js', type: 'file', content: THEME_JS, message: 'feat(theme): share tokens with core' },
    { path: 'package.json', type: 'file', content: PACKAGE_JSON.replace('redget-core', 'crimson-ui').replace('"4.2.0"', '"1.8.3"'), message: 'chore: release 1.8.3' },
    { path: 'README.md', type: 'file', content: genericReadme('crimson-ui', 'A crimson design system: tokens, components and documentation.', 'scarletui'), message: 'docs: publish the design system README' },
    { path: 'LICENSE', type: 'file', content: LICENSE_TEXT, message: 'chore: MIT' },
  ],
  'redql': [
    { path: 'src', type: 'dir' },
    { path: 'src/lib.rs', type: 'file', content: `//! RedQL — the RedGet code scanning query engine (demo content).\n\nuse std::collections::HashMap;\n\npub struct Engine {\n    rules: HashMap<String, Rule>,\n    severity_threshold: Severity,\n}\n\n#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]\npub enum Severity {\n    Low,\n    Medium,\n    High,\n    Critical,\n}\n\n#[derive(Clone, Debug)]\npub struct Rule {\n    pub id: String,\n    pub name: String,\n    pub severity: Severity,\n    pub query: String,\n}\n\nimpl Engine {\n    pub fn new(severity_threshold: Severity) -> Self {\n        Self { rules: HashMap::new(), severity_threshold }\n    }\n\n    pub fn register(&mut self, rule: Rule) {\n        if rule.severity >= self.severity_threshold {\n            self.rules.insert(rule.id.clone(), rule);\n        }\n    }\n\n    pub fn scan(&self, source: &str) -> Vec<Finding> {\n        self.rules\n            .values()\n            .filter_map(|rule| evaluate(rule, source))\n            .collect()\n    }\n}\n\npub struct Finding {\n    pub rule_id: String,\n    pub line: usize,\n    pub message: String,\n}\n\nfn evaluate(rule: &Rule, source: &str) -> Option<Finding> {\n    let line = source.lines().position(|l| l.contains(&rule.query))?;\n    Some(Finding {\n        rule_id: rule.id.clone(),\n        line: line + 1,\n        message: format!("{} matched on line {}", rule.name, line + 1),\n    })\n}\n`, message: 'feat: severity threshold filtering' },
    { path: 'Cargo.toml', type: 'file', content: `[package]\nname = "redql"\nversion = "0.9.4"\nedition = "2021"\nlicense = "MIT"\ndescription = "RedGet code scanning query engine"\n\n[dependencies]\nserde = { version = "1.0", features = ["derive"] }\n\n[dev-dependencies]\ncriterion = "0.5"\n\n[[bin]]\nname = "redql"\npath = "src/main.rs"\n`, message: 'chore: 0.9.4' },
    { path: 'README.md', type: 'file', content: genericReadme('redql', 'Static analysis queries for the RedGet code scanning surface.', 'octored'), message: 'docs: describe the rule model' },
  ],
  'actions-runner': [
    { path: 'cmd', type: 'dir' },
    { path: 'cmd/runner/main.go', type: 'file', content: `// RedGet self-hosted runner (demo content).\npackage main\n\nimport (\n\t"context"\n\t"flag"\n\t"fmt"\n\t"log"\n\t"os"\n\t"os/signal"\n\t"syscall"\n)\n\nvar (\n\tname  = flag.String("name", "redget-runner", "runner label")\n\ttoken = flag.String("token", "", "registration token")\n\twork  = flag.String("work", "_work", "working directory")\n)\n\nfunc main() {\n\tflag.Parse()\n\tif *token == "" {\n\t\tlog.Fatal("a registration token is required")\n\t}\n\n\tctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)\n\tdefer cancel()\n\n\tif err := os.MkdirAll(*work, 0o750); err != nil {\n\t\tlog.Fatalf("prepare work directory: %v", err)\n\t}\n\n\tfmt.Printf("[redget] runner %q listening (work=%s)\\n", *name, *work)\n\t<-ctx.Done()\n\tfmt.Println("[redget] runner shutting down")\n}\n`, message: 'feat: graceful shutdown on SIGTERM' },
    { path: 'go.mod', type: 'file', content: `module redget.local/actions-runner\n\ngo 1.22\n\nrequire (\n\tgolang.org/x/sync v0.7.0\n)\n`, message: 'chore: go 1.22' },
    { path: 'README.md', type: 'file', content: genericReadme('actions-runner', 'Self-hosted runner for RedGet Actions, written in Go.', 'crimsonfox'), message: 'docs: runner quickstart' },
  ],
};

/** Files used to build pull request diffs. */
export const PR_DIFF_SOURCES = {
  'feature/split-diff-alignment': {
    old: {
      'src/components/diff.js': `export function pairLines(hunk) {\n  const left = [];\n  const right = [];\n  hunk.lines.forEach((line) => {\n    if (line.type === 'del') left.push(line);\n    if (line.type === 'add') right.push(line);\n    if (line.type === 'context') { left.push(line); right.push(line); }\n  });\n  return { left, right };\n}\n`,
      'assets/css/repo.css': `.diff-split table.diff td.code-cell {\n  width: 50%;\n}\n`,
    },
    new: {
      'src/components/diff.js': `export function pairLines(hunk) {\n  const left = [];\n  const right = [];\n  const pendingDel = [];\n  hunk.lines.forEach((line) => {\n    if (line.type === 'del') { pendingDel.push(line); return; }\n    if (line.type === 'add') {\n      const partner = pendingDel.shift();\n      left.push(partner || { type: 'empty' });\n      right.push(line);\n      return;\n    }\n    while (pendingDel.length) {\n      left.push(pendingDel.shift());\n      right.push({ type: 'empty' });\n    }\n    left.push(line);\n    right.push(line);\n  });\n  while (pendingDel.length) {\n    left.push(pendingDel.shift());\n    right.push({ type: 'empty' });\n  }\n  return { left, right };\n}\n`,
      'assets/css/repo.css': `.diff-split table.diff td.code-cell {\n  width: calc(50% - 46px);\n}\n.diff-split .split-divider {\n  width: 8px;\n  min-width: 8px;\n  background-color: var(--bg-canvas-inset);\n}\n`,
      'docs/diff.md': `# Split diff alignment\n\nDeletions are paired with the additions that replace them so the two columns\nstay in lockstep. Unpaired lines render as empty cells with\n\`--diff-empty-bg\`.\n`,
    },
  },
  'fix/blame-grouping': {
    old: {
      'src/components/blame.js': `export function groupBlame(commits) {\n  return commits.map((c) => [c]);\n}\n`,
    },
    new: {
      'src/components/blame.js': `export function groupBlame(commits) {\n  const groups = [];\n  for (const commit of commits) {\n    const last = groups[groups.length - 1];\n    if (last && last.commit.sha === commit.sha) last.lines.push(commit);\n    else groups.push({ commit, lines: [commit] });\n  }\n  return groups;\n}\n`,
    },
  },
};

export default {
  README_MD, CONTRIBUTING_MD, CODE_OF_CONDUCT_MD, SECURITY_MD, LICENSE_TEXT, GITIGNORE,
  PACKAGE_JSON, REDGET_CONFIG_YML, WORKFLOW_CI_YML, WORKFLOW_RELEASE_YML,
  APP_JS, ROUTER_JS, STORE_JS, THEME_JS, TOKENS_CSS, STYLES_CSS, INDEX_HTML,
  SCHEMA_SQL, DEPLOY_SH, DOCKERFILE, CODEOWNERS, FUNDING_YML, CITATION_CFF,
  ISSUE_TEMPLATE_BUG, ISSUE_TEMPLATE_FEATURE, PR_TEMPLATE, WIKI_PAGES,
  WIKI_SIDEBAR, WIKI_FOOTER, CHANGELOG_MD, DEMO_DATA_JSON, NGINX_CONF, DOCS_MD,
  DEMO_IMAGE_SVG, REDGET_CORE_TREE, SECONDARY_TREES, PR_DIFF_SOURCES, genericReadme,
};
