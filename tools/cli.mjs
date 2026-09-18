#!/usr/bin/env node
/**
 * RedGet CLI — the engine behind `red` (red.sh) and `red` (red.bat).
 *
 *   red help                     every command
 *   red version                  version, Node release, file inventory
 *   red startup                  print startup.txt (how to open the site)
 *   red serve [port]             serve RedGet on http://localhost:PORT
 *   red list [--db FILE]         every forge in an exported database
 *   red export <forge> [dir]     copy a forge's files out to your computer
 *   red export --all [dir]       copy every forge out, one folder each
 *   red check                    run the full validation suite
 *   red doctor                   diagnose the install
 *
 * RedGet has no server and no API: everything lives in the browser's
 * localStorage. `export` therefore reads the JSON you download from
 * Settings → Data → "Export data as JSON" (default: ./redget-data.json,
 * ./redget-export.json or ./redget.db.json in the current folder).
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const VERSION = readVersion();
const DB_CANDIDATES = ['redget-data.json', 'redget-export.json', 'redget.db.json', 'redget.json'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* ── entry ──────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);

/** Flags that swallow the next argument as their value. */
const VALUE_FLAGS = ['--db', '--from', '--file', '--owner', '--branch', '--port', '-p'];
const isFlag = (a) => a.startsWith('-');
const consumed = new Set();
VALUE_FLAGS.forEach((name) => {
  const i = argv.indexOf(name);
  if (i !== -1 && argv[i + 1] && !isFlag(argv[i + 1])) consumed.add(i + 1);
});

const flags = argv.filter(isFlag);
/** Positional arguments only — never a flag's value. */
const args = argv.filter((a, i) => !isFlag(a) && !consumed.has(i));
const command = (args[0] || flagCommand() || 'help').toLowerCase();

function flagCommand() {
  if (flags.some((f) => ['--help', '-h', '-?'].includes(f))) return 'help';
  if (flags.some((f) => ['--version', '-v'].includes(f))) return 'version';
  if (flags.some((f) => ['--info', '-i'].includes(f))) return 'info';
  if (flags.some((f) => ['--startup', '-s'].includes(f))) return 'startup';
  if (flags.some((f) => ['--serve', '--start', '--open'].includes(f))) return 'serve';
  if (flags.some((f) => ['--export', '--copy'].includes(f))) return 'export';
  if (flags.some((f) => ['--list', '--ls'].includes(f))) return 'list';
  if (flags.some((f) => ['--check', '--test', '--validate'].includes(f))) return 'check';
  if (flags.some((f) => ['--doctor', '--diagnose'].includes(f))) return 'doctor';
  return null;
}

function flagValue(names, fallback) {
  for (const name of names) {
    const i = argv.indexOf(name);
    if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('-')) return argv[i + 1];
    const eq = argv.find((a) => a.startsWith(name + '='));
    if (eq) return eq.slice(name.length + 1);
  }
  return fallback;
}

const has = (names) => argv.some((a) => names.includes(a));

try {
  switch (command) {
    case 'help': case '--help': case '-h': printHelp(); break;
    case 'version': case '--version': case '-v': printVersion(); break;
    case 'info': case '--info': case '-i': printInfo(); break;
    case 'startup': case '--startup': printStartup(); break;
    case 'serve': case 'start': case '--serve': serve(); break;
    case 'list': case 'ls': case '--list': listForges(); break;
    case 'export': case 'copy': case '--export': exportForge(); break;
    case 'check': case 'test': case '--check': runChecks(); break;
    case 'doctor': case '--doctor': doctor(); break;
    default:
      console.log(`red: "${command}" is not a command. Try \`red help\`.`);
      process.exit(1);
  }
} catch (e) {
  console.error('red: ' + (e && e.message ? e.message : e));
  process.exit(1);
}

/* ── commands ───────────────────────────────────────────────────── */
function printHelp() {
  console.log(`
  ${title('RedGet')} ${VERSION} — a code forge that runs entirely in your browser

  ${title('USAGE')}
    red <command> [options]            from this folder
    ./red.sh <command>                 Linux / macOS
    red.bat <command>                  Windows

  ${title('COMMANDS')}
    help, --help, -h                   this text
    version, --version, -v             version, Node release, file inventory
    info, --info, -i                   about this install — what, where, commands
    startup, --startup, -s             how to open the site (prints startup.txt)
    serve [port], --serve              serve RedGet on http://localhost:4173
    list, --list                       every forge in an exported database
    export <forge> [dir], --export     copy one forge's files to your computer
    export --all [dir]                 copy every forge, one folder each
    check, --check                     run the validation suite (imports, icons,
                                       smoke test, link check)
    doctor, --doctor                   diagnose this install

  ${title('EXPORT OPTIONS')}
    --db <file>                        database JSON to read
                                       (default: ${DB_CANDIDATES[0]})
    --owner <name>                     which account/org owns the forge
    --branch <name>                    write only files from that branch
    --json                             also write the full forge record as JSON

  Paths listed in the .redignore next to red.sh are never written out.

  ${title('WHERE THE DATA COMES FROM')}
    RedGet keeps everything in this browser's localStorage — there is no
    server to query. To copy a forge out:

      1. open RedGet, go to Settings → Data
      2. press "Export data as JSON"     → downloads redget-data.json
      3. put that file next to red.sh
      4. red list
         red export atlas ./atlas

  ${title('EXAMPLES')}
    red serve 8080
    red export atlas
    red export redget-labs/beacon ./beacon --json
    red export --all ./forged-backup
    red check
`);
}

function printVersion() {
  const counts = inventory();
  console.log(`RedGet ${VERSION}`);
  console.log(`  node      ${process.version}`);
  console.log(`  platform  ${process.platform} (${process.arch})`);
  console.log(`  root      ${root}`);
  console.log(`  modules   ${counts.modules} ES modules, ${counts.views} views, ${counts.css} stylesheets`);
  console.log(`  storage   localStorage key ${'redget.db.v5'}`);
  console.log(`  tooling   ${counts.tools} validation tools`);
}

function printInfo() {
  const counts = inventory();
  console.log('');
  console.log(`  ${title('RedGet')} ${VERSION} — a complete code forge that runs entirely in your browser`);
  console.log('');
  console.log('  WHAT IT IS');
  console.log('    Accounts by key, organizations, forges, files, commits, branches,');
  console.log('    issues, pull requests with reviews, workflow runs, projects, wikis,');
  console.log('    releases, discussions, packages, gists, codespaces, notifications,');
  console.log('    SSH/GPG keys and a marketplace. No server, no database service, no');
  console.log('    third-party domain — every byte lives in this browser\u2019s localStorage.');
  console.log('');
  console.log('  THIS INSTALL');
  console.log('    live site   https://redlua.github.io/   (static · no build · no commands)');
  console.log(`    version     ${VERSION}`);
  console.log(`    node        ${process.version}`);
  console.log(`    platform    ${process.platform} (${process.arch})`);
  console.log(`    root        ${root}`);
  console.log(`    modules     ${counts.modules} ES modules · ${counts.views} views · ${counts.css} stylesheets`);
  console.log(`    tooling     ${counts.tools} validation tools`);
  console.log('    storage     localStorage key redget.db.v5   (per browser, per origin)');
  console.log('');
  console.log('  COMMANDS');
  console.log('    red help · red info · red version · red startup');
  console.log('    red serve [port] · red list · red export <forge> · red check · red doctor');
  console.log('');
  console.log('  NEXT');
  console.log('    red --help        every command and option');
  console.log('    red serve         run the site on http://localhost:4173');
  console.log("    red export …      copy a forge's files to your computer");
  console.log('');
}

function printStartup() {
  const file = path.join(root, 'startup.txt');
  if (!fs.existsSync(file)) {
    console.log('startup.txt is missing from ' + root);
    process.exit(1);
  }
  process.stdout.write(fs.readFileSync(file, 'utf8'));
}

function serve() {
  const port = Number(args[1] || flagValue(['--port', '-p'], '4173'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.log(`red: "${args[1] || port}" is not a port number.`);
    process.exit(1);
  }
  const index = path.join(root, 'index.html');
  if (!fs.existsSync(index)) {
    console.log('red: index.html is missing — run this from the RedGet folder.');
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    if (urlPath === '/') urlPath = '/index.html';
    const target = path.join(root, urlPath);

    // never escape the project folder
    if (!target.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }

    fs.readFile(target, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('404 — nothing is served at ' + urlPath);
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(data);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`red: port ${port} is already in use. Try \`red serve ${port + 1}\`.`);
      process.exit(1);
    }
    throw err;
  });

  server.listen(port, '0.0.0.0', () => {
    console.log('');
    console.log('  ' + title('RedGet') + ' ' + VERSION + ' is running');
    console.log('');
    console.log('    http://localhost:' + port);
    console.log('    serving ' + root);
    console.log('');
    console.log('  Press Ctrl+C to stop.');
    console.log('');
  });
}

function listForges() {
  const db = loadDB();
  const rows = allForges(db);
  if (!rows.length) {
    console.log('That database is empty — no forges yet.');
    console.log('Create one in RedGet, then Settings → Data → Export data as JSON.');
    return;
  }
  console.log('');
  console.log('  ' + rows.length + ' forge' + (rows.length === 1 ? '' : 's') + ' in ' + path.relative(process.cwd(), db.file));
  console.log('');
  const width = Math.max(...rows.map((r) => (r.owner + '/' + r.forge.name).length));
  rows.forEach((r) => {
    const label = (r.owner + '/' + r.forge.name).padEnd(width);
    const files = (r.forge.files || []).length;
    const commits = (r.forge.commits || []).length;
    const issues = (r.forge.issues || []).length;
    const pulls = (r.forge.pulls || []).length;
    console.log(`  ${label}  ${r.forge.visibility}  ${String(files).padStart(3)} files  ${String(commits).padStart(3)} commits  ${issues} issues  ${pulls} pulls`);
  });
  console.log('');
  console.log('  Copy one out with:  red export ' + rows[0].owner + '/' + rows[0].forge.name);
  console.log('');
}

function exportForge() {
  const db = loadDB();
  const rows = allForges(db);
  const wantAll = has(['--all', '-a']);

  if (wantAll) {
    const target = path.resolve(args[1] || 'redget-export');
    let written = 0;
    rows.forEach((row) => {
      const dir = path.join(target, row.owner, row.forge.name);
      written += writeForge(row.forge, dir, row.owner);
    });
    console.log(`\n  Exported ${rows.length} forge${rows.length === 1 ? '' : 's'} (${written} files) to ${target}\n`);
    return;
  }

  const wanted = args[1] || flagValue(['--export', '--copy'], null);
  if (!wanted) {
    console.log('red: which forge? Try `red list`, then `red export <owner>/<forge> [dir]`.');
    process.exit(1);
  }
  const ownerFilter = flagValue(['--owner'], null);
  const match = rows.filter((row) => {
    const full = row.owner + '/' + row.forge.name;
    if (ownerFilter && row.owner !== ownerFilter) return false;
    return full === wanted || row.forge.name === wanted;
  });

  if (!match.length) {
    console.log(`red: no forge called "${wanted}" in ${db.file}.`);
    console.log('    Available: ' + (rows.map((r) => r.owner + '/' + r.forge.name).join(', ') || 'none'));
    process.exit(1);
  }
  if (match.length > 1 && !ownerFilter) {
    console.log(`red: "${wanted}" is ambiguous — several owners have one. Pick one:`);
    match.forEach((row) => console.log('    red export ' + row.owner + '/' + row.forge.name + ' --owner ' + row.owner));
    process.exit(1);
  }

  const row = match[0];
  // A forge may be named by owner/name; never let that slash become a folder.
  const target = path.resolve(args[2] || safeDirName(row.forge.name));
  const count = writeForge(row.forge, target, row.owner);

  if (has(['--json'])) {
    const record = path.join(target, '.redget', 'forge.json');
    fs.mkdirSync(path.dirname(record), { recursive: true });
    fs.writeFileSync(record, JSON.stringify(row.forge, null, 2));
    console.log('  + ' + path.relative(process.cwd(), record) + ' (full record)');
  }

  console.log('');
  console.log(`  ${title(row.owner + '/' + row.forge.name)}`);
  console.log(`  ${count} file${count === 1 ? '' : 's'} → ${target}`);
  console.log(`  ${(row.forge.commits || []).length} commits · ${(row.forge.issues || []).length} issues · ${(row.forge.pulls || []).length} pulls · branch ${row.forge.defaultBranch || 'main'}`);
  console.log('');
}

/** A folder name for a forge: slashes become dashes, nothing empty or dot-only. */
function safeDirName(name) {
  const cleaned = String(name || '')
    .replace(/[/\\]+/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/\.{2,}/g, '.');
  return cleaned || 'forge';
}

/**
 * One path segment of a file inside a forge. Leading dots are kept — a real
 * project has `.redignore` and `.redget/workflows/ci.yml` — but a segment may
 * not be empty, `.` or `..`, which is what keeps an export inside its folder.
 */
function safeSegment(part) {
  const trimmed = String(part).replace(/[\u0000-\u001f]/g, '').trim();
  if (!trimmed || trimmed === '.' || trimmed === '..') return null;
  if (/^[a-z]:$/i.test(trimmed)) return null;
  return trimmed;
}

function writeForge(forge, target, owner) {
  if (fs.existsSync(target) && !fs.statSync(target).isDirectory()) {
    console.log(`red: ${target} already exists and is a file, not a folder.`);
    console.log('     Choose another target:  red export ' + forge.name + ' <folder>');
    process.exit(1);
  }
  const branch = flagValue(['--branch'], null);
  let files = (forge.files || []).filter((f) => f && f.name);

  if (branch) {
    // Only the files that branch actually changed. Commits made on the default
    // branch carry no `branch` marker, so a named branch is matched strictly
    // first; if nothing matches, the branch is treated as the default one.
    const touched = new Set();
    const onBranch = (forge.commits || []).filter((c) => c && c.branch === branch);
    (onBranch.length ? onBranch : (forge.commits || []))
      .forEach((c) => ((c && c.files) || []).forEach((name) => touched.add(name)));
    const filtered = files.filter((f) => touched.has(f.name));
    if (filtered.length) files = filtered;
  }

  const ignore = readIgnore();
  let count = 0;
  let skipped = 0;
  files.forEach((file) => {
    // Reject anything that could leave the target folder: absolute paths,
    // drive letters, or a `..` segment anywhere in the name.
    const rawName = String(file.name || '');
    if (!rawName || rawName.includes('\0')) return;
    const parts = rawName.replace(/^([/\\])+/, '').split(/[/\\]+/).filter(Boolean).map(safeSegment);
    if (!parts.length || parts.some((part) => part === null)) return;
    const relative = parts.join('/');
    if (ignore.some((pattern) => matchesIgnore(relative, pattern))) { skipped++; return; }
    const full = path.join(target, parts.join(path.sep));
    if (path.resolve(full) !== full || !full.startsWith(path.resolve(target) + path.sep)) return;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, String(file.content == null ? '' : file.content));
    console.log('  + ' + path.relative(process.cwd(), full));
    count++;
  });

  const meta = [
    '# ' + (owner ? owner + '/' : '') + forge.name,
    '',
    forge.desc || '',
    '',
    'Copied out of RedGet ' + VERSION + ' on ' + new Date().toISOString(),
    'Visibility : ' + (forge.visibility || 'public'),
    'Language   : ' + (forge.language || 'unspecified'),
    'Branch     : ' + (branch || forge.defaultBranch || 'main') + (branch ? ' (only files this branch changed)' : ''),
    'Files      : ' + count,
    'Commits    : ' + (forge.commits || []).length,
    '',
  ].join('\n').replace(/\n{3,}/g, '\n\n');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'FORGE.md'), meta);

  if (skipped) console.log(`  · ${skipped} file${skipped === 1 ? '' : 's'} left out by .redignore`);
  return count;
}

/** Patterns from the .redignore that sits next to this CLI, if there is one. */
function readIgnore() {
  const file = path.join(root, '.redignore');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * Match one relative path against one .redignore pattern.
 * `node_modules/` matches that folder at any depth, `*.log` matches by
 * extension, and a plain name matches a file or folder anywhere in the path.
 */
function matchesIgnore(relativePath, pattern) {
  const dirOnly = pattern.endsWith('/');
  const bare = dirOnly ? pattern.slice(0, -1) : pattern;
  if (!bare) return false;
  const parts = relativePath.split('/');
  const tester = (segment) => {
    if (!bare.includes('*')) return segment === bare;
    const re = new RegExp('^' + bare.split('*').map(escapeRegExp).join('[^/]*') + '$');
    return re.test(segment);
  };
  if (dirOnly) return parts.slice(0, -1).some(tester);
  return parts.some(tester) || tester(relativePath);
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function runChecks() {
  const suite = [
    ['module imports and exports', 'tools/check-imports.mjs'],
    ['icon names', 'tools/check-icons.mjs'],
    ['smoke test (every route, signed in and out)', 'tools/smoke.mjs'],
    ['link check (nothing dead-ends)', 'tools/check-links.mjs'],
  ];
  console.log('');
  console.log('  Running the RedGet validation suite…');
  console.log('');
  let failed = 0;
  suite.forEach(([label, script], index) => {
    const file = path.join(root, script);
    if (!fs.existsSync(file)) { console.log(`  ${index + 1}. ${label}: SKIPPED`); return; }
    const out = spawnSyncNode(file);
    const ok = out.status === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? '✓' : '✗'} ${index + 1}. ${label}`);
    if (!ok) {
      out.tail.split('\n').forEach((line) => console.log('      ' + line));
    }
  });
  console.log('');
  console.log(failed === 0 ? '  ✓ RedGet is healthy' : `  ✗ ${failed} check(s) failed`);
  console.log('');
  process.exit(failed === 0 ? 0 : 1);
}

function doctor() {
  const checks = [];
  checks.push(['Node.js 18 or newer', Number(process.versions.node.split('.')[0]) >= 18, process.version]);
  checks.push(['index.html present', fs.existsSync(path.join(root, 'index.html')), root]);
  checks.push(['src/app.js present', fs.existsSync(path.join(root, 'src/app.js')), '']);
  checks.push(['styles present', fs.existsSync(path.join(root, 'assets/css/main.css')), '']);
  checks.push(['startup.txt present', fs.existsSync(path.join(root, 'startup.txt')), '']);
  checks.push(['red.sh present', fs.existsSync(path.join(root, 'red.sh')), '']);
  checks.push(['red.bat present', fs.existsSync(path.join(root, 'red.bat')), '']);

  const tools = ['check-imports.mjs', 'check-icons.mjs', 'bundle.mjs', 'smoke.mjs', 'check-links.mjs'];
  tools.forEach((t) => checks.push(['tools/' + t, fs.existsSync(path.join(root, 'tools', t)), '']));

  const jsdom = resolveJsdom();
  checks.push(['jsdom (smoke test only)', Boolean(jsdom), jsdom ? jsdom : 'run: npm install jsdom@24']);

  const counts = inventory();
  checks.push([`${counts.modules} ES modules found`, counts.modules > 40, String(counts.modules)]);

  let bad = 0;
  console.log('');
  checks.forEach(([label, ok, note]) => {
    if (!ok) bad++;
    console.log(`  ${ok ? '✓' : '✗'} ${label}${note ? '  ' + note : ''}`);
  });
  console.log('');
  console.log(bad === 0 ? '  ✓ everything RedGet needs is here' : `  ✗ ${bad} thing(s) need attention`);
  console.log('');
  process.exit(bad === 0 ? 0 : 1);
}

/* ── helpers ────────────────────────────────────────────────────── */
function title(text) { return '\x1b[1m' + text + '\x1b[0m'; }

function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return pkg.version || '0.0.0';
  } catch (e) {
    return '0.0.0';
  }
}

function inventory() {
  let modules = 0;
  let views = 0;
  let css = 0;
  const walkDir = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walkDir(full); return; }
      if (entry.name.endsWith('.js')) { modules++; if (full.includes(path.sep + 'views' + path.sep)) views++; }
      if (entry.name.endsWith('.css')) css++;
    });
  };
  walkDir(path.join(root, 'src'));
  walkDir(path.join(root, 'assets'));
  const tools = fs.existsSync(path.join(root, 'tools'))
    ? fs.readdirSync(path.join(root, 'tools')).filter((f) => f.endsWith('.mjs')).length : 0;
  return { modules, views, css, tools };
}

function resolveJsdom() {
  for (const base of [path.join(root, 'node_modules'), path.join(path.dirname(root), 'node_modules')]) {
    const pkg = path.join(base, 'jsdom', 'package.json');
    if (fs.existsSync(pkg)) {
      try { return 'jsdom ' + JSON.parse(fs.readFileSync(pkg, 'utf8')).version + ' at ' + base; } catch (e) { return base; }
    }
  }
  return null;
}

function loadDB() {
  const explicit = flagValue(['--db', '--from', '--file'], null);
  const candidates = explicit ? [path.resolve(explicit)] : DB_CANDIDATES.map((name) => path.resolve(process.cwd(), name));
  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (!file) {
    console.log('red: no exported database found.');
    console.log('');
    console.log('  In RedGet:  Settings → Data → "Export data as JSON"');
    console.log('  Then put the file here (or point at it):');
    console.log('');
    console.log('    red list --db /path/to/redget-data.json');
    console.log('');
    console.log('  Looked for: ' + candidates.map((c) => path.relative(process.cwd(), c) || c).join(', '));
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`red: ${file} is not valid JSON (${e.message}).`);
    process.exit(1);
  }
  const db = parsed && parsed.db ? parsed.db : parsed;
  if (!db || typeof db !== 'object' || !db.users) {
    console.log(`red: ${file} does not look like a RedGet database (no "users" collection).`);
    process.exit(1);
  }
  return { db, file };
}

/** Every forge in the database, with its owner, newest first. */
function allForges(loaded) {
  const db = loaded && loaded.db ? loaded.db : loaded;
  const rows = [];
  Object.keys(db.users || {}).forEach((key) => {
    const user = db.users[key] || {};
    (user.forges || user.repos || []).forEach((forge) => rows.push({ owner: user.username || key, forge }));
  });
  Object.keys(db.orgs || {}).forEach((slug) => {
    const org = db.orgs[slug] || {};
    (org.forges || org.repos || []).forEach((forge) => rows.push({ owner: org.slug || slug, forge }));
  });
  return rows.sort((a, b) => (b.forge.updated || 0) - (a.forge.updated || 0));
}

/** Run one tool synchronously so the suite output stays in order. */
function spawnSyncNode(script) {
  const result = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  const output = String(result.stdout || '') + String(result.stderr || '');
  const lines = output.split('\n').filter((line) => line.trim());
  return { status: result.status, tail: lines.slice(-14).join('\n') };
}
