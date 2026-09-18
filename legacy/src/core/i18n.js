/**
 * RedGet — localization (i18n).
 *
 * String-table driven. Missing keys fall back to English, then to the key itself, so a
 * partially translated locale never renders blank UI. Date/number formatting follows the
 * active locale and the user's chosen time zone.
 */

import { LOCALES } from '../config.js';
import { emit, EVENTS } from './bus.js';

const tables = {
  en: {
    'app.name': 'RedGet',
    'nav.dashboard': 'Dashboard',
    'nav.pullRequests': 'Pull requests',
    'nav.issues': 'Issues',
    'nav.codespaces': 'Codespaces',
    'nav.explore': 'Explore',
    'nav.marketplace': 'Marketplace',
    'nav.sponsors': 'Sponsors',
    'nav.notifications': 'Notifications',
    'nav.settings': 'Settings',
    'nav.signOut': 'Sign out',
    'nav.signIn': 'Sign in',
    'nav.signUp': 'Sign up',
    'search.placeholder': 'Search or jump to…',
    'search.title': 'Search RedGet',
    'search.hint': 'Type / to focus, Ctrl+K for the command palette',
    'create.new': 'Create new…',
    'create.repo': 'New repository',
    'create.import': 'Import repository',
    'create.codespace': 'New codespace',
    'create.gist': 'New gist',
    'create.org': 'New organization',
    'create.project': 'New project',
    'create.team': 'New team',
    'create.issue': 'New issue',
    'create.pull': 'New pull request',
    'create.release': 'New release',
    'create.tag': 'New tag',
    'create.branch': 'New branch',
    'create.workflow': 'New workflow',
    'create.secret': 'New secret',
    'create.variable': 'New variable',
    'create.environment': 'New environment',
    'create.runner': 'New runner',
    'create.webhook': 'New webhook',
    'create.deployKey': 'New deploy key',
    'create.sshKey': 'New SSH key',
    'create.gpgKey': 'New GPG key',
    'create.pat': 'New personal access token',
    'create.oauthApp': 'New OAuth app',
    'create.app': 'New RedGet App',
    'create.package': 'New package',
    'create.discussion': 'New discussion',
    'create.wikiPage': 'New wiki page',
    'create.board': 'New project board',
    'create.milestone': 'New milestone',
    'create.label': 'New label',
    'create.issueTemplate': 'New issue template',
    'create.prTemplate': 'New pull request template',
    'create.codeowners': 'New CODEOWNERS',
    'create.funding': 'New FUNDING',
    'create.citation': 'New CITATION',
    'create.license': 'New LICENSE',
    'create.security': 'New SECURITY',
    'create.contributing': 'New CONTRIBUTING',
    'create.codeOfConduct': 'New CODE_OF_CONDUCT',
    'create.readme': 'New README',
    'create.gitignore': 'New .gitignore',
    'profile.status': 'Set status',
    'profile.yourProfile': 'Your profile',
    'profile.yourRepositories': 'Your repositories',
    'profile.yourCodespaces': 'Your codespaces',
    'profile.yourProjects': 'Your projects',
    'profile.yourStars': 'Your stars',
    'profile.yourGists': 'Your gists',
    'profile.yourSponsors': 'Your sponsors',
    'profile.organizations': 'Your organizations',
    'profile.enterprises': 'Your enterprises',
    'profile.tryEnterprise': 'Try Enterprise',
    'profile.featurePreview': 'Feature preview',
    'profile.help': 'RedGet Docs',
    'profile.shortcuts': 'Keyboard shortcuts',
    'profile.commandPalette': 'Command palette',
    'theme.switcher': 'Theme',
    'theme.followSystem': 'Follow system',
    'repo.code': 'Code',
    'repo.issues': 'Issues',
    'repo.pulls': 'Pull requests',
    'repo.actions': 'Actions',
    'repo.projects': 'Projects',
    'repo.wiki': 'Wiki',
    'repo.security': 'Security',
    'repo.insights': 'Insights',
    'repo.settings': 'Settings',
    'repo.discussions': 'Discussions',
    'repo.releases': 'Releases',
    'repo.packages': 'Packages',
    'repo.deployments': 'Deployments',
    'repo.watch': 'Watch',
    'repo.unwatch': 'Unwatch',
    'repo.ignoring': 'Ignoring',
    'repo.fork': 'Fork',
    'repo.star': 'Star',
    'repo.starred': 'Starred',
    'repo.unstar': 'Unstar',
    'repo.public': 'Public',
    'repo.private': 'Private',
    'repo.internal': 'Internal',
    'repo.branch': 'branch',
    'repo.branches': 'branches',
    'repo.tag': 'tag',
    'repo.tags': 'tags',
    'repo.goToFile': 'Go to file',
    'repo.addFile': 'Add file',
    'repo.codeButton': 'Code',
    'repo.clone': 'Clone',
    'repo.download': 'Download ZIP',
    'repo.openWith': 'Open with',
    'repo.latestCommit': 'Latest commit',
    'repo.commits': 'Commits',
    'repo.history': 'History',
    'repo.blame': 'Blame',
    'repo.raw': 'Raw',
    'repo.copy': 'Copy',
    'repo.copied': 'Copied!',
    'repo.copyPath': 'Copy path',
    'repo.copyRaw': 'Copy raw file',
    'repo.editFile': 'Edit file',
    'repo.deleteFile': 'Delete file',
    'repo.uploadFiles': 'Upload files',
    'repo.createFile': 'Create new file',
    'repo.name': 'Name',
    'repo.lastCommitMessage': 'Last commit message',
    'repo.lastCommitTime': 'Last commit time',
    'issues.open': 'Open',
    'issues.closed': 'Closed',
    'issues.new': 'New issue',
    'issues.filters': 'Filters',
    'issues.author': 'Author',
    'issues.label': 'Label',
    'issues.milestone': 'Milestone',
    'issues.assignee': 'Assignee',
    'issues.project': 'Projects',
    'issues.sort': 'Sort',
    'issues.search': 'Search all issues',
    'issues.comments': 'comments',
    'issues.close': 'Close issue',
    'issues.reopen': 'Reopen issue',
    'issues.lock': 'Lock conversation',
    'issues.unlock': 'Unlock conversation',
    'issues.pin': 'Pin issue',
    'issues.unpin': 'Unpin issue',
    'issues.transfer': 'Transfer issue',
    'issues.delete': 'Delete issue',
    'issues.assignees': 'Assignees',
    'issues.labels': 'Labels',
    'issues.milestones': 'Milestones',
    'issues.development': 'Development',
    'issues.participants': 'Participants',
    'issues.none': 'No description provided',
    'issues.empty': 'No results matched your search.',
    'issues.writeComment': 'Write a comment…',
    'pulls.open': 'Open',
    'pulls.closed': 'Closed',
    'pulls.merged': 'Merged',
    'pulls.draft': 'Draft',
    'pulls.new': 'New pull request',
    'pulls.conversation': 'Conversation',
    'pulls.commits': 'Commits',
    'pulls.checks': 'Checks',
    'pulls.files': 'Files changed',
    'pulls.merge': 'Merge pull request',
    'pulls.rebase': 'Rebase and merge',
    'pulls.squash': 'Squash and merge',
    'pulls.close': 'Close pull request',
    'pulls.reopen': 'Reopen pull request',
    'pulls.readyForReview': 'Ready for review',
    'pulls.markDraft': 'Convert to draft',
    'pulls.autoMerge': 'Enable auto-merge',
    'pulls.deleteBranch': 'Delete branch',
    'pulls.restoreBranch': 'Restore branch',
    'pulls.reviewers': 'Reviewers',
    'pulls.approve': 'Approve',
    'pulls.requestChanges': 'Request changes',
    'pulls.comment': 'Comment',
    'pulls.submitReview': 'Submit review',
    'pulls.mergeQueue': 'Add to merge queue',
    'pulls.checks': 'Checks',
    'pulls.allChecksPassed': 'All checks have passed',
    'pulls.someChecksFailed': 'Some checks were not successful',
    'pulls.checksPending': 'Some checks haven’t completed yet',
    'actions.title': 'Actions',
    'actions.runs': 'All workflows',
    'actions.caches': 'Caches',
    'actions.secrets': 'Secrets and variables',
    'actions.runners': 'Runners',
    'actions.environments': 'Environments',
    'actions.artifacts': 'Artifacts',
    'actions.rerun': 'Re-run jobs',
    'actions.rerunAll': 'Re-run all jobs',
    'actions.rerunFailed': 'Re-run failed jobs',
    'actions.cancel': 'Cancel workflow',
    'actions.viewLogs': 'View raw logs',
    'actions.downloadLogs': 'Download log archive',
    'actions.newWorkflow': 'New workflow',
    'actions.noRuns': 'There aren’t any workflow runs yet.',
    'projects.title': 'Projects',
    'projects.board': 'Board',
    'projects.table': 'Table',
    'projects.roadmap': 'Roadmap',
    'projects.newProject': 'New project',
    'projects.addField': 'Add field',
    'projects.addView': 'Add view',
    'projects.groupBy': 'Group by',
    'projects.sortBy': 'Sort by',
    'projects.filter': 'Filter',
    'wiki.title': 'Wiki',
    'wiki.pages': 'Pages',
    'wiki.newPage': 'New page',
    'wiki.edit': 'Edit',
    'wiki.history': 'History',
    'wiki.clone': 'Clone repository',
    'security.title': 'Security',
    'security.overview': 'Overview',
    'security.advisories': 'Security advisories',
    'security.dependabot': 'Dependabot',
    'security.codeScanning': 'Code scanning',
    'security.secretScanning': 'Secret scanning',
    'security.policy': 'Security policy',
    'insights.title': 'Insights',
    'insights.pulse': 'Pulse',
    'insights.contributors': 'Contributors',
    'insights.community': 'Community Standards',
    'insights.traffic': 'Traffic',
    'insights.commits': 'Commits',
    'insights.codeFrequency': 'Code frequency',
    'insights.dependencyGraph': 'Dependency graph',
    'insights.network': 'Network',
    'insights.forks': 'Forks',
    'settings.title': 'Settings',
    'settings.general': 'General',
    'settings.access': 'Access',
    'settings.codeAndAutomation': 'Code and automation',
    'settings.security': 'Security',
    'settings.integrations': 'Integrations',
    'settings.dangerZone': 'Danger Zone',
    'common.save': 'Save changes',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.loading': 'Loading…',
    'common.loaded': 'Loaded',
    'common.retry': 'Try again',
    'common.empty': 'Nothing here yet.',
    'common.optional': 'optional',
    'common.required': 'required',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.all': 'All',
    'common.none': 'None',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.previous': 'Previous',
    'common.page': 'Page',
    'common.of': 'of',
    'common.showing': 'Showing',
    'common.results': 'results',
    'common.updated': 'Updated',
    'common.created': 'Created',
    'common.comment': 'Comment',
    'common.comments': 'Comments',
    'common.reactions': 'Reactions',
    'common.mentioned': 'Mentioned you',
    'common.assignToMe': 'Assign to me',
    'common.subscribe': 'Subscribe',
    'common.unsubscribe': 'Unsubscribe',
    'common.markRead': 'Mark as read',
    'common.markUnread': 'Mark as unread',
    'common.archive': 'Archive',
    'common.restore': 'Restore',
    'common.dismiss': 'Dismiss',
    'common.copy': 'Copy',
    'common.copied': 'Copied!',
    'common.permalink': 'Copy permalink',
    'common.share': 'Share',
    'common.report': 'Report',
    'common.block': 'Block',
    'common.mute': 'Mute',
    'common.quote': 'Quote reply',
    'common.resolve': 'Resolve conversation',
    'common.unresolve': 'Unresolve conversation',
    'common.viewed': 'Viewed',
    'common.expand': 'Expand',
    'common.collapse': 'Collapse',
    'common.more': 'More',
    'common.details': 'Details',
    'common.summary': 'Summary',
    'common.documentation': 'Documentation',
    'common.learnMore': 'Learn more',
    'common.skipToContent': 'Skip to content',
    'common.toggleNavigation': 'Toggle navigation',
    'common.closeMenu': 'Close menu',
    'a11y.mainNavigation': 'Global',
    'a11y.repoNavigation': 'Repository',
    'a11y.breadcrumb': 'Breadcrumb',
    'a11y.pagination': 'Pagination',
    'a11y.tabs': 'Tabs',
    'a11y.dialog': 'Dialog',
    'a11y.listbox': 'Options',
    'a11y.menu': 'Menu',
    'a11y.status': 'Status',
    'a11y.tooltip': 'Tooltip',
    'a11y.loading': 'Loading content',
    'profile.followers': 'followers',
    'profile.following': 'following',
    'profile.follow': 'Follow',
    'profile.unfollow': 'Unfollow',
    'profile.pinned': 'Pinned',
    'profile.contributions': 'contributions',
    'profile.repositories': 'Repositories',
    'profile.projects': 'Projects',
    'profile.packages': 'Packages',
    'profile.stars': 'Stars',
    'profile.sponsoring': 'Sponsoring',
    'profile.activity': 'Activity',
    'profile.achievements': 'Achievements',
    'profile.organizations': 'Organizations',
    'org.people': 'People',
    'org.teams': 'Teams',
    'org.repositories': 'Repositories',
    'org.projects': 'Projects',
    'org.packages': 'Packages',
    'org.settings': 'Settings',
    'org.billing': 'Billing',
    'error.404.title': 'This is not the web page you are looking for',
    'error.404.body': 'The page you tried to reach does not exist on RedGet.',
    'error.500.title': 'Something went really wrong',
    'error.500.body': 'An unexpected error occurred while rendering this page.',
    'error.rateLimit.title': 'You have exceeded a secondary rate limit',
    'error.rateLimit.body': 'Please wait a few minutes before you try again.',
  },
  es: {
    'nav.dashboard': 'Panel',
    'nav.pullRequests': 'Solicitudes de cambios',
    'nav.issues': 'Incidencias',
    'nav.codespaces': 'Codespaces',
    'nav.explore': 'Explorar',
    'nav.marketplace': 'Marketplace',
    'nav.notifications': 'Notificaciones',
    'nav.settings': 'Configuración',
    'nav.signOut': 'Cerrar sesión',
    'search.placeholder': 'Buscar o saltar a…',
    'repo.code': 'Código',
    'repo.issues': 'Incidencias',
    'repo.pulls': 'Solicitudes de cambios',
    'repo.actions': 'Acciones',
    'repo.projects': 'Proyectos',
    'repo.wiki': 'Wiki',
    'repo.security': 'Seguridad',
    'repo.insights': 'Estadísticas',
    'repo.settings': 'Configuración',
    'repo.watch': 'Seguir',
    'repo.unwatch': 'Dejar de seguir',
    'repo.fork': 'Bifurcar',
    'repo.star': 'Estrella',
    'repo.starred': 'Con estrella',
    'common.save': 'Guardar cambios',
    'common.cancel': 'Cancelar',
    'common.close': 'Cerrar',
    'common.loading': 'Cargando…',
    'common.empty': 'Todavía no hay nada aquí.',
    'profile.followers': 'seguidores',
    'profile.following': 'siguiendo',
    'profile.follow': 'Seguir',
    'error.404.title': 'Esta no es la página que buscas',
  },
  fr: {
    'nav.dashboard': 'Tableau de bord',
    'nav.pullRequests': 'Demandes de tirage',
    'nav.issues': 'Tickets',
    'nav.explore': 'Explorer',
    'nav.notifications': 'Notifications',
    'nav.settings': 'Paramètres',
    'nav.signOut': 'Se déconnecter',
    'search.placeholder': 'Rechercher ou aller à…',
    'repo.code': 'Code',
    'repo.issues': 'Tickets',
    'repo.pulls': 'Demandes de tirage',
    'repo.actions': 'Actions',
    'repo.projects': 'Projets',
    'repo.wiki': 'Wiki',
    'repo.security': 'Sécurité',
    'repo.insights': 'Statistiques',
    'repo.settings': 'Paramètres',
    'repo.watch': 'Suivre',
    'repo.star': 'Étoile',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.loading': 'Chargement…',
    'profile.followers': 'abonnés',
    'profile.following': 'abonnements',
  },
  de: {
    'nav.dashboard': 'Übersicht',
    'nav.issues': 'Issues',
    'nav.settings': 'Einstellungen',
    'search.placeholder': 'Suchen oder springen zu…',
    'repo.code': 'Code',
    'repo.settings': 'Einstellungen',
    'common.save': 'Änderungen speichern',
    'common.cancel': 'Abbrechen',
  },
  ja: {
    'nav.dashboard': 'ダッシュボード',
    'nav.issues': 'イシュー',
    'nav.settings': '設定',
    'search.placeholder': '検索または移動…',
    'repo.code': 'コード',
    'repo.settings': '設定',
    'common.save': '変更を保存',
    'common.cancel': 'キャンセル',
  },
  'pt-BR': {
    'nav.dashboard': 'Painel',
    'nav.issues': 'Problemas',
    'nav.settings': 'Configurações',
    'search.placeholder': 'Pesquisar ou pular para…',
    'repo.code': 'Código',
    'common.save': 'Salvar alterações',
  },
  ar: {
    'nav.dashboard': 'لوحة التحكم',
    'nav.issues': 'المشكلات',
    'nav.settings': 'الإعدادات',
    'search.placeholder': 'ابحث أو انتقل إلى…',
    'repo.code': 'الشفرة',
    'common.save': 'حفظ التغييرات',
    'common.cancel': 'إلغاء',
  },
};

let localeId = 'en';

export function getLocales() {
  return LOCALES;
}

export function setLocale(id) {
  const found = LOCALES.find((l) => l.id === id);
  localeId = found ? found.id : 'en';
  document.documentElement.lang = localeId;
  document.documentElement.dir = found && found.dir === 'rtl' ? 'rtl' : 'ltr';
  emit(EVENTS.localeChange, { locale: localeId, dir: document.documentElement.dir });
  return localeId;
}

export function getLocale() {
  return localeId;
}

export function getLocaleDir() {
  const found = LOCALES.find((l) => l.id === localeId);
  return found && found.dir === 'rtl' ? 'rtl' : 'ltr';
}

/**
 * Translate a key. Supports {placeholder} interpolation.
 * t('repo.star') / t('common.showing', { count: 3 })
 */
export function t(key, vars) {
  const table = tables[localeId] || {};
  let value = table[key];
  if (value == null) value = tables.en[key];
  if (value == null) value = key;
  if (vars) {
    value = value.replace(/\{(\w+)\}/g, (match, name) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match));
  }
  return value;
}

export function has(key) {
  return Boolean((tables[localeId] || {})[key]) || Boolean(tables.en[key]);
}

/** Plural helper: plural(1, 'issue') -> "1 issue"; plural(4, 'issue') -> "4 issues". */
export function plural(count, singular, pluralForm) {
  const n = Number(count) || 0;
  const word = n === 1 ? singular : (pluralForm || `${singular}s`);
  return `${n} ${word}`;
}

export function formatRelative(date, timeZone) {
  const value = date instanceof Date ? date : new Date(date);
  try {
    const rtf = new Intl.RelativeTimeFormat(localeId, { numeric: 'auto' });
    const diffMs = value.getTime() - Date.now();
    const units = [
      ['year', 31536000000], ['month', 2592000000], ['day', 86400000],
      ['hour', 3600000], ['minute', 60000], ['second', 1000],
    ];
    for (const [unit, ms] of units) {
      if (Math.abs(diffMs) >= ms || unit === 'second') {
        return rtf.format(Math.round(diffMs / ms), unit);
      }
    }
  } catch { /* fall through */ }
  return value.toLocaleDateString(localeId);
}

export function formatDate(date, options = {}) {
  const value = date instanceof Date ? date : new Date(date);
  const timeZone = options.timeZone || undefined;
  try {
    return value.toLocaleDateString(localeId, { year: 'numeric', month: 'short', day: 'numeric', timeZone, ...options });
  } catch {
    return value.toLocaleDateString(localeId);
  }
}

export function formatTime(date, timeZone) {
  const value = date instanceof Date ? date : new Date(date);
  try {
    return value.toLocaleTimeString(localeId, { hour: 'numeric', minute: '2-digit', timeZone });
  } catch {
    return value.toLocaleTimeString(localeId);
  }
}

export function formatNumberLocalized(value) {
  try { return new Intl.NumberFormat(localeId).format(Number(value) || 0); } catch { return String(value); }
}

export function registerTable(id, entries) {
  tables[id] = { ...(tables[id] || {}), ...entries };
}

export default { t, has, plural, setLocale, getLocale, getLocales, getLocaleDir, formatDate, formatTime, formatRelative, formatNumberLocalized, registerTable };
