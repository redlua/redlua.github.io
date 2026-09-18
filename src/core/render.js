/**
 * RedGet — route dispatch.
 *
 * `render()` rebuilds the header and the main view from the current
 * `location.hash`. Every route below resolves to a real view: there are no
 * dead links and no stub pages.
 *
 *   #/                      dashboard (landing when signed out)
 *   #/new                   new forge      #/new/import   import
 *   #/explore               explore + search    #/trending     trending
 *   #/issues  #/pulls       your global lists
 *   #/notifications         inbox
 *   #/projects  #/projects/new  #/projects/:id
 *   #/gists  #/gists/new  #/gists/:id
 *   #/codespaces  #/codespaces/new
 *   #/marketplace  #/marketplace/:app
 *   #/organizations  #/organizations/new  #/orgs/:slug  #/orgs/:slug/:tab
 *   #/enterprises  #/copilot  #/docs
 *   #/settings/:section     account settings
 *   #/:username             profile (?tab=overview|forges|projects|packages|stars)
 *   #/:owner/:forge/:sub     forge views (see views/forge.js)
 */

import { ME } from '../state.js';
import { $ } from './dom.js';
import { parseRoute, navigate } from './router.js';
import { renderHeader } from './header.js';
import { bindAfterRender } from './bind.js';
import { findForge } from './forges.js';
import { getUserByUsername } from './social.js';

import { viewLanding } from '../views/landing.js';
import { viewDashboard } from '../views/dashboard.js';
import { viewProfile } from '../views/profile.js';
import { viewForge } from '../views/forge.js';
import { viewNewForge } from '../views/newForge.js';
import { viewExplore, viewTrending } from '../views/explore.js';
import {
  viewGlobalIssues, viewGlobalPulls, viewNotifications, viewOrganizations, viewNewOrganization,
  viewEnterprises, viewNotFound, viewOrgDetail, viewCopilot,
} from '../views/global.js';
import { viewUserSettings } from '../views/settings.js';
import { viewProjects, viewProjectDetail, viewNewProject } from '../views/projects.js';
import { viewGists, viewGistDetail, viewNewGist } from '../views/gists.js';
import { viewCodespaces, viewNewCodespace, viewCodespaceDetail } from '../views/codespaces.js';
import { viewMarketplace, viewMarketplaceApp } from '../views/marketplace.js';
import { viewDocs } from '../views/docs.js';

/** Routes that are reserved words, never a username. */
var RESERVED = {
  dashboard: 1, new: 1, explore: 1, trending: 1, issues: 1, pulls: 1, notifications: 1,
  projects: 1, gists: 1, gist: 1, codespaces: 1, marketplace: 1, organizations: 1,
  orgs: 1, enterprises: 1, settings: 1, copilot: 1, docs: 1, packages: 1, discussions: 1,
};

export function render() {
  renderHeader();
  var app = $('#app');
  if (!app) return;
  var route = parseRoute();

  if (!ME) {
    app.innerHTML = viewLanding();
    bindAfterRender(route);
    return;
  }


  var parts = route.parts;
  var head = parts[0] || 'dashboard';

  if (!head || head === 'dashboard') app.innerHTML = viewDashboard();
  else if (head === 'new') app.innerHTML = viewNewForge(parts[1] || 'create');
  else if (head === 'explore') app.innerHTML = viewExplore(parts.slice(1));
  else if (head === 'trending') app.innerHTML = viewTrending(parts.slice(1));
  else if (head === 'settings') app.innerHTML = viewUserSettings(parts[1] || 'profile');
  else if (head === 'issues') app.innerHTML = viewGlobalIssues(parts.slice(1));
  else if (head === 'pulls') app.innerHTML = viewGlobalPulls(parts.slice(1));
  else if (head === 'notifications') app.innerHTML = viewNotifications(parts.slice(1));
  else if (head === 'organizations') app.innerHTML = parts[1] === 'new' ? viewNewOrganization() : viewOrganizations();
  else if (head === 'orgs') app.innerHTML = parts[1] ? viewOrgDetail(parts[1], parts[2] || 'overview') : viewOrganizations();
  else if (head === 'enterprises') app.innerHTML = viewEnterprises();
  else if (head === 'projects') app.innerHTML = parts[1] === 'new' ? viewNewProject() : (parts[1] ? viewProjectDetail(parts[1], parts.slice(2)) : viewProjects());
  else if (head === 'gists' || head === 'gist') app.innerHTML = parts[1] === 'new' ? viewNewGist() : (parts[1] ? viewGistDetail(parts[1]) : viewGists());
  else if (head === 'codespaces') {
    app.innerHTML = parts[1] === 'new' ? viewNewCodespace()
      : parts[1] ? viewCodespaceDetail(parts[1])
      : viewCodespaces();
  }
  else if (head === 'marketplace') app.innerHTML = parts[1] ? viewMarketplaceApp(parts[1]) : viewMarketplace();
  else if (head === 'copilot') app.innerHTML = viewCopilot();
  else if (head === 'docs') app.innerHTML = viewDocs(parts.slice(1));
  else if (RESERVED[head]) app.innerHTML = viewNotFound('/' + parts.join('/'));
  else if (parts.length === 1) {
    var u = getUserByUsername(head);
    app.innerHTML = u ? viewProfile(u) : viewNotFound('/' + head);
  } else {
    var found = findForge(parts[0], parts[1]);
    if (!found) app.innerHTML = viewNotFound('/' + parts.join('/'));
    else app.innerHTML = viewForge(found.user, found.forge, parts[2] || 'code', parts.slice(3));
  }

  bindAfterRender(route);
  window.scrollTo(0, 0);
}

export { RESERVED, parseRoute, navigate };
