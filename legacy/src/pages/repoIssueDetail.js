/**
 * RedGet — issue detail page.
 *
 * Markup contract:
 *
 *   <div class="issue-header">
 *     <h1 class="issue-title">Split diff misaligns paired deletions <span class="issue-number">#12</span></h1>
 *     <div class="issue-header-actions"> <button>Edit</button> <button>⋯</button> </div>
 *     <div class="issue-header-meta">
 *       <span class="state-badge state-open">Open</span>
 *       <strong>nova</strong> opened this issue <time>3 days ago</time> · 4 comments
 *     </div>
 *   </div>
 *   <div class="grid grid-sidebar">
 *     <main class="main-col">
 *       <ol class="timeline">                    body comment + interleaved events
 *       <div class="composer">                   reply box
 *     </main>
 *     <aside class="sidebar">
 *       <div class="sidebar-block" data-sidebar-control="assignees">…</div>
 *       <div class="sidebar-block" data-sidebar-control="labels">…</div>
 *       <div class="sidebar-block" data-sidebar-control="projects">…</div>
 *       <div class="sidebar-block" data-sidebar-control="milestone">…</div>
 *       <div class="sidebar-block">Linked pull requests · Development · Participants · Notifications · Lock</div>
 *     </aside>
 *   </div>
 *
 * Keyboard: a/l/m open the assignee/label/milestone pickers; r quotes the current
 * selection into the composer; e focuses the composer.
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { getSession } from '../core/store.js';
import * as api from '../core/api.js';
import { avatar, avatarStack } from '../components/avatars.js';
import { attachMenu, confirmDialog, openDialog, toast } from '../components/overlay.js';
import { relativeTimeEl, stateBadge } from '../components/kit.js';
import { repoShell, repoNotFound, isMaintainer } from '../components/repoChrome.js';
import {
  repoContext, issueOrPull, repoLabels, commentsForTarget,
  conversationFor, conversationList, commentCard, commentComposer, linkedAuthor,
  sidebarAssignees, sidebarLabels, sidebarProjects, sidebarMilestone, sidebarControl,
  resolveMilestone, resolveProjects, rerender, db as getDatabase,
  notFoundBody, pullHref,
} from './_shared.js';

export function render(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const number = Number(ctx.params.number);
  const located = issueOrPull(repo, number);
  if (!located) {
    return repoShell(repo, 'issues', {
      fullWidth: true,
      main: notFoundBody({
        title: `No issue #${number}`,
        description: `Issue #${number} does not exist in ${repo.fullName}. Pull requests share the numbering sequence — it may be a pull request instead.`,
        href: `/${repo.fullName}/issues`,
        label: 'Back to the issue list',
      }),
    });
  }

  // Pull request numbers resolve to the pull request page.
  if (located.kind === 'pull') {
    return import('./repoPullDetail.js').then((m) => m.render({
      params: { ...ctx.params, number: String(number) }, query: ctx.query || {},
    }));
  }

  return issuePage(repo, located.record, ctx);
}

export function issuePage(repo, issue, ctx = {}) {
  const session = getSession();
  const db = getDatabase();
  const maintainer = isMaintainer(repo);
  const canAct = maintainer || issue.authorLogin === session.login;

  const comments = commentsForTarget('issue', issue.id);
  const entries = conversationFor('issue', issue);
  const milestone = resolveMilestone(issue.milestone);
  const projects = resolveProjects(issue.projects);
  const labels = (issue.labels || []).map((label) => (typeof label === 'string'
    ? repoLabels(repo).find((l) => l.name === label) || { name: label, color: 'd61a2f' }
    : label));

  /* ------------------------------------------------------------- header */

  const titleNode = h('h1', { class: 'issue-title' }, issue.title, ' ',
    h('span', { class: 'issue-number' }, `#${issue.number}`));

  const moreMenu = h('ul', { class: 'dropdown-menu', role: 'menu', 'aria-label': 'Issue actions', hidden: true });
  const moreTrigger = h('button', {
    class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More issue actions',
  }, icon('kebab', { size: 16 }));

  const menuItems = [];
  if (canAct) {
    menuItems.push({
      icon: 'pencil', label: 'Edit title',
      onClick: () => openEditTitleDialog(repo, issue),
    });
  }
  if (maintainer) {
    menuItems.push({
      icon: issue.locked ? 'key' : 'lock',
      label: issue.locked ? 'Unlock conversation' : 'Lock conversation',
      onClick: () => (issue.locked ? unlock(repo, issue) : openLockDialog(repo, issue)),
    });
    menuItems.push({
      icon: 'pin', label: issue.pinned ? 'Unpin issue' : 'Pin issue',
      onClick: () => { api.pinIssue(repo.fullName, issue.number, !issue.pinned); rerender(); toast({ message: issue.pinned ? 'Issue unpinned' : 'Issue pinned', variant: 'success' }); },
    });
    menuItems.push({ icon: 'repo-push', label: 'Transfer issue', onClick: () => openTransferDialog(repo, issue) });
    menuItems.push({ divider: true });
  }
  menuItems.push({
    icon: 'link', label: 'Copy link',
    onClick: async () => {
      const { copyText } = await import('../components/overlay.js');
      copyText(`/${repo.fullName}/issues/${issue.number}`);
    },
  });
  menuItems.push({
    icon: 'issue-opened', label: 'Report this issue as spam',
    onClick: () => toast({ message: 'Reported to the RedGet trust & safety queue (simulated)', variant: 'info' }),
  });

  menuItems.forEach((item) => {
    if (item.divider) {
      moreMenu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
      return;
    }
    moreMenu.appendChild(h('li', { role: 'none' },
      h('button', { class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1', onClick: item.onClick },
        icon(item.icon, { size: 16 }), h('span', {}, item.label))));
  });
  attachMenu(moreTrigger, moreMenu, { align: 'right' });

  const stateLabel = issue.state === 'closed'
    ? (issue.stateReason === 'not_planned' ? 'Closed as not planned' : 'Closed')
    : 'Open';

  const header = h('div', { class: 'issue-header' },
    h('div', { class: 'issue-header-top' },
      titleNode,
      h('div', { class: 'issue-header-actions' },
        canAct ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openEditTitleDialog(repo, issue) }, icon('pencil', { size: 16 }), 'Edit') : null,
        h('div', { class: 'dropdown' }, moreTrigger, moreMenu))),
    h('div', { class: 'issue-header-meta' },
      stateBadge(issue.state === 'closed' && issue.stateReason === 'not_planned' ? 'closed-not-planned' : issue.state, { label: stateLabel }),
      h('span', {}, linkedAuthor(issue.authorLogin)),
      h('span', {}, ' opened this issue ', relativeTimeEl(issue.createdAt)),
      h('span', { class: 'text-muted' }, ` · ${comments.length} comment${comments.length === 1 ? '' : 's'}`),
      issue.updatedAt && issue.updatedAt !== issue.createdAt
        ? h('span', { class: 'text-muted' }, ' · updated ', relativeTimeEl(issue.updatedAt))
        : null,
      h('span', { class: 'sr-only' }, ` Full timestamp: ${new Date(issue.createdAt).toISOString()}`)));

  /* -------------------------------------------------------- conversation */

  const bodyComment = {
    id: `${issue.id}-body`,
    authorLogin: issue.authorLogin,
    body: issue.body || '',
    createdAt: issue.createdAt,
    updatedAt: issue.createdAt,
    reactions: issue.reactions || {},
  };

  const lockedNotice = issue.locked
    ? h('div', { class: 'flash flash-attention', role: 'status' },
      icon('lock', { size: 16 }),
      ` This conversation is locked as ${issue.lockReason || 'off-topic'}. Only collaborators can add new comments.`)
    : null;

  const conversation = h('div', { class: 'issue-conversation' },
    h('div', { class: 'timeline-item timeline-comment', dataset: { kind: 'comment' } },
      commentCard(bodyComment, {
        repo,
        variant: 'issue',
        editable: canAct,
        onEdit: () => openEditBodyDialog(repo, issue),
        onDelete: null,
        permalink: `/${repo.fullName}/issues/${issue.number}`,
      })),
    conversationList(entries, {
      repo,
      variant: 'issue',
      editable: true,
      issueAuthor: issue.authorLogin,
      label: 'Issue conversation',
      permalink: `/${repo.fullName}/issues/${issue.number}`,
    }));

  const reply = issue.locked && !maintainer
    ? h('div', { class: 'composer composer-locked' },
      h('p', { class: 'text-small text-muted' }, icon('lock', { size: 16 }), ' This conversation is locked.'))
    : commentComposer({
      repo,
      placeholder: 'Leave a comment',
      submitLabel: issue.state === 'open' ? 'Comment' : 'Comment',
      autoFocus: false,
      extraButtons: canAct
        ? [
          issue.state === 'open'
            ? h('button', {
              class: 'btn', type: 'button',
              onClick: () => closeWithReason(repo, issue),
            }, icon('issue-closed', { size: 16 }), 'Close issue')
            : h('button', {
              class: 'btn btn-primary', type: 'button',
              onClick: () => { api.updateIssue(repo.fullName, issue.number, { state: 'open' }); rerender(); toast({ message: 'Issue reopened', variant: 'success' }); },
            }, icon('issue-reopened', { size: 16 }), 'Reopen issue'),
        ]
        : null,
      onSubmit: (body) => {
        api.addComment('issue', issue.id, body, { repoFullName: repo.fullName });
        rerender();
        toast({ message: 'Comment added', variant: 'success' });
      },
    });

  /* ------------------------------------------------------------ sidebar */

  const linkedPulls = (issue.linkedPullRequests || [])
    .map((ref) => {
      const n = Number(String(ref).replace(/[^0-9]/g, ''));
      return (db.pullRequests || []).find((p) => p.repoFullName === repo.fullName && p.number === n);
    })
    .filter(Boolean);

  const sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Issue metadata' },
    sidebarAssignees(issue.assignees, { repo, kind: 'issue', number: issue.number }),
    sidebarLabels(labels, { repo, kind: 'issue', number: issue.number }),
    sidebarProjects(issue.projects, repo),
    sidebarMilestone(milestone, { repo, kind: 'issue', number: issue.number }),

    sidebarControl('development',
      linkedPulls.length
        ? h('ul', { class: 'link-list', role: 'list' }, ...linkedPulls.map((pull) => h('li', {},
          h('a', { href: pullHref(repo, pull.number) },
            pull.merged ? icon('git-merge', { size: 16 }) : icon(pull.draft ? 'git-pull-request-draft' : 'git-pull-request', { size: 16 }),
            ` #${pull.number} ${pull.title}`),
          ' ', stateBadge(pull.merged ? 'merged' : pull.state))))
        : h('p', { class: 'text-small text-muted' }, 'No linked pull requests. Mention this issue in a branch name or use “Fixes #', String(issue.number), '”.'),
      { title: 'Development' }),

    sidebarControl('notifications',
      h('div', {},
        h('p', { class: 'text-small text-muted' }, issue.subscribed
          ? 'You are receiving updates because you are subscribed to this thread.'
          : 'You are not subscribed to this thread.'),
        h('button', {
          class: 'btn btn-sm btn-block', type: 'button',
          onClick: () => {
            api.updateIssue(repo.fullName, issue.number, { subscribed: !issue.subscribed });
            rerender();
            toast({ message: issue.subscribed ? 'Unsubscribed' : 'Subscribed', variant: 'success' });
          },
        }, icon(issue.subscribed ? 'bell-fill' : 'bell', { size: 16 }), issue.subscribed ? 'Unsubscribe' : 'Subscribe')),
      { title: 'Notifications' }),

    sidebarControl('participants',
      h('div', { class: 'participant-grid' },
        ...uniqueAuthors(issue, comments).map((login) => h('a', {
          class: 'participant', href: `/${login}`, title: login, 'aria-label': `Participant ${login}`,
        }, avatar(findUser(login) || { login }, { size: 28 })))),
      { title: `Participants (${uniqueAuthors(issue, comments).length})`, label: 'Participants' }),

    maintainer ? sidebarControl('admin',
      h('ul', { class: 'link-list', role: 'list' },
        h('li', {}, h('a', { href: `/${repo.fullName}/settings` }, icon('gear', { size: 16 }), ' Repository settings')),
        h('li', {}, h('a', { href: `/${repo.fullName}/labels` }, icon('tag', { size: 16 }), ' Manage labels')),
        h('li', {}, h('a', { href: `/${repo.fullName}/milestones` }, icon('milestone', { size: 16 }), ' Manage milestones')))
      , { title: 'Maintainers' }) : null);

  /* --------------------------------------------------------------- page */

  const main = h('main', { class: 'main-col' }, conversation, lockedNotice, reply);

  return repoShell(repo, 'issues', {
    fullWidth: false,
    main: h('div', { class: 'grid grid-sidebar' }, main, sidebar),
    beforeBody: header,
  });
}

function findUser(login) {
  return (getDatabase().users || []).find((u) => u.login === login) || null;
}

function uniqueAuthors(issue, comments) {
  const set = new Set([issue.authorLogin, ...(issue.participants || [])]);
  comments.forEach((comment) => set.add(comment.authorLogin));
  return [...set].filter(Boolean);
}

/* ------------------------------------------------------------------ actions */

function openEditTitleDialog(repo, issue) {
  const title = h('input', { class: 'input input-lg', type: 'text', value: issue.title, 'aria-label': 'Issue title' });
  const body = h('textarea', { class: 'input', rows: '10', 'aria-label': 'Issue body' });
  body.value = issue.body || '';

  openDialog({
    title: `Edit issue #${issue.number}`,
    size: 'lg',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), title),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Body'), body,
        h('span', { class: 'field-help' }, 'Markdown, @mentions and #references are supported.'))),
    confirmLabel: 'Save issue',
    onConfirm: () => {
      const value = title.value.trim();
      if (!value) { toast({ message: 'A title is required', variant: 'attention' }); return false; }
      api.updateIssue(repo.fullName, issue.number, { title: value, body: body.value });
      rerender();
      toast({ message: 'Issue updated', variant: 'success' });
      return true;
    },
  });
}

function openEditBodyDialog(repo, issue) {
  openEditTitleDialog(repo, issue);
}

function closeWithReason(repo, issue) {
  const reasons = [
    { id: 'completed', label: 'Completed', description: 'The work described in this issue is done.', icon: 'check-circle' },
    { id: 'not_planned', label: 'Not planned', description: 'This will not be worked on. No code changes expected.', icon: 'x-circle' },
    { id: 'duplicate', label: 'Duplicate', description: 'Tracked elsewhere; link the canonical issue in a comment first.', icon: 'copy' },
  ];

  const list = h('ul', { class: 'choice-list', role: 'list' },
    ...reasons.map((reason) => h('li', {},
      h('button', {
        class: 'btn choice-button btn-block', type: 'button',
        onClick: () => {
          closeOpenDialog();
          api.updateIssue(repo.fullName, issue.number, { state: 'closed', stateReason: reason.id });
          rerender();
          toast({ message: `Closed as ${reason.label.toLowerCase()}`, variant: 'success' });
        },
      }, icon(reason.icon, { size: 16 }), h('span', {}, ` ${reason.label} — ${reason.description}`)))));

  openDialog({
    title: `Close issue #${issue.number}`,
    hideFooter: true,
    body: h('div', { class: 'dialog-form' },
      h('p', { class: 'text-small text-muted' }, 'Choose how this issue was resolved. The reason is recorded in the timeline.'),
      list),
  });
}

function openLockDialog(repo, issue) {
  const reasons = ['off-topic', 'too heated', 'resolved', 'spam'];
  const select = h('select', { class: 'input', 'aria-label': 'Lock reason' },
    ...reasons.map((reason) => h('option', { value: reason }, reason.replace('-', ' '))));

  openDialog({
    title: 'Lock conversation',
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'Locking means only collaborators can comment. Use it when a thread has stopped being productive.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Reason'), select)),
    confirmLabel: 'Lock conversation',
    danger: true,
    onConfirm: () => {
      api.lockConversation(repo.fullName, issue.number, select.value, true);
      rerender();
      toast({ message: 'Conversation locked', variant: 'success' });
      return true;
    },
  });
}

function unlock(repo, issue) {
  confirmDialog({
    title: 'Unlock conversation?',
    body: 'Everyone will be able to comment again.',
    confirmLabel: 'Unlock',
  }).then((ok) => {
    if (!ok) return;
    api.lockConversation(repo.fullName, issue.number, null, false);
    rerender();
    toast({ message: 'Conversation unlocked', variant: 'success' });
  });
}

function openTransferDialog(repo, issue) {
  const db = getDatabase();
  const targets = (db.repos || []).filter((r) => r.fullName !== repo.fullName && r.hasIssues);
  const select = h('select', { class: 'input', 'aria-label': 'Target repository' },
    ...targets.map((target) => h('option', { value: target.fullName }, target.fullName)));

  openDialog({
    title: `Transfer issue #${issue.number}`,
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'The issue keeps its body, comments and labels where names match. A timeline entry records the move and a redirect note is left behind.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Repository'), select)),
    confirmLabel: 'Transfer issue',
    danger: true,
    onConfirm: () => {
      api.transferIssue(repo.fullName, issue.number, select.value);
      toast({ message: `Transferred to ${select.value}`, variant: 'success' });
      navigate(`/${select.value}/issues`);
      return true;
    },
  });
}

function closeOpenDialog() {
  const open = document.querySelector('dialog[open]');
  if (open && typeof open.close === 'function') open.close();
}

export default { render, issuePage };
