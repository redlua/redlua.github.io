/**
 * RedGet — account settings.
 *
 *   <div class="container page">
 *     <h1>Settings</h1>
 *     <div class="settings-grid">
 *       <nav class="settings-nav"><a class="active" href="#/settings/profile">Public profile</a>…</nav>
 *       <div> <div class="settings-block"> … </div> </div>
 *     </div>
 *   </div>
 *
 * Sections: profile · account · appearance · forges · notifications ·
 * keys (SSH + GPG) · sessions · danger.
 *
 * Every control writes to the signed-in account record or to the database, so
 * reloading the page keeps whatever you changed. SSH keys are stored with a
 * real MD5-style fingerprint computed from the key text you paste in.
 */

import { DB, DB_KEY, ME, saveDB, sessionsFor } from '../state.js';
import { demoLoaded } from '../core/demo.js';
import { ic } from '../icons.js';
import { AVATAR_COLORS, avatarInner, defaultAvatar } from '../core/avatars.js';
import { fmtKey } from '../core/keys.js';
import { getTheme } from '../core/theme.js';
import { openModal } from '../core/modal.js';
import { esc, formatDate, timeAgo } from '../core/util.js';
import { fingerprintKey, parseSshKey } from '../core/sshKeys.js';

export var SETTINGS_SECTIONS = [
  ['profile', 'Public profile', 'person'],
  ['account', 'Account', 'shield'],
  ['appearance', 'Appearance', 'paintbrush'],
  ['forges', 'Forges', 'forge'],
  ['notifications', 'Notifications', 'bell'],
  ['keys', 'SSH and GPG keys', 'key'],
  ['sessions', 'Sessions', 'deviceDesktop'],
  ['data', 'Data', 'database'],
  ['danger', 'Danger Zone', 'alert'],
];

export function viewUserSettings(section) {
  section = section || 'profile';
  if (!ME) return '';
  var known = SETTINGS_SECTIONS.some(function (s) { return s[0] === section; });
  if (!known) section = 'profile';

  var content = {
    profile: profileSection(),
    account: accountSection(),
    appearance: appearanceSection(),
    forges: forgesSection(),
    notifications: notificationsSection(),
    keys: keysSection(),
    sessions: sessionsSection(),
    data: dataSection(),
    danger: dangerSection(),
  }[section];

  return '<div class="container page">' +
    '<h1 class="mb-6">Settings</h1>' +
    '<div class="settings-grid">' +
      '<nav class="settings-nav" aria-label="Settings sections">' +
        '<div class="nav-head">Personal</div>' +
        SETTINGS_SECTIONS.slice(0, 8).map(function (s) {
          return '<a class="' + (section === s[0] ? 'active' : '') + '" href="#/settings/' + s[0] + '">' + ic(s[2], 14) + ' ' + esc(s[1]) + '</a>';
        }).join('') +
        '<div class="nav-sep"></div>' +
        '<div class="nav-head">Danger</div>' +
        '<a class="' + (section === 'danger' ? 'active' : '') + '" style="color:var(--accent)" href="#/settings/danger">' + ic('alert', 14) + ' Danger Zone</a>' +
      '</nav>' +
      '<div>' + content + '</div>' +
    '</div>' +
  '</div>';
}

/* ---------------------------------------------------------------- profile */

function profileSection() {
  var a = ME.avatar || defaultAvatar(ME);
  var status = ME.status || (ME.status = { emoji: '', message: '', busy: false });
  return '<div class="settings-block">' +
      '<h3>Profile picture</h3>' +
      '<div class="avatar-editor">' +
        '<div class="avatar-preview" style="background:' + esc(a.type === 'image' ? 'var(--surface-2)' : (a.bg || '#30363d')) + '">' + avatarInner(ME, 96) + '</div>' +
        '<div style="flex:1;min-width:240px">' +
          '<label class="field-label">Background color</label>' +
          '<div class="swatch-row">' +
            AVATAR_COLORS.map(function (c) {
              return '<button class="swatch' + (a.bg === c ? ' active' : '') + '" style="background:' + c + '" data-bg="' + c + '" aria-label="Use background ' + c + '" title="' + c + '"></button>';
            }).join('') +
          '</div>' +
          '<label class="field-label" for="pfpFile">Upload an image</label>' +
          '<input type="file" id="pfpFile" accept="image/*" class="input" style="padding:6px">' +
          '<div class="hint">PNG, JPG, GIF, WebP or SVG. Maximum 2 MB. Stored locally as a data URL.</div>' +
          (a.type === 'image' ? '<button class="btn sm danger mt-2" id="clearAvatarImg">Remove image</button>' : '') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="settings-block">' +
      '<h3>Public profile</h3>' +
      '<div class="form-row">' +
        '<div class="form-group"><label for="pfName">Name</label><input type="text" id="pfName" class="input" value="' + esc(ME.displayName || '') + '" maxlength="40"></div>' +
        '<div class="form-group"><label for="pfUser">Username</label><input type="text" id="pfUser" class="input" value="' + esc(ME.username) + '" maxlength="30" spellcheck="false">' +
          '<div class="hint">Changing your username updates every link to your profile and forges.</div></div>' +
      '</div>' +
      '<div class="form-group"><label for="pfBio">Bio</label><textarea id="pfBio" class="input" rows="3" maxlength="200" placeholder="A short description of what you build.">' + esc(ME.bio || '') + '</textarea></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label for="pfCompany">Company</label><input type="text" id="pfCompany" class="input" value="' + esc(ME.company || '') + '"></div>' +
        '<div class="form-group"><label for="pfLoc">Location</label><input type="text" id="pfLoc" class="input" value="' + esc(ME.location || '') + '"></div>' +
      '</div>' +
      '<div class="form-group"><label for="pfSite">Website</label><input type="url" id="pfSite" class="input" value="' + esc(ME.website || '') + '" placeholder="/your-page"></div>' +
      '<div class="form-error" id="pfErr"></div>' +
      '<button class="btn primary" id="pfSave">Save changes</button>' +
    '</div>' +
    '<div class="settings-block">' +
      '<h3>Status</h3>' +
      '<p class="muted fs-13 mb-3">Shown next to your name across RedGet.</p>' +
      '<div class="form-row">' +
        '<div class="form-group" style="max-width:90px"><label for="stEmoji">Emoji</label><input type="text" id="stEmoji" class="input" maxlength="4" value="' + esc(status.emoji || '') + '" placeholder="🚀"></div>' +
        '<div class="form-group"><label for="stMessage">Message</label><input type="text" id="stMessage" class="input" maxlength="80" value="' + esc(status.message || '') + '" placeholder="Shipping"></div>' +
      '</div>' +
      '<label class="form-check"><input type="checkbox" id="stBusy"' + (status.busy ? ' checked' : '') + '><span>Busy — dim notifications and show a do-not-disturb badge</span></label>' +
      '<button class="btn primary mt-3" id="statusSave">Save status</button>' +
    '</div>';
}

/* ---------------------------------------------------------------- account */

function accountSection() {
  return '<div class="settings-block"><h3>Account key</h3>' +
      '<p>RedGet has no passwords. This 15-character key is the only way to sign in — anyone who has it can access your account.</p>' +
      '<div class="key-display"><div style="flex:1;min-width:0"><div class="muted fs-12 mb-1">Current key</div><div class="key-value">' + fmtKey(ME.key) + '</div></div>' +
      '<button class="btn sm" id="copyKeyBtn">' + ic('copy', 14) + ' Copy</button></div>' +
      '<div class="btn-row mt-3">' +
        '<button class="btn sm" id="showKeyBtn">' + ic('eye', 14) + ' Reveal key</button>' +
        '<button class="btn sm" id="rotateKeyBtn">' + ic('sync', 14) + ' Generate new key</button>' +
      '</div>' +
      '<div class="hint mt-2">Rotating invalidates the old key immediately. Save the new one before closing the dialog.</div>' +
    '</div>' +
    '<div class="settings-block"><h3>Session</h3>' +
      '<p>Signed in as <b class="bright">@' + esc(ME.username) + '</b> · member since ' + formatDate(ME.joined) + ' · ' + (ME.forges || []).length + ' forges.</p>' +
      '<div class="btn-row">' +
        '<button class="btn sm" id="signOutBtn">' + ic('signOut', 14) + ' Sign out</button>' +
        '<button class="btn sm" id="switchAccountBtn">Sign in with a different key</button>' +
      '</div>' +
    '</div>' +
    '<div class="settings-block"><h3>Data</h3>' +
      '<p>Everything lives in this browser under <code>' + esc(DB_KEY) + '</code>. Export a copy as JSON, or wipe the database and start over.</p>' +
      '<div class="btn-row">' +
        '<button class="btn sm" id="exportDataBtn">' + ic('download', 14) + ' Export data</button>' +
        '<button class="btn sm" id="resetDataBtn">' + ic('trash', 14) + ' Reset all data</button>' +
      '</div>' +
    '</div>';
}

/* ------------------------------------------------------------- appearance */

function appearanceSection() {
  var cur = getTheme();
  var prefs = ME.prefs || (ME.prefs = {});
  return '<div class="settings-block"><h3>Theme</h3><p class="muted fs-13 mb-3">Applies immediately and is remembered in this browser.</p>' +
      '<div class="theme-grid">' +
        themeCard('dark', 'Dark', '#0d1117', '#161b22', cur) +
        themeCard('light', 'Light', '#ffffff', '#f6f8fa', cur) +
        themeCard('hc', 'High contrast', '#000000', '#0a0c10', cur) +
      '</div>' +
    '</div>' +
    '<div class="settings-block"><h3>Reading preferences</h3>' +
      '<div class="form-group"><label for="prefDiff">Diff view</label>' +
        '<select id="prefDiff" class="input">' +
          ['unified', 'split'].map(function (v) {
            return '<option value="' + v + '"' + ((prefs.diffView || 'unified') === v ? ' selected' : '') + '>' + (v === 'unified' ? 'Unified' : 'Split') + '</option>';
          }).join('') +
        '</select><div class="hint">How changed files are rendered in pull requests.</div></div>' +
      '<label class="form-check"><input type="checkbox" id="prefWrap"' + (prefs.wrapCode ? ' checked' : '') + '><span>Wrap long lines in code views</span></label>' +
      '<label class="form-check"><input type="checkbox" id="prefRelative"' + (prefs.relativeTime === false ? '' : ' checked') + '><span>Show relative times (“3 hours ago”) instead of absolute dates</span></label>' +
      '<button class="btn primary mt-3" id="prefsSave">Save preferences</button>' +
    '</div>';
}

export function themeCard(value, label, bg, surface, current) {
  var sel = current === value;
  return '<button class="theme-card' + (sel ? ' selected' : '') + '" data-theme-value="' + value + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
    '<div class="theme-swatch" style="background:' + bg + '">' +
      '<div class="theme-swatch-bar" style="background:' + surface + '"></div>' +
      '<div class="theme-swatch-col" style="background:' + surface + '"></div>' +
    '</div>' +
    '<div class="theme-card-label">' + esc(label) + '</div>' +
    (sel ? '<div class="theme-card-active">' + ic('check', 10) + ' Active</div>' : '') +
  '</button>';
}

/* ----------------------------------------------------------- forges */

function forgesSection() {
  var forges = (ME.forges || []).slice().sort(function (a, b) { return b.updated - a.updated; });
  return '<div class="settings-block"><h3>Default forge settings</h3>' +
      '<p class="muted fs-13 mb-3">Applied to forges you create from now on.</p>' +
      '<div class="form-group"><label for="forgeVis">Default visibility</label>' +
        '<select id="forgeVis" class="input">' +
          ['public', 'private'].map(function (v) {
            return '<option value="' + v + '"' + (((ME.prefs || {}).defaultVisibility || 'public') === v ? ' selected' : '') + '>' + v.charAt(0).toUpperCase() + v.slice(1) + '</option>';
          }).join('') +
        '</select><div class="hint">Private forges are only visible to you in this browser.</div></div>' +
      '<label class="form-check"><input type="checkbox" id="forgeReadme"' + (((ME.prefs || {}).defaultReadme === false) ? '' : ' checked') + '><span>Initialize new forges with a README</span></label>' +
      '<button class="btn primary mt-3" id="forgePrefsSave">Save defaults</button>' +
    '</div>' +
    '<div class="settings-block"><h3>Your forges</h3>' +
      (forges.length
        ? '<div class="settings-forge-list">' + forges.map(function (r) {
            return '<div class="settings-forge-row">' +
              '<div style="min-width:0">' +
                '<a class="bright fw-600" href="#/' + esc(ME.username) + '/' + esc(r.name) + '">' + esc(r.name) + '</a>' +
                ' <span class="label outline">' + esc(r.visibility) + '</span>' +
                '<div class="muted fs-12 truncate">' + esc(r.desc || 'No description') + ' · updated ' + timeAgo(r.updated) + '</div>' +
              '</div>' +
              '<div class="btn-row">' +
                '<button class="btn sm" data-pin-forge="' + esc(r.id) + '">' + (r.pinned ? 'Unpin' : 'Pin') + '</button>' +
                '<a class="btn sm" href="#/' + esc(ME.username) + '/' + esc(r.name) + '/settings">Manage</a>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="empty"><div class="empty-icon">' + ic('forge', 32) + '</div><h3>No forges yet</h3><p>Create one to see it listed here.</p><button class="btn primary" onclick="navigate(\'/new\')">Create forge</button></div>') +
    '</div>';
}

/* ---------------------------------------------------------- notifications */

function notificationsSection() {
  if (!ME.prefs) ME.prefs = {};
  if (!ME.prefs.notifications) ME.prefs.notifications = {};
  var prefs = ME.prefs.notifications;
  var rows = [
    ['participating', 'Participating', 'Issues, pull requests and discussions you commented on or were mentioned in'],
    ['watching', 'Watching', 'Forges you watch'],
    ['follows', 'Follows', 'Someone starts following you'],
    ['stars', 'Stars', 'Someone stars one of your forges'],
    ['releases', 'Releases', 'A release is published in a forge you watch'],
  ];
  return '<div class="settings-block"><h3>Notifications</h3>' +
      '<p class="muted fs-13 mb-3">RedGet has no email, so these control what lands in your in-app inbox.</p>' +
      rows.map(function (row) {
        var on = prefs[row[0]] === undefined ? true : prefs[row[0]];
        return '<div class="settings-pref-row">' +
          '<div><div class="fw-600">' + esc(row[1]) + '</div><div class="muted fs-12">' + esc(row[2]) + '</div></div>' +
          '<label class="switch"><input type="checkbox" data-notif-pref="' + row[0] + '"' + (on ? ' checked' : '') + '><span class="switch-track"><span class="switch-thumb"></span></span><span class="sr-only">' + esc(row[1]) + '</span></label>' +
        '</div>';
      }).join('') +
    '</div>' +
    '<div class="settings-block"><h3>Inbox</h3>' +
      '<div class="btn-row"><a class="btn sm" href="#/notifications">' + ic('bell', 14) + ' Open notifications</a></div>' +
    '</div>';
}

/* ------------------------------------------------------------- ssh + gpg */

function keysSection() {
  var keys = (DB_SSH()[ME.username] || []);
  var gpg = ME.gpgKeys || (ME.gpgKeys = []);
  return '<div class="settings-block"><h3>SSH keys</h3>' +
      '<p class="muted fs-13 mb-3">SSH keys let you push over <code>ssh://</code> without typing your account key.</p>' +
      (keys.length
        ? '<div class="key-list">' + keys.map(function (k) {
            return '<div class="key-row">' +
              '<div class="key-icon">' + ic(k.kind === 'signing' ? 'pencil' : 'key', 18) + '</div>' +
              '<div style="flex:1;min-width:0">' +
                '<div class="fw-600 bright truncate">' + esc(k.title) + '</div>' +
                '<div class="muted fs-12 mono truncate">' + esc(k.fingerprint) + '</div>' +
                '<div class="muted fs-12">' + esc(k.type) + (k.kind === 'signing' ? ' · Signing key' : ' · Authentication key') + ' · added ' + timeAgo(k.added) + '</div>' +
              '</div>' +
              '<div class="btn-row">' +
                '<button class="btn sm" data-copy-ssh="' + esc(k.id) + '">' + ic('copy', 14) + '</button>' +
                '<button class="btn sm danger" data-delete-ssh="' + esc(k.id) + '">' + ic('trash', 14) + '</button>' +
              '</div>' +
            '</div>';
          }).join('') + '</div>'
        : '<p class="muted fs-13">There are no SSH keys associated with your account.</p>') +
      '<button class="btn primary mt-3" id="newSshKeyBtn">' + ic('plus', 14) + ' New SSH key</button>' +
    '</div>' +
    '<div class="settings-block"><h3>GPG keys</h3>' +
      '<p class="muted fs-13 mb-3">GPG keys sign your commits so they show as verified.</p>' +
      (gpg.length
        ? '<div class="key-list">' + gpg.map(function (k) {
            return '<div class="key-row"><div class="key-icon">' + ic('shieldCheck', 18) + '</div>' +
              '<div style="flex:1;min-width:0"><div class="fw-600 bright truncate">' + esc(k.title) + '</div>' +
              '<div class="muted fs-12 mono truncate">' + esc(k.fingerprint) + '</div></div>' +
              '<button class="btn sm danger" data-delete-gpg="' + esc(k.id) + '">' + ic('trash', 14) + '</button></div>';
          }).join('') + '</div>'
        : '<p class="muted fs-13">No GPG keys yet.</p>') +
      '<button class="btn mt-3" id="newGpgKeyBtn">' + ic('plus', 14) + ' New GPG key</button>' +
    '</div>' +
    '<div class="settings-block"><h3>Generate a key pair</h3>' +
      '<pre class="code-block"><code>ssh-keygen -t ed25519 -C "' + esc(ME.username) + '@redget"\ncat ~/.ssh/id_ed25519.pub   # paste the output above</code></pre>' +
    '</div>';
}

function DB_SSH() {
  if (!DB.sshKeys) DB.sshKeys = {};
  return DB.sshKeys;
}

/* --------------------------------------------------------------- sessions */

function sessionsSection() {
  var sessions = sessionsFor(ME.username);
  return '<div class="settings-block"><h3>Active sessions</h3>' +
      '<p class="muted fs-13 mb-3">Sessions are created when a key is used to sign in on this device.</p>' +
      (sessions.length
        ? '<div class="key-list">' + sessions.map(function (s, i) {
            return '<div class="key-row">' +
              '<div class="key-icon">' + ic(i === 0 ? 'deviceDesktop' : 'clock', 18) + '</div>' +
              '<div style="flex:1;min-width:0">' +
                '<div class="fw-600 bright">' + (i === 0 ? 'Current session' : 'Session') + '</div>' +
                '<div class="muted fs-12 truncate">' + esc(describeAgent(s.agent)) + '</div>' +
                '<div class="muted fs-12">Signed in ' + timeAgo(s.at) + ' · last active ' + timeAgo(s.lastSeen) + '</div>' +
              '</div>' +
              (i === 0 ? '<span class="label green">Active</span>' : '<button class="btn sm danger" data-revoke-session="' + esc(s.id) + '">Revoke</button>') +
            '</div>';
          }).join('') + '</div>'
        : '<p class="muted fs-13">No sessions recorded.</p>') +
    '</div>';
}

function describeAgent(agent) {
  var a = String(agent || '');
  if (!a) return 'This browser';
  var browser = /Firefox\//.test(a) ? 'Firefox'
    : /Edg\//.test(a) ? 'Edge'
      : /Chrome\//.test(a) ? 'Chrome'
        : /Safari\//.test(a) ? 'Safari' : 'Browser';
  var os = /Windows/.test(a) ? 'Windows' : /Mac OS X/.test(a) ? 'macOS' : /Android/.test(a) ? 'Android'
    : /(iPhone|iPad)/.test(a) ? 'iOS' : /Linux/.test(a) ? 'Linux' : 'Unknown OS';
  return browser + ' on ' + os;
}

/* ----------------------------------------------------------------- danger */

function dangerSection() {
  return '<div class="danger-zone"><h3>Sign out everywhere</h3>' +
      '<p>Clears the stored session key in this browser. Your data stays.</p>' +
      '<button class="btn" id="signOutAllBtn">' + ic('signOut', 14) + ' Sign out</button>' +
    '</div>' +
    '<div class="danger-zone"><h3>Export your data</h3>' +
      '<p>Download every account, forge, file, issue and pull request as a single JSON file.</p>' +
      '<button class="btn" id="exportDataBtn2">' + ic('download', 14) + ' Export JSON</button>' +
    '</div>' +
    '<div class="danger-zone"><h3>Delete account</h3>' +
      '<p>Permanently removes your profile, all forges, files and activity history. This action cannot be undone.</p>' +
      '<button class="btn danger" id="deleteAccountBtn">Delete my account</button>' +
    '</div>' +
    '<div class="danger-zone"><h3>Reset RedGet</h3>' +
      '<p>Wipes the entire local database — every account, organization and forge in this browser.</p>' +
      '<button class="btn danger" id="resetDataBtn2">Reset everything</button>' +
    '</div>';
}

/* -------------------------------------------------------------------- data */

function dataSection() {
  var forgeCount = Object.keys(DB.users || {}).reduce(function (total, key) {
    return total + ((DB.users[key] || {}).forges || []).length;
  }, 0) + Object.keys(DB.orgs || {}).reduce(function (total, slug) {
    return total + ((DB.orgs[slug] || {}).forges || []).length;
  }, 0);
  var loaded = demoLoaded();

  return '<div class="settings-block"><h3>This browser</h3>' +
      '<p>RedGet has no server. Every account, forge, file, issue, pull request, project, wiki page and workflow run lives in <code>' + esc(DB_KEY) + '</code> on this machine, and nowhere else.</p>' +
      '<div class="permission-list">' +
        '<div><span>Accounts</span><b>' + Object.keys(DB.users || {}).length + '</b></div>' +
        '<div><span>Organizations</span><b>' + Object.keys(DB.orgs || {}).length + '</b></div>' +
        '<div><span>Forges</span><b>' + forgeCount + '</b></div>' +
        '<div><span>Projects</span><b>' + ((DB.projects || []).length) + '</b></div>' +
        '<div><span>Gists</span><b>' + ((DB.gists || []).length) + '</b></div>' +
        '<div><span>Codespaces</span><b>' + ((DB.codespaces || []).length) + '</b></div>' +
      '</div>' +
    '</div>' +

    '<div class="settings-block"><h3>Demo workspace</h3>' +
      '<p>RedGet starts completely empty — nothing is seeded. If you want something to look at, this builds a real workspace: an organization, two forges with files and commits, a CI workflow that actually runs, issues, a pull request with a review, a project board, wiki pages, a release, a gist, a codespace and a second local account so other people exist.</p>' +
      '<p class="muted fs-13">It is created through the same code paths the UI uses, so every commit, run and notification is genuinely derived. ' + (loaded ? 'A demo workspace is already loaded — running it again reuses what is there.' : 'Remove it any time with “Reset all data”.') + '</p>' +
      '<div class="btn-row">' +
        '<button class="btn primary sm" id="loadDemoBtn">' + ic('sparkle', 14) + ' ' + (loaded ? 'Top up the demo workspace' : 'Load a demo workspace') + '</button>' +
      '</div>' +
    '</div>' +

    '<div class="settings-block"><h3>Export</h3>' +
      '<p>Download the whole database as one JSON file. Keep it somewhere safe: it is the only backup that exists.</p>' +
      '<div class="btn-row">' +
        '<button class="btn sm" id="exportDataBtn">' + ic('download', 14) + ' Export data as JSON</button>' +
      '</div>' +
    '</div>' +

    '<div class="settings-block"><h3>Reset</h3>' +
      '<p>Deletes every account and all data in this browser, then returns to an empty RedGet. There is no undo.</p>' +
      '<div class="btn-row">' +
        '<button class="btn danger sm" id="resetDataBtn">' + ic('trash', 14) + ' Reset all data</button>' +
      '</div>' +
    '</div>';
}

/* ------------------------------------------------------------------ modal */

export function openSshKeyModal(kind) {
  openModal('<div class="modal">' +
    '<div class="modal-head"><div><h2>' + (kind === 'signing' ? 'New GPG key' : 'New SSH key') + '</h2>' +
      '<p class="sub">Paste a <b>public</b> key. Private keys never leave your machine.</p></div>' +
    '<button class="modal-close" onclick="closeModal()" aria-label="Close">' + ic('x', 16) + '</button></div>' +
    '<div class="modal-body">' +
      '<div class="form-group"><label for="skTitle">Title</label><input type="text" id="skTitle" class="input" placeholder="Work laptop" maxlength="60"></div>' +
      '<div class="form-group"><label for="skType">Key type</label>' +
        '<select id="skType" class="input">' +
          (kind === 'signing'
            ? '<option value="gpg">GPG</option>'
            : '<option value="authentication">Authentication</option><option value="signing">Signing</option>') +
        '</select></div>' +
      '<div class="form-group"><label for="skKey">Key</label>' +
        '<textarea id="skKey" class="input mono" rows="5" placeholder="ssh-ed25519 AAAAC3Nza…"></textarea>' +
        '<div class="hint" id="skFp">A fingerprint is computed as you type.</div></div>' +
      '<div class="form-error" id="skErr"></div>' +
    '</div>' +
    '<div class="modal-foot"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" id="skGo">Add key</button></div>' +
  '</div>');

  var keyInput = document.getElementById('skKey');
  var fp = document.getElementById('skFp');
  keyInput.addEventListener('input', function () {
    var parsed = parseSshKey(keyInput.value, kind === 'signing' ? 'gpg' : '');
    fp.textContent = parsed ? 'Fingerprint: ' + parsed.fingerprint : 'A fingerprint is computed as you type.';
  });

  document.getElementById('skGo').addEventListener('click', function () {
    var title = document.getElementById('skTitle').value.trim();
    var type = document.getElementById('skType').value;
    var raw = keyInput.value.trim();
    var err = document.getElementById('skErr');
    if (!title) { err.textContent = 'Give the key a title so you can recognise it later.'; return; }
    if (!raw) { err.textContent = 'Paste the public key.'; return; }
    var parsed = parseSshKey(raw, type);
    if (!parsed) { err.textContent = 'That does not look like a public key. Expected "ssh-ed25519 AAAA…", "ssh-rsa AAAA…" or a PGP block.'; return; }
    addKey(kind === 'signing' ? 'gpg' : 'ssh', { title: title, type: parsed.type, key: parsed.key, fingerprint: parsed.fingerprint, keyKind: parsed.kind });
  });
}

export function addKey(store, payload) {
  var record = {
    id: 'key_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: payload.title,
    type: payload.type,
    key: payload.key,
    fingerprint: payload.fingerprint || fingerprintKey(payload.key),
    kind: payload.keyKind || 'authentication',
    added: Date.now(),
    lastUsed: null,
  };
  if (store === 'gpg') {
    if (!ME.gpgKeys) ME.gpgKeys = [];
    ME.gpgKeys.unshift(record);
  } else {
    if (!DB.sshKeys[ME.username]) DB.sshKeys[ME.username] = [];
    DB.sshKeys[ME.username].unshift(record);
  }
  saveDB();
  return record;
}

export function deleteKey(store, id) {
  if (store === 'gpg') ME.gpgKeys = (ME.gpgKeys || []).filter(function (k) { return k.id !== id; });
  else DB_SSH()[ME.username] = (DB_SSH()[ME.username] || []).filter(function (k) { return k.id !== id; });
  saveDB();
}

export function sshKeysFor(username) {
  return (DB.sshKeys || {})[username] || [];
}
