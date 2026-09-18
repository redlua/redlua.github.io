/**
 * RedGet — marketplace.
 *
 * The catalogue is fixed and honest about what an app can do here: installing
 * writes a real record against your account with the permissions you accepted,
 * and the app page forgerts that record. Nothing phones home — there is no
 * network in RedGet.
 */

import { DB, ME, saveDB } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { visibleForges } from '../core/forges.js';
import { marketplaceApps, appById, installsFor, isInstalled, installCounts } from '../core/marketplace.js';
import { esc, timeAgo, formatDate } from '../core/util.js';

var CATEGORIES = ['All', 'Continuous integration', 'Security', 'Code review', 'Release management', 'Documentation', 'Monitoring'];

export function viewMarketplace() {
  if (!ME) return signedOut();
  var query = hashQuery();
  var category = query.category || 'All';
  var q = (query.q || '').toLowerCase();
  var apps = marketplaceApps().filter(function (app) {
    if (category !== 'All' && app.category !== category) return false;
    if (!q) return true;
    return (app.name + ' ' + app.tagline + ' ' + app.vendor).toLowerCase().indexOf(q) !== -1;
  });
  var installed = installsFor(ME.username);

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('package', 22) + ' Marketplace</h1>' +
        '<p class="muted fs-13">' + apps.length + ' app' + (apps.length === 1 ? '' : 's') +
        ' · ' + installed.length + ' installed on your account · every install is a local record</p></div>' +
      '<div class="page-head-actions">' +
        '<input type="search" class="input" id="marketSearch" placeholder="Search apps" value="' + esc(query.q || '') + '" aria-label="Search apps">' +
        '<a class="btn" href="#/settings/apps">' + ic('gear', 14) + ' Your installs</a></div>' +
    '</div>' +

    '<div class="filter-bar">' + CATEGORIES.map(function (c) {
      return '<a class="filter-chip' + (category === c ? ' on' : '') + '" href="#/marketplace' + (c === 'All' ? '' : '?category=' + encodeURIComponent(c)) + '">' + esc(c) + '</a>';
    }).join('') + '</div>' +

    (installed.length ? '<div class="card mb-4"><h3 class="card-title">Installed</h3>' +
      '<div class="card-tight">' + installed.map(function (install) {
        var app = appById(install.app);
        if (!app) return '';
        return '<div class="list-item"><div class="list-icon">' + ic(app.icon, 16) + '</div>' +
          '<div class="list-body"><div class="list-title"><a href="#/marketplace/' + esc(app.id) + '">' + esc(app.name) + '</a></div>' +
          '<div class="list-meta">installed ' + timeAgo(install.installedAt) + ' · ' + install.permissions.length + ' permission' + (install.permissions.length === 1 ? '' : 's') + '</div></div>' +
          '<div class="list-side"><button class="btn sm danger uninstallAppBtn" type="button" data-app="' + esc(app.id) + '">Uninstall</button></div></div>';
      }).join('') + '</div></div>' : '') +

    (apps.length
      ? '<div class="market-grid">' + apps.map(function (app) { return appCard(app); }).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('search', 32) + '</div><h3>No apps match</h3>' +
        '<p>Try another search term or category.</p><a class="btn" href="#/marketplace">Clear filters</a></div>') +
  '</div>';
}

function appCard(app) {
  var installed = isInstalled(app.id);
  return '<a class="market-card card" href="#/marketplace/' + esc(app.id) + '">' +
    '<div class="market-card-head">' +
      '<span class="market-icon">' + ic(app.icon, 22) + '</span>' +
      '<div><b class="bright">' + esc(app.name) + '</b>' +
        '<div class="muted fs-12">' + esc(app.vendor) + ' · ' + esc(app.category) + '</div></div>' +
      (installed ? '<span class="label green">' + ic('checkCircle', 10) + ' Installed</span>' : '') +
    '</div>' +
    '<p class="muted fs-13">' + esc(app.tagline) + '</p>' +
    '<div class="market-card-meta">' +
      '<span>' + ic('download', 12) + ' ' + app.installs + ' install' + (app.installs === 1 ? '' : 's') + ' here</span>' +
      '<span>' + ic('creditCard', 12) + ' ' + esc(app.pricing) + '</span>' +
    '</div>' +
  '</a>';
}

export function viewMarketplaceApp(id) {
  if (!ME) return signedOut();
  var app = appById(id);
  if (!app) {
    return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('package', 32) + '</div>' +
      '<h3>App not found</h3><p>No marketplace app has the id “' + esc(id) + '”.</p>' +
      '<a class="btn" href="#/marketplace">Back to the marketplace</a></div></div>';
  }
  var install = installsFor(ME.username).filter(function (i) { return i.app === app.id; })[0] || null;
  var forges = visibleForges().filter(function (e) { return e.user.username === ME.username; });

  return '<div class="container page narrow">' +
    '<div class="page-head">' +
      '<div class="market-head">' +
        '<span class="market-icon lg">' + ic(app.icon, 30) + '</span>' +
        '<div><h1 class="page-title">' + esc(app.name) + '</h1>' +
          '<p class="muted fs-13">' + esc(app.vendor) + ' · ' + esc(app.category) + ' · ' + esc(app.pricing) + '</p></div>' +
      '</div>' +
      '<div class="page-head-actions">' +
        (install
          ? '<button class="btn danger uninstallAppBtn" type="button" data-app="' + esc(app.id) + '">' + ic('trash', 14) + ' Uninstall</button>'
          : '<button class="btn primary installAppBtn" type="button" data-app="' + esc(app.id) + '">' + ic('download', 14) + ' Install</button>') +
      '</div>' +
    '</div>' +

    '<div class="card">' +
      '<p class="fs-15">' + esc(app.tagline) + '</p>' +
      '<div class="stat-grid mt-4">' +
        '<div class="stat"><div class="stat-value">' + app.installs + '</div><div class="stat-label">installs in this browser</div></div>' +
        '<div class="stat"><div class="stat-value">' + app.permissions.length + '</div><div class="stat-label">permissions requested</div></div>' +
        '<div class="stat"><div class="stat-value">' + (install ? 'Yes' : 'No') + '</div><div class="stat-label">installed by you</div></div>' +
      '</div>' +
    '</div>' +

    '<div class="card mt-4">' +
      '<h3 class="card-title">Permissions</h3>' +
      '<ul class="permission-list">' + app.permissions.map(function (p) {
        var granted = install && install.permissions.indexOf(p) !== -1;
        return '<li><span class="permission-state">' + ic(granted ? 'checkCircle' : 'circle', 14) + '</span>' +
          '<span>' + esc(p) + '</span>' + (granted ? '<span class="label green">Granted</span>' : '<span class="label">Requested</span>') + '</li>';
      }).join('') + '</ul>' +
      (install ? '<p class="muted fs-12 mt-2">Installed ' + timeAgo(install.installedAt) + ' (' + formatDate(install.installedAt) + ').</p>' : '') +
    '</div>' +

    '<div class="card mt-4">' +
      '<h3 class="card-title">What it does with your data</h3>' +
      '<ul class="doc-list">' +
        '<li>It runs entirely in this browser against the forges you own.</li>' +
        '<li>No request is made to any server — RedGet has no network access.</li>' +
        '<li>Uninstalling removes the record; forges and history are untouched.</li>' +
      '</ul>' +
      (forges.length ? '<div class="form-group mt-4"><label class="form-label" for="appForgeScope">Forge access</label>' +
        '<select class="input" id="appForgeScope">' +
          '<option value="all">All ' + forges.length + ' of your forges</option>' +
          forges.map(function (e) { return '<option value="' + esc(e.forge.id) + '">Only ' + esc(e.forge.name) + '</option>'; }).join('') +
        '</select></div>'
        : '<p class="muted fs-13 mt-4">You have no forges yet, so there is nothing for this app to act on.</p>') +
    '</div>' +

    '<div class="card mt-4">' +
      '<h3 class="card-title">Installations</h3>' +
      allInstalls(app.id) +
    '</div>' +
  '</div>';
}

function allInstalls(appId) {
  var rows = (DB.marketInstalls || []).filter(function (i) { return i.app === appId; });
  if (!rows.length) return '<p class="muted fs-13">Nobody in this browser has installed it yet.</p>';
  return rows.map(function (install) {
    var account = { username: install.owner, avatar: null };
    return '<div class="list-item"><div class="list-icon">' + avatarHTML(account, 24) + '</div>' +
      '<div class="list-body"><div class="list-title">' + esc(install.owner) + '</div>' +
      '<div class="list-meta">installed ' + timeAgo(install.installedAt) + ' · ' + install.permissions.length + ' permissions</div></div></div>';
  }).join('');
}

function signedOut() {
  return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('lock', 32) + '</div>' +
    '<h3>Sign in required</h3><p>Installing an app records it against your account.</p>' +
    '<button class="btn primary" id="openAuthBtn" type="button">' + ic('signIn', 14) + ' Sign in with your key</button></div></div>';
}

function hashQuery() {
  var out = {};
  var hash = String(location.hash || '');
  var q = hash.indexOf('?');
  if (q === -1) return out;
  hash.slice(q + 1).split('&').forEach(function (pair) {
    if (!pair) return;
    var kv = pair.split('=');
    out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
  });
  return out;
}
