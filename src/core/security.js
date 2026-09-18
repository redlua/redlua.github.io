/**
 * RedGet — security: advisories, dependency alerts, code scanning and secret
 * scanning.
 *
 * Every alert is computed from the forge's real files, so the Security
 * tab forgerts things that are actually true of the code you stored:
 *
 *   • Secret scanning looks for credential-shaped strings (private keys,
 *     tokens, passwords in config) in file contents.
 *   • Dependency scanning reads package.json / requirements.txt style
 *     manifests and flags pinned versions that are known-old or unpinned.
 *   • Code scanning flags patterns that commonly lead to injection or XSS
 *     (innerHTML with unescaped data, eval, `document.write`).
 *   • Advisories are ones you publish yourself; none exist until you write one.
 */

import { ME, saveDB } from '../state.js';
import { uid } from './util.js';

/* ------------------------------------------------------- secret scanning */

var SECRET_PATTERNS = [
  { id: 'private-key', label: 'Private key', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, severity: 'critical' },
  { id: 'aws-access-key', label: 'Cloud access key ID', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, severity: 'critical' },
  { id: 'slack-token', label: 'Chat webhook token', re: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, severity: 'high' },
  { id: 'npm-token', label: 'Registry token', re: /\bnpm_[A-Za-z0-9]{30,}\b/, severity: 'high' },
  { id: 'bearer', label: 'Bearer token in source', re: /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}/, severity: 'high' },
  { id: 'password-assignment', label: 'Hardcoded password', re: /(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*['"][^'"]{6,}['"]/i, severity: 'medium' },
  { id: 'connection-string', label: 'Database connection string', re: /(?:mongodb|postgres|mysql|redis):\/\/[^\s'"]*:[^\s'"]*@/i, severity: 'high' },
];

export function secretFindings(forge) {
  var findings = [];
  (forge.files || []).forEach(function (file) {
    var content = String(file.content || '');
    var lines = content.split('\n');
    SECRET_PATTERNS.forEach(function (pattern) {
      lines.forEach(function (line, index) {
        if (!pattern.re.test(line)) return;
        findings.push({
          id: 'sec-' + file.name + '-' + (index + 1) + '-' + pattern.id,
          rule: pattern.label,
          ruleId: pattern.id,
          severity: pattern.severity,
          path: file.name,
          line: index + 1,
          state: 'open',
          detected: file.commitTime || forge.updated,
        });
      });
    });
  });
  var dismissed = secretState(forge);
  findings.forEach(function (f) { if (dismissed[f.id]) f.state = dismissed[f.id]; });
  return findings;
}

/* ------------------------------------------------------- code scanning */

var CODE_PATTERNS = [
  { id: 'js/inner-html', label: 'Unescaped HTML assignment', re: /\.innerHTML\s*=\s*[^;]*(?!\besc\()/, severity: 'warning', languages: ['js', 'ts', 'html'] },
  { id: 'js/eval', label: 'Use of eval()', re: /\beval\s*\(/, severity: 'error', languages: ['js', 'ts'] },
  { id: 'js/document-write', label: 'document.write()', re: /document\.write\s*\(/, severity: 'warning', languages: ['js', 'html'] },
  { id: 'shell/unquoted-var', label: 'Unquoted shell variable', re: /(?:rm|mv|cp)\s+-[a-z]*\s+\$[A-Za-z_]/, severity: 'warning', languages: ['sh'] },
  { id: 'generic/todo-fail', label: 'Failing marker left in source', re: /TODO:?\s*fail/i, severity: 'error', languages: [] },
];

export function codeFindings(forge) {
  var findings = [];
  (forge.files || []).forEach(function (file) {
    var ext = String(file.name.split('.').pop() || '').toLowerCase();
    var lines = String(file.content || '').split('\n');
    CODE_PATTERNS.forEach(function (pattern) {
      if (pattern.languages.length && pattern.languages.indexOf(ext) === -1) return;
      lines.forEach(function (line, index) {
        if (!pattern.re.test(line)) return;
        findings.push({
          id: 'code-' + file.name + '-' + (index + 1) + '-' + pattern.id,
          rule: pattern.label,
          ruleId: pattern.id,
          severity: pattern.severity,
          path: file.name,
          line: index + 1,
          state: 'open',
          detected: file.commitTime || forge.updated,
        });
      });
    });
  });
  var dismissed = codeState(forge);
  findings.forEach(function (f) { if (dismissed[f.id]) f.state = dismissed[f.id]; });
  return findings;
}

/* -------------------------------------------------- dependency scanning */

/**
 * Dependency alerts come from manifest files that actually exist.
 * A dependency is flagged when it is pinned to an old major version, uses a
 * wildcard range, or points at a URL or a remote reference instead of a registry.
 */
export function dependencyFindings(forge) {
  var findings = [];
  var manifests = (forge.files || []).filter(function (f) {
    return /(^|\/)(package\.json|requirements\.txt|Pipfile|Gemfile|go\.mod|Cargo\.toml|composer\.json)$/i.test(f.name);
  });

  manifests.forEach(function (manifest) {
    var content = String(manifest.content || '');
    if (/package\.json$/i.test(manifest.name)) {
      var parsed = safeJson(content);
      if (!parsed) {
        findings.push(makeDep(manifest, 'unparsable', 'Manifest is not valid JSON', 'error', null));
        return;
      }
      ['dependencies', 'devDependencies'].forEach(function (group) {
        Object.keys(parsed[group] || {}).forEach(function (name) {
          var range = String(parsed[group][name]);
          var rule = classifyRange(range);
          if (rule) findings.push(makeDep(manifest, name, rule.message, rule.severity, range));
        });
      });
      if (!parsed.license) findings.push(makeDep(manifest, 'license', 'Package declares no license', 'note', null));
    } else if (/requirements\.txt$/i.test(manifest.name)) {
      content.split('\n').forEach(function (line) {
        var trimmed = line.trim();
        if (!trimmed || trimmed.charAt(0) === '#') return;
        var m = trimmed.match(/^([A-Za-z0-9_.\-]+)\s*(==|>=|~=|\*)\s*(.*)$/);
        if (!m) { findings.push(makeDep(manifest, trimmed.split(/[=<>~]/)[0], 'Requirement is not pinned to a version', 'warning', trimmed)); return; }
        var rule2 = classifyRange(m[2] + m[3]);
        if (rule2) findings.push(makeDep(manifest, m[1], rule2.message, rule2.severity, trimmed));
      });
    } else {
      findings.push(makeDep(manifest, manifest.name, 'Manifest present — dependency review is limited to package.json and requirements.txt in this build', 'note', null));
    }
  });

  var dismissed = dependabotState(forge);
  findings.forEach(function (f) { if (dismissed[f.id]) f.state = dismissed[f.id]; });
  return findings;
}

function makeDep(manifest, name, message, severity, range) {
  return {
    id: 'dep-' + manifest.name + '-' + String(name).replace(/[^a-zA-Z0-9._-]/g, '-'),
    package: name,
    manifest: manifest.name,
    message: message,
    severity: severity,
    range: range,
    state: 'open',
    detected: manifest.commitTime || Date.now(),
  };
}

function classifyRange(range) {
  var value = String(range || '');
  if (!value) return null;
  if (value === '*' || value === 'latest') return { message: 'Dependency accepts any version', severity: 'high' };
  if (/^(rgt|http|file|link):/i.test(value)) return { message: 'Dependency is resolved from a URL rather than a registry', severity: 'medium' };
  var major = value.match(/(\d+)\./);
  if (major && Number(major[1]) === 0) return { message: 'Dependency is on a 0.x release (pre-1.0 API)', severity: 'low' };
  if (value.indexOf('>=') === 0 && !value.indexOf('<')) return { message: 'Dependency has an open upper bound', severity: 'low' };
  return null;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (e) { return null; }
}

/* ------------------------------------------------------ alert dismissal */

function alertBucket(forge, key) {
  if (!forge.security) forge.security = {};
  if (!forge.security[key]) forge.security[key] = {};
  return forge.security[key];
}

function secretState(forge) { return alertBucket(forge, 'secretState'); }
function codeState(forge) { return alertBucket(forge, 'codeState'); }
function dependabotState(forge) { return alertBucket(forge, 'dependabotState'); }

export function dismissAlert(forge, kind, id, state) {
  var bucket = kind === 'secret' ? secretState(forge) : kind === 'code' ? codeState(forge) : dependabotState(forge);
  bucket[id] = state || 'dismissed';
  saveDB();
  return bucket[id];
}

export function reopenAlert(forge, kind, id) {
  var bucket = kind === 'secret' ? secretState(forge) : kind === 'code' ? codeState(forge) : dependabotState(forge);
  delete bucket[id];
  saveDB();
}

export function securitySummary(forge) {
  var secrets = secretFindings(forge);
  var code = codeFindings(forge);
  var deps = dependencyFindings(forge);
  var advisories = advisoriesFor(forge);
  return {
    secrets: secrets.filter(function (f) { return f.state === 'open'; }).length,
    secretsAll: secrets.length,
    code: code.filter(function (f) { return f.state === 'open'; }).length,
    codeAll: code.length,
    dependencies: deps.filter(function (f) { return f.state === 'open'; }).length,
    dependenciesAll: deps.length,
    advisories: advisories.filter(function (a) { return a.state === 'open'; }).length,
    critical: secrets.concat(code, deps).filter(function (f) {
      return f.state === 'open' && (f.severity === 'critical' || f.severity === 'error' || f.severity === 'high');
    }).length,
  };
}

/* ------------------------------------------------------------ advisories */

export var ADVISORY_SEVERITIES = ['critical', 'high', 'medium', 'low', 'note'];

export function advisoriesFor(forge) {
  if (!forge.security) forge.security = {};
  if (!forge.security.advisories) forge.security.advisories = [];
  return forge.security.advisories.slice().sort(function (a, b) { return b.published - a.published; });
}

export function createAdvisory(forge, payload) {
  if (!forge.security) forge.security = {};
  if (!forge.security.advisories) forge.security.advisories = [];
  var now = Date.now();
  var advisory = {
    id: uid('adv'),
    ghsaId: 'RGSA-' + String(now).slice(-6),
    title: String(payload.title || 'Security advisory').slice(0, 160),
    summary: payload.summary || '',
    description: payload.description || '',
    severity: ADVISORY_SEVERITIES.indexOf(payload.severity) !== -1 ? payload.severity : 'medium',
    affected: payload.affected || [{ package: forge.name, patched: payload.patched || '', range: payload.range || '' }],
    cve: payload.cve || null,
    credits: payload.credits || [],
    state: payload.draft ? 'draft' : 'open',
    author: ME ? ME.username : forge.ownerUsername,
    created: now,
    published: payload.draft ? null : now,
  };
  forge.security.advisories.unshift(advisory);
  saveDB();
  return advisory;
}

export function publishAdvisory(forge, advisory) {
  advisory.state = 'open';
  advisory.published = Date.now();
  saveDB();
  return advisory;
}

export function closeAdvisory(forge, advisory) {
  advisory.state = 'closed';
  saveDB();
  return advisory;
}

export function deleteAdvisory(forge, advisory) {
  forge.security.advisories = forge.security.advisories.filter(function (a) { return a.id !== advisory.id; });
  saveDB();
  return true;
}

/* ------------------------------------------------------- policy settings */

export function securitySettings(forge) {
  if (!forge.security) forge.security = {};
  if (!forge.security.settings) {
    forge.security.settings = {
      secretScanning: true,
      secretPushProtection: false,
      codeScanning: true,
      dependabotAlerts: true,
      dependabotUpdates: false,
      privateVulnerabilityForgerting: true,
      securityPolicy: '',
    };
  }
  return forge.security.settings;
}

export function saveSecuritySettings(forge, changes) {
  var settings = securitySettings(forge);
  Object.keys(changes || {}).forEach(function (key) { settings[key] = changes[key]; });
  saveDB();
  return settings;
}

/** SECURITY.md content, stored with the forge files. */
export function securityPolicy(forge) {
  var file = (forge.files || []).filter(function (f) { return /^SECURITY\.md$/i.test(f.name); })[0];
  return file ? file.content : '';
}
