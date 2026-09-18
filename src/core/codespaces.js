/**
 * RedGet — codespaces: browser development environments.
 *
 * A codespace is a record of an environment you created for a forge and
 * branch. It has a real lifecycle (creating → available → stopped → deleted),
 * an idle timeout you choose, and a terminal that runs against the actual
 * files in the forge.
 *
 *   codespace = {
 *     id, owner, forgeOwner, forgeName, branch, template,
 *     status: 'creating'|'available'|'stopped'|'error',
 *     created, lastUsed, idleMinutes, region, cpu, memory,
 *     history: [{ at, event }],
 *   }
 */

import { DB, ME, saveDB } from '../state.js';
import { uid } from './util.js';
import { logActivity } from './forges.js';

export var CODESPACE_TEMPLATES = [
  { id: 'node', label: 'Node 20', detail: 'npm, pnpm and the RedGet CLI preinstalled', cpu: 4, memory: '8 GB' },
  { id: 'python', label: 'Python 3.13', detail: 'venv, pip and common data packages', cpu: 4, memory: '8 GB' },
  { id: 'rust', label: 'Rust stable', detail: 'cargo, rustfmt and clippy', cpu: 8, memory: '16 GB' },
  { id: 'go', label: 'Go 1.23', detail: 'go toolchain and gopls', cpu: 4, memory: '8 GB' },
  { id: 'minimal', label: 'Minimal', detail: 'bash, rgt and curl only', cpu: 2, memory: '4 GB' },
];

export var CODESPACE_REGIONS = ['local', 'eu-west', 'us-east'];

export function allCodespaces() {
  return (DB.codespaces || []).slice().sort(function (a, b) { return b.lastUsed - a.lastUsed; });
}

export function codespacesFor(username) {
  var name = username || (ME && ME.username);
  return allCodespaces().filter(function (c) { return c.owner === name; });
}

export function codespaceById(id) {
  return allCodespaces().filter(function (c) { return c.id === id; })[0] || null;
}

export function createCodespace(payload) {
  if (!ME) return null;
  var template = CODESPACE_TEMPLATES.filter(function (t) { return t.id === payload.template; })[0] || CODESPACE_TEMPLATES[0];
  var now = Date.now();
  var codespace = {
    id: uid('cs'),
    name: (payload.name || '').trim() || (payload.forgeName + '-' + template.id),
    owner: ME.username,
    forgeOwner: payload.forgeOwner,
    forgeName: payload.forgeName,
    branch: payload.branch || 'main',
    template: template.id,
    status: 'creating',
    created: now,
    lastUsed: now,
    idleMinutes: payload.idleMinutes || 30,
    region: payload.region || 'local',
    cpu: template.cpu,
    memory: template.memory,
    history: [{ at: now, event: 'Codespace created from ' + template.label }],
  };
  if (!DB.codespaces) DB.codespaces = [];
  DB.codespaces.unshift(codespace);
  saveDB();
  logActivity('codespace.create', codespace.forgeOwner + '/' + codespace.forgeName);
  // Provisioning is instant in the browser: the environment is the forge.
  setTimeout(function () {
    if (codespace.status === 'creating') {
      codespace.status = 'available';
      codespace.history.push({ at: Date.now(), event: 'Environment ready' });
      saveDB();
    }
  }, 1200);
  return codespace;
}

export function startCodespace(codespace) {
  codespace.status = 'available';
  codespace.lastUsed = Date.now();
  codespace.history.push({ at: Date.now(), event: 'Started' });
  saveDB();
  return codespace;
}

export function stopCodespace(codespace) {
  codespace.status = 'stopped';
  codespace.history.push({ at: Date.now(), event: 'Stopped' });
  saveDB();
  return codespace;
}

export function deleteCodespace(codespace) {
  DB.codespaces = (DB.codespaces || []).filter(function (c) { return c.id !== codespace.id; });
  saveDB();
  return true;
}

export function updateCodespace(codespace, changes) {
  Object.keys(changes || {}).forEach(function (key) { codespace[key] = changes[key]; });
  codespace.history.push({ at: Date.now(), event: 'Settings updated' });
  saveDB();
  return codespace;
}

/**
 * Run a shell command against the forge's real files.
 * Returns { output: [string], status: 'ok'|'error' }.
 */
export function runCommand(codespace, forge, command) {
  var cmd = String(command || '').trim();
  var parts = cmd.split(/\s+/);
  var head = parts[0];
  var args = parts.slice(1);
  var files = (forge && forge.files) || [];
  var out = [];

  function push(text) { out.push(text); }

  if (!cmd) return { output: [], status: 'ok' };

  switch (head) {
    case 'ls': {
      var dir = (args[0] || '').replace(/\/$/, '');
      var prefix = dir ? dir + '/' : '';
      var seen = {};
      files.forEach(function (f) {
        if (prefix && f.name.indexOf(prefix) !== 0) return;
        var rest = f.name.slice(prefix.length);
        var slash = rest.indexOf('/');
        seen[slash === -1 ? rest : rest.slice(0, slash) + '/'] = true;
      });
      var names = Object.keys(seen).sort();
      if (!names.length) push('ls: cannot access \'' + (args[0] || '.') + '\': No such file or directory');
      else names.forEach(push);
      return { output: out, status: names.length ? 'ok' : 'error' };
    }
    case 'cat': {
      if (!args[0]) { push('cat: missing file operand'); return { output: out, status: 'error' }; }
      var file = files.filter(function (f) { return f.name === args[0]; })[0];
      if (!file) { push('cat: ' + args[0] + ': No such file or directory'); return { output: out, status: 'error' }; }
      String(file.content || '').split('\n').forEach(push);
      return { output: out, status: 'ok' };
    }
    case 'wc': {
      var target = files.filter(function (f) { return f.name === args[args.length - 1]; })[0];
      if (!target) { push('wc: ' + args[args.length - 1] + ': No such file or directory'); return { output: out, status: 'error' }; }
      var lines = String(target.content || '').split('\n');
      var words = String(target.content || '').split(/\s+/).filter(Boolean).length;
      push('  ' + lines.length + '  ' + words + ' ' + String(target.content || '').length + ' ' + target.name);
      return { output: out, status: 'ok' };
    }
    case 'find': {
      var needle = (args[args.length - 1] || '').toLowerCase();
      files.forEach(function (f) { if (f.name.toLowerCase().indexOf(needle) !== -1) push(f.name); });
      return { output: out, status: 'ok' };
    }
    case 'grep': {
      var pattern = args.filter(function (a) { return a.indexOf('-') !== 0; })[0] || '';
      files.forEach(function (f) {
        String(f.content || '').split('\n').forEach(function (line, i) {
          if (line.indexOf(pattern) !== -1) push(f.name + ':' + (i + 1) + ':' + line);
        });
      });
      if (!out.length) push('No matches for "' + pattern + '"');
      return { output: out, status: 'ok' };
    }
    case 'rgt': {
      if (args[0] === 'status') {
        push('On branch ' + codespace.branch);
        push('nothing to commit, working tree clean');
      } else if (args[0] === 'log') {
        ((forge && forge.commits) || []).slice(0, 10).forEach(function (c) {
          push('commit ' + c.sha);
          push('Author: ' + c.author);
          push('Date:   ' + new Date(c.time).toUTCString());
          push('');
          push('    ' + c.msg);
          push('');
        });
      } else if (args[0] === 'branch') {
        ((forge && forge.branches) || []).forEach(function (b) {
          push((b === codespace.branch ? '* ' : '  ') + b);
        });
      } else {
        push('rgt ' + args.join(' ') + ': recorded in this codespace only');
      }
      return { output: out, status: 'ok' };
    }
    case 'node': {
      if (args[0] === '--version') { push('v20.20.2'); return { output: out, status: 'ok' }; }
      var script = files.filter(function (f) { return f.name === args[0]; })[0];
      if (!script) { push('node: cannot find \'' + (args[0] || '') + '\''); return { output: out, status: 'error' }; }
      push('# executing ' + script.name + ' (' + String(script.content || '').split('\n').length + ' lines)');
      push('# output is not evaluated in the browser sandbox');
      return { output: out, status: 'ok' };
    }
    case 'whoami': push(codespace.owner); return { output: out, status: 'ok' };
    case 'pwd': push('/home/codespace/' + codespace.forgeName); return { output: out, status: 'ok' };
    case 'echo': push(args.join(' ')); return { output: out, status: 'ok' };
    case 'clear': return { output: [], status: 'ok', clear: true };
    case 'help':
      push('Available: ls, cat, wc, find, grep, node, rgt (status|log|branch|copy|pr|actions), whoami, pwd, echo, clear, help');
      return { output: out, status: 'ok' };
    default:
      push(head + ': command not found (this codespace runs a local shell simulator)');
      return { output: out, status: 'error' };
  }
}
