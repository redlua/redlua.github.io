/**
 * RedGet — pull request detail: conversation, files, commits and checks.
 *
 * Conversation (/:login/:repo/pull/:number)
 *   <div class="issue-header"> … #43 · Draft · merged/closed badges … </div>
 *   <div class="grid grid-sidebar">
 *     <main class="main-col">
 *       <ol class="timeline">          body, reviews, review-thread summaries, events
 *       <div class="merge-box is-mergeable">    mergeability + checks + merge button
 *       <div class="composer">         reply
 *     </main>
 *     <aside class="meta-sidebar">     reviewers, assignees, labels, projects, milestone, linked issues
 *
 * Files (/:login/:repo/pull/:number/files)
 *   <nav class="subnav" role="tablist">Conversation · Commits · Checks · Files changed</nav>
 *   <div class="file-filter-bar">      filter · jump to file · viewed counter · display options
 *   <div class="diff">                 from /src/components/diff.js
 *   <div class="review-box">           pending review → Comment / Approve / Request changes
 *
 * Merge box contract:
 *   <div class="merge-box is-mergeable|is-conflict|is-draft">
 *     <div class="merge-box-header"><svg class="icon"> <strong>All checks have passed</strong> …</div>
 *     <div class="merge-box-body">
 *       <p class="merge-branch-info">nova wants to merge 3 commits into main from feature/…</p>
 *       <div class="checks-summary passed">…</div>
 *       <div class="merge-actions">
 *         <button class="btn btn-primary merge-method-btn">Merge pull request ▾</button>
 *         <button class="btn">Close pull request</button>
 */

import { h, icon } from '../core/dom.js';
import { LIMITS, FEATURES } from '../config.js';
import { getSession } from '../core/store.js';
import * as api from '../core/api.js';
import { avatar } from '../components/avatars.js';
import { computeDiff, renderDiff, diffStat, extractSuggestion } from '../components/diff.js';
import { markdown as markdownNode } from '../components/markdown.js';
import { attachMenu, confirmDialog, openDialog, toast } from '../components/overlay.js';
import {
  relativeTimeEl, stateBadge, counter, badge, checkStateIcon,
} from '../components/kit.js';
import { formatDuration } from '../core/util.js';
import { repoShell, repoNotFound, isMaintainer } from '../components/repoChrome.js';
import {
  repoContext, issueOrPull, repoCommits, commitDiffFiles, prDiff,
  checksForPull, reviewsForPull, threadsForPull, commentsForTarget, conversationFor,
  conversationList, commentCard, commentComposer, linkedAuthor, sidebarAssignees,
  sidebarLabels, sidebarProjects, sidebarMilestone, sidebarControl, sidebarReviewers,
  metaSidebar, resolveMilestone, resolveProjects, rerender, db as getDatabase,
  notFoundBody, issueHref,
} from './_shared.js';
import { commitRow } from './repoBlob.js';

/* ==================================================================== entry */

export function render(ctx = {}) {
  return pullPage(ctx, 'conversation');
}

export function renderCommits(ctx = {}) {
  return pullPage(ctx, 'commits');
}

export function renderChecks(ctx = {}) {
  return pullPage(ctx, 'checks');
}

export function renderFiles(ctx = {}) {
  return pullPage(ctx, 'files');
}

function pullPage(ctx, tab) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const number = Number(ctx.params.number);
  const located = issueOrPull(repo, number);
  if (!located) {
    return repoShell(repo, 'pulls', {
      fullWidth: true,
      main: notFoundBody({
        title: `No pull request #${number}`,
        description: `Pull request #${number} does not exist in ${repo.fullName}. Issues and pull requests share one numbering sequence.`,
        href: `/${repo.fullName}/pulls`,
        label: 'Back to pull requests',
      }),
    });
  }
  if (located.kind === 'issue') {
    return import('./repoIssueDetail.js').then((m) => m.render({ params: ctx.params, query: ctx.query || {} }));
  }

  return pullView(repo, located.record, tab, ctx);
}

/* =============================================================== main view */

function pullView(repo, pull, tab, ctx = {}) {
  const session = getSession();
  const db = getDatabase();
  const maintainer = isMaintainer(repo);

  const reviews = reviewsForPull(pull);
  const threads = threadsForPull(pull);
  const checks = checksForPull(pull);
  const comments = commentsForTarget('pull', pull.id);
  const files = prFiles(repo, pull);
  const diff = computeDiff(files);

  const main = h('main', { class: 'main-col' });
  main.append(pullTabs(repo, pull, tab, { commits: pull.commits || 0, checks: checks.length, files: files.length, comments: comments.length }));

  if (tab === 'files') {
    main.append(filesTab(repo, pull, diff, threads, files));
  } else if (tab === 'commits') {
    main.append(commitsTab(repo, pull));
  } else if (tab === 'checks') {
    main.append(checksTab(repo, pull, checks));
  } else {
    main.append(conversationTab(repo, pull, { reviews, threads, checks, comments, diff, files, maintainer }));
  }

  const sidebar = pullSidebar(repo, pull, { reviews, maintainer, session });

  return repoShell(repo, 'pulls', {
    fullWidth: false,
    beforeBody: pullHeader(repo, pull, { maintainer, session }),
    main: h('div', { class: 'grid grid-sidebar' }, main, sidebar),
  });
}

/* ------------------------------------------------------------------ header */

function pullHeader(repo, pull, options = {}) {
  const { maintainer, session } = options;
  const state = pull.merged ? 'merged' : pull.state;
  const stateLabel = pull.merged
    ? 'Merged'
    : pull.state === 'closed' ? 'Closed' : pull.draft ? 'Draft' : 'Open';

  const title = h('h1', { class: 'issue-title' }, pull.title, ' ', h('span', { class: 'issue-number' }, `#${pull.number}`));

  const actions = h('div', { class: 'issue-header-actions' });
  if (maintainer || pull.authorLogin === session.login) {
    actions.append(h('button', {
      class: 'btn btn-sm', type: 'button',
      onClick: () => openEditPullDialog(repo, pull),
    }, icon('pencil', { size: 16 }), 'Edit'));
  }

  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', 'aria-label': 'Pull request actions', hidden: true });
  const trigger = h('button', {
    class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More pull request actions',
  }, icon('kebab', { size: 16 }));

  const items = [];
  if (maintainer && pull.state === 'open') {
    items.push({
      icon: pull.draft ? 'git-pull-request' : 'git-pull-request-draft',
      label: pull.draft ? 'Mark as ready for review' : 'Convert to draft',
      onClick: () => {
        api.setDraft(repo.fullName, pull.number, !pull.draft);
        rerender();
        toast({ message: pull.draft ? 'Marked as ready for review' : 'Converted to draft', variant: 'success' });
      },
    });
  }
  if (maintainer) {
    items.push({
      icon: pull.locked ? 'key' : 'lock',
      label: pull.locked ? 'Unlock conversation' : 'Lock conversation',
      onClick: () => {
        api.lockConversation(repo.fullName, pull.number, pull.locked ? null : 'resolved', !pull.locked);
        rerender();
        toast({ message: pull.locked ? 'Conversation unlocked' : 'Conversation locked', variant: 'success' });
      },
    });
    items.push({ divider: true });
  }
  items.push({
    icon: 'link', label: 'Copy link',
    onClick: async () => {
      const { copyText } = await import('../components/overlay.js');
      copyText(`/${repo.fullName}/pull/${pull.number}`);
    },
  });
  items.push({
    icon: 'git-branch', label: 'Copy head branch name',
    onClick: async () => {
      const { copyText } = await import('../components/overlay.js');
      copyText(pull.headBranch);
    },
  });

  items.forEach((item) => {
    if (item.divider) {
      menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
      return;
    }
    menu.appendChild(h('li', { role: 'none' },
      h('button', { class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1', onClick: item.onClick },
        icon(item.icon, { size: 16 }), h('span', {}, item.label))));
  });
  attachMenu(trigger, menu, { align: 'right' });
  actions.append(h('div', { class: 'dropdown' }, trigger, menu));

  return h('div', { class: 'issue-header' },
    h('div', { class: 'issue-header-top' }, title, actions),
    h('div', { class: 'issue-header-meta' },
      stateBadge(state, { label: stateLabel }),
      h('span', {}, linkedAuthor(pull.authorLogin)),
      h('span', {}, pull.merged ? ' merged ' : pull.state === 'closed' ? ' closed ' : ' wants to merge '),
      h('strong', {}, `${pull.commits || 0} commit${pull.commits === 1 ? '' : 's'}`),
      h('span', {}, ' into '),
      h('code', { class: 'code-inline' }, pull.baseBranch),
      h('span', {}, ' from '),
      h('code', { class: 'code-inline' }, pull.headBranch),
      h('span', {}, ' ', relativeTimeEl(pull.mergedAt || pull.closedAt || pull.createdAt)),
      pull.mergedByLogin ? h('span', {}, ' · merged by ', linkedAuthor(pull.mergedByLogin)) : null,
      h('span', { class: 'text-muted' }, ` · ${commentsForTarget('pull', pull.id).length} comments`)));
}

function pullTabs(repo, pull, active, counts) {
  const tabs = [
    { id: 'conversation', label: 'Conversation', href: `/${repo.fullName}/pull/${pull.number}`, iconName: 'comment-discussion', count: counts.comments },
    { id: 'commits', label: 'Commits', href: `/${repo.fullName}/pull/${pull.number}/commits`, iconName: 'git-commit', count: counts.commits },
    { id: 'checks', label: 'Checks', href: `/${repo.fullName}/pull/${pull.number}/checks`, iconName: 'check', count: counts.checks },
    { id: 'files', label: 'Files changed', href: `/${repo.fullName}/pull/${pull.number}/files`, iconName: 'diff', count: counts.files },
  ];

  const list = h('ul', { class: 'subnav-links', role: 'list' },
    ...tabs.map((item) => {
      const link = h('a', { class: 'subnav-link', href: item.href });
      link.append(icon(item.iconName, { size: 16 }), h('span', {}, ` ${item.label}`), counter(item.count || 0));
      if (item.id === active) link.setAttribute('aria-current', 'page');
      return h('li', {}, link);
    }));

  return h('nav', { class: 'subnav', 'aria-label': 'Pull request views' }, list);
}

/* ------------------------------------------------------------ conversation */

function conversationTab(repo, pull, data) {
  const { reviews, threads, checks, comments, diff, files, maintainer } = data;
  const session = getSession();
  const wrap = h('div', { class: 'pull-conversation' });

  /* body comment */
  const bodyComment = {
    id: `${pull.id}-body`,
    authorLogin: pull.authorLogin,
    body: pull.body || '',
    createdAt: pull.createdAt,
    updatedAt: pull.createdAt,
    reactions: pull.reactions || {},
  };
  wrap.appendChild(h('div', { class: 'timeline-item timeline-comment', dataset: { kind: 'comment' } },
    commentCard(bodyComment, {
      repo, variant: 'pull', editable: maintainer || pull.authorLogin === session.login,
      onEdit: () => openEditPullDialog(repo, pull),
      permalink: `/${repo.fullName}/pull/${pull.number}`,
    })));

  /* reviews as timeline entries */
  const reviewEntries = reviews.map((review) => ({
    kind: 'event',
    createdAt: review.submittedAt,
    record: {
      id: review.id,
      type: review.state === 'APPROVED' ? 'approved' : review.state === 'CHANGES_REQUESTED' ? 'changes-requested' : 'reviewed',
      actorLogin: review.authorLogin,
      createdAt: review.submittedAt,
      text: review.state === 'APPROVED'
        ? ' approved these changes'
        : review.state === 'CHANGES_REQUESTED'
          ? ' requested changes'
          : ' reviewed this pull request',
    },
  }));

  const entries = [
    ...conversationFor('pull', pull),
    ...reviewEntries,
    ...threads.map((thread) => ({
      kind: 'event',
      createdAt: thread.createdAt,
      record: {
        id: thread.id,
        type: 'commented',
        actorLogin: thread.authorLogin,
        createdAt: thread.createdAt,
        text: ` commented on ${thread.path}:${thread.side === 'LEFT' ? thread.oldNo : thread.newNo}`,
      },
    })),
  ];

  wrap.appendChild(conversationList(entries, {
    repo, variant: 'pull', editable: true, issueAuthor: pull.authorLogin,
    label: 'Pull request conversation',
    permalink: `/${repo.fullName}/pull/${pull.number}`,
  }));

  /* review summaries (full bodies of the latest review per author) */
  if (reviews.length) {
    const latestByAuthor = new Map();
    reviews.forEach((review) => latestByAuthor.set(review.authorLogin, review));
    wrap.appendChild(h('section', { class: 'review-summaries', 'aria-labelledby': 'review-summaries-title' },
      h('h2', { class: 'section-title', id: 'review-summaries-title' }, 'Reviews', counter(latestByAuthor.size)),
      h('div', { class: 'review-summary-list' },
        ...[...latestByAuthor.values()].map((review) => reviewSummaryCard(repo, pull, review, maintainer)))));
  }

  /* merge box */
  wrap.appendChild(mergeBox(repo, pull, { checks, reviews, diff, maintainer, session }));

  /* reply composer */
  wrap.appendChild(pull.locked && !maintainer
    ? h('div', { class: 'lock-notice' }, icon('lock', { size: 16 }), ' This conversation is locked. Only collaborators can comment.')
    : commentComposer({
      repo,
      placeholder: 'Leave a comment, or use Review changes to approve or request changes',
      submitLabel: 'Comment',
      extraButtons: [
        h('button', { class: 'btn', type: 'button', onClick: () => openReviewDialog(repo, pull, files) },
          icon('eye', { size: 16 }), 'Review changes'),
        maintainer && pull.state === 'open'
          ? h('button', {
            class: 'btn', type: 'button',
            onClick: () => confirmDialog({
              title: 'Close this pull request?',
              body: 'The branch is kept. You can reopen the pull request at any time.',
              confirmLabel: 'Close pull request',
              danger: true,
            }).then((ok) => {
              if (!ok) return;
              api.closePullRequest(repo.fullName, pull.number, false);
              rerender();
              toast({ message: 'Pull request closed', variant: 'info' });
            }),
          }, icon('x-circle', { size: 16 }), 'Close pull request')
          : null,
      ],
      onSubmit: (body) => {
        api.addComment('pull', pull.id, body, { repoFullName: repo.fullName });
        rerender();
        toast({ message: 'Comment added', variant: 'success' });
      },
    }));

  return wrap;
}

function reviewSummaryCard(repo, pull, review, maintainer) {
  const state = review.state === 'APPROVED' ? 'approved' : review.state === 'CHANGES_REQUESTED' ? 'changes-requested' : 'commented';
  const label = review.state === 'APPROVED' ? 'Approved' : review.state === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Commented';
  const iconName = review.state === 'APPROVED' ? 'check-circle' : review.state === 'CHANGES_REQUESTED' ? 'x-circle' : 'comment';

  const card = h('div', { class: `review-summary review-${state}` },
    h('div', { class: 'review-summary-header' },
      icon(iconName, { size: 16 }),
      linkedAuthor(review.authorLogin),
      h('strong', {}, ` ${label} `),
      relativeTimeEl(review.submittedAt),
      review.commitSha ? h('span', { class: 'text-muted' }, ' on ', h('code', { class: 'code-inline' }, String(review.commitSha).slice(0, 7))) : null,
      maintainer && !review.dismissed
        ? h('span', { class: 'review-summary-actions' },
          h('button', {
            class: 'btn btn-sm', type: 'button',
            onClick: () => confirmDialog({
              title: 'Dismiss this review?',
              body: `The ${label.toLowerCase()} state from ${review.authorLogin} stops blocking the merge.`,
              confirmLabel: 'Dismiss review',
              danger: true,
            }).then((ok) => {
              if (!ok) return;
              api.dismissReview(review.id);
              rerender();
              toast({ message: 'Review dismissed', variant: 'info' });
            }),
          }, 'Dismiss'))
        : null,
      review.dismissed ? badge('Dismissed', 'attention') : null),
    review.body ? h('div', { class: 'review-summary-body' }, markdownNode(review.body, { repo })) : null);
  return card;
}

/* ------------------------------------------------------------- merge box */

function mergeBox(repo, pull, data) {
  const { checks, reviews, diff, maintainer, session } = data;
  const failing = checks.filter((c) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(c.conclusion));
  const pending = checks.filter((c) => c.status !== 'completed');
  const approvals = reviews.filter((r) => r.state === 'APPROVED').length;
  const changes = reviews.filter((r) => r.state === 'CHANGES_REQUESTED').length;
  const branchProtection = (getDatabase().branchProtection || []).find((b) => b.repoFullName === repo.fullName);
  const requiredReviews = branchProtection && branchProtection.rules && branchProtection.rules[0]
    ? (branchProtection.rules[0].requiredApprovingReviewCount || 0)
    : 0;

  let variant = 'is-mergeable';
  let headline = 'All checks have passed';
  let headlineIcon = 'check-circle';

  if (pull.merged) {
    variant = 'is-merged';
    headline = `Merged ${pull.mergeMethod || 'merge'} into ${pull.baseBranch}`;
    headlineIcon = 'git-merge';
  } else if (pull.state === 'closed') {
    variant = 'is-closed';
    headline = 'This pull request was closed without merging';
    headlineIcon = 'x-circle';
  } else if (pull.draft) {
    variant = 'is-draft';
    headline = 'This pull request is still a draft';
    headlineIcon = 'git-pull-request-draft';
  } else if (pull.mergeableState === 'dirty') {
    variant = 'is-conflict';
    headline = 'This branch has conflicts that must be resolved';
    headlineIcon = 'alert';
  } else if (failing.length) {
    variant = 'is-failing';
    headline = `${failing.length} check${failing.length === 1 ? '' : 's'} failed`;
    headlineIcon = 'x-circle';
  } else if (changes) {
    variant = 'is-blocked';
    headline = 'Changes were requested';
    headlineIcon = 'x-circle';
  } else if (pending.length) {
    variant = 'is-pending';
    headline = `${pending.length} check${pending.length === 1 ? '' : 's'} still running`;
    headlineIcon = 'clock';
  } else if (requiredReviews && approvals < requiredReviews) {
    variant = 'is-blocked';
    headline = `Review required — ${approvals}/${requiredReviews} approvals`;
    headlineIcon = 'eye';
  }

  const box = h('div', { class: ['merge-box', variant].join(' '), 'aria-labelledby': 'merge-box-title' });

  const header = h('div', { class: 'merge-box-header' },
    icon(headlineIcon, { size: 16 }),
    h('strong', { id: 'merge-box-title' }, headline),
    pull.autoMerge ? badge(`Auto-merge: ${pull.autoMerge.method}`, 'accent') : null,
    h('span', { class: 'grow' }),
    pull.state === 'open' && !pull.merged
      ? h('span', { class: 'merge-note' }, `${approvals} approval${approvals === 1 ? '' : 's'} · ${changes} change request${changes === 1 ? '' : 's'} · ${checks.length - failing.length - pending.length}/${checks.length} checks passed`)
      : null);

  const body = h('div', { class: 'merge-box-body' });

  body.appendChild(h('p', { class: 'merge-branch-info' },
    h('a', { href: `/${pull.authorLogin}` }, pull.authorLogin),
    ' wants to merge ', h('strong', {}, `${pull.commits || 0} commit${pull.commits === 1 ? '' : 's'}`),
    ' into ', h('code', { class: 'code-inline' }, pull.baseBranch),
    ' from ', h('code', { class: 'code-inline' }, pull.headBranch), '.'));

  if (checks.length) {
    const summaryClass = failing.length ? 'failed' : pending.length ? 'pending' : 'passed';
    body.appendChild(h('div', { class: `checks-summary ${summaryClass}` },
      checkStateIcon(failing.length ? 'completed' : pending.length ? 'in_progress' : 'completed', failing.length ? 'failure' : pending.length ? null : 'success'),
      h('div', { class: 'grow' },
        h('div', {}, failing.length
          ? `${failing.length} failing check${failing.length === 1 ? '' : 's'}`
          : pending.length
            ? `${pending.length} pending check${pending.length === 1 ? '' : 's'}`
            : `${checks.length} successful check${checks.length === 1 ? '' : 's'}`),
        h('div', { class: 'text-small text-muted' }, failing.length
          ? failing.map((c) => c.name).join(', ')
          : 'Required checks must pass before merging.')),
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/pull/${pull.number}/checks` }, 'Details')));
  }

  if (threadsCountUnresolved(repo, pull)) {
    body.appendChild(h('div', { class: 'checks-summary pending' },
      icon('comment-discussion', { size: 16 }),
      h('div', { class: 'grow' },
        h('div', {}, `${threadsCountUnresolved(repo, pull)} unresolved conversation${threadsCountUnresolved(repo, pull) === 1 ? '' : 's'}`),
        h('div', { class: 'text-small text-muted' }, 'Resolve review threads before merging.')),
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/pull/${pull.number}/files` }, 'Review')));
  }

  const canMerge = maintainer && pull.state === 'open' && !pull.merged;

  if (pull.merged) {
    body.appendChild(h('p', { class: 'merge-note' },
      icon('git-merge', { size: 16 }),
      ` Merged by ${pull.mergedByLogin || 'a maintainer'} ${new Date(pull.mergedAt).toLocaleString()} using ${pull.mergeMethod || 'merge'}.`,
      ' ', h('a', { href: `/${repo.fullName}/commits/${pull.baseBranch}` }, 'See the branch history')));
  } else if (pull.state === 'closed') {
    body.appendChild(h('div', { class: 'merge-actions' },
      maintainer ? h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => { api.closePullRequest(repo.fullName, pull.number, true); rerender(); toast({ message: 'Pull request reopened', variant: 'success' }); },
      }, icon('issue-reopened', { size: 16 }), 'Reopen pull request') : null,
      h('span', { class: 'merge-note' }, 'Closed without merging.')));
  } else {
    const methods = availableMethods(repo);
    const methodTrigger = h('button', {
      class: 'btn btn-primary btn-lg merge-method-btn', type: 'button',
      'aria-haspopup': 'menu', 'aria-expanded': 'false',
      disabled: canMerge ? undefined : 'disabled',
    }, icon('git-merge', { size: 16 }), ` ${methods[0].label}`, icon('chevron-down', { size: 16 }));

    const methodMenu = h('ul', { class: 'dropdown-menu', role: 'menu', 'aria-label': 'Merge method', hidden: true },
      ...methods.map((method) => h('li', { role: 'none' },
        h('button', {
          class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
          onClick: () => {
            if (!canMerge) return;
            methodTrigger.replaceChildren(icon('git-merge', { size: 16 }), ` ${method.label}`, icon('chevron-down', { size: 16 }));
            methodMenu.querySelectorAll('.dropdown-item').forEach((item) => item.removeAttribute('aria-current'));
            methodMenu.querySelectorAll('.dropdown-item')[methods.indexOf(method)].setAttribute('aria-current', 'true');
            pendingMethod.method = method.id;
            updateMergeButton();
          },
        }, icon(method.icon, { size: 16 }), h('span', {}, method.label),
        h('span', { class: 'text-small text-muted dropdown-desc' }, method.desc)))));

    const pendingMethod = { method: methods[0].id };
    const mergeButton = h('button', {
      class: 'btn btn-primary btn-lg', type: 'button',
      disabled: canMerge ? undefined : 'disabled',
      onClick: () => confirmMerge(repo, pull, pendingMethod.method),
    }, `Merge ${methods[0].label.toLowerCase()}`);

    const updateMergeButton = () => {
      const method = methods.find((m) => m.id === pendingMethod.method) || methods[0];
      mergeButton.replaceChildren(`Merge ${method.label.toLowerCase()}`);
    };

    attachMenu(methodTrigger, methodMenu, { align: 'left' });

    body.appendChild(h('div', { class: 'merge-actions' },
      h('div', { class: 'dropdown merge-method-group' }, methodTrigger, methodMenu),
      mergeButton,
      FEATURES.autoMerge && canMerge
        ? h('button', {
          class: 'btn btn-lg', type: 'button', 'aria-pressed': String(Boolean(pull.autoMerge)),
          onClick: () => {
            const next = pull.autoMerge ? null : pendingMethod.method;
            api.setAutoMerge(repo.fullName, pull.number, next);
            rerender();
            toast({ message: next ? `Auto-merge enabled (${next})` : 'Auto-merge disabled', variant: 'success' });
          },
        }, icon('zap', { size: 16 }), pull.autoMerge ? 'Disable auto-merge' : 'Enable auto-merge')
        : null,
      canMerge ? h('button', {
        class: 'btn btn-lg', type: 'button',
        onClick: () => confirmDialog({
          title: 'Close this pull request?',
          body: 'The branch is kept and you can reopen later.',
          confirmLabel: 'Close pull request',
          danger: true,
        }).then((ok) => {
          if (!ok) return;
          api.closePullRequest(repo.fullName, pull.number, false);
          rerender();
          toast({ message: 'Pull request closed', variant: 'info' });
        }),
      }, 'Close pull request') : null,
      repo.useMergeQueue && canMerge
        ? h('a', { class: 'btn btn-lg', href: `/${repo.fullName}/actions/queue` }, icon('queue', { size: 16 }), 'Add to merge queue')
        : null));

    if (!canMerge) {
      body.appendChild(h('p', { class: 'merge-note' },
        maintainer ? 'Merging is blocked by branch protection rules.' : `Only collaborators with write access can merge. You are signed in as ${session.login}.`));
    }
    if (variant === 'is-conflict') {
      body.appendChild(h('p', { class: 'merge-note' },
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openResolveDialog(repo, pull) }, icon('git-merge', { size: 16 }), 'Resolve conflicts'),
        ' or update the branch locally with ', h('code', { class: 'code-inline' }, `rgt pr checkout ${pull.number}`), '.'));
    }
    if (repo.allowUpdateBranch && canMerge && variant === 'is-mergeable') {
      body.appendChild(h('p', { class: 'merge-note' },
        h('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => {
            toast({ message: `Merging ${pull.baseBranch} into ${pull.headBranch} (simulated)`, variant: 'success' });
          },
        }, icon('sync', { size: 16 }), 'Update branch')));
    }
  }

  box.append(header, body);
  return box;
}

function threadsCountUnresolved(repo, pull) {
  return threadsForPull(pull).filter((t) => !t.resolved).length;
}

function availableMethods(repo) {
  const methods = [];
  if (repo.allowMergeCommit !== false) methods.push({ id: 'merge', label: 'Create a merge commit', desc: 'All commits are added to the base branch via a merge commit.', icon: 'git-merge' });
  if (repo.allowSquashMerge !== false) methods.push({ id: 'squash', label: 'Squash and merge', desc: 'Commits are combined into one commit on the base branch.', icon: 'stack' });
  if (repo.allowRebaseMerge !== false) methods.push({ id: 'rebase', label: 'Rebase and merge', desc: 'Commits are rebased and added individually to the base branch.', icon: 'git-commit' });
  return methods.length ? methods : [{ id: 'merge', label: 'Create a merge commit', desc: 'Merge commit', icon: 'git-merge' }];
}

function confirmMerge(repo, pull, method) {
  const title = {
    merge: 'Create a merge commit',
    squash: 'Squash and merge',
    rebase: 'Rebase and merge',
  }[method] || 'Merge pull request';

  const message = h('input', {
    class: 'input', type: 'text', 'aria-label': 'Commit message',
    value: method === 'squash' ? `${pull.title} (#${pull.number})` : `Merge pull request #${pull.number} from ${pull.headBranch}`,
  });
  const description = h('textarea', { class: 'input', rows: '3', 'aria-label': 'Extended description' });
  description.value = method === 'squash' ? (pull.body || '').slice(0, 400) : '';

  openDialog({
    title,
    body: h('div', { class: 'dialog-form' },
      h('p', { class: 'text-small text-muted' },
        `${pull.commits || 0} commits from ${pull.headBranch} into ${pull.baseBranch}.`,
        repo.deleteBranchOnMerge ? ' The head branch will be deleted after merging.' : ''),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Commit message'), message),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Extended description'), description),
      h('label', { class: 'checkbox-row' },
        h('input', { type: 'checkbox', id: 'merge-delete-branch', checked: repo.deleteBranchOnMerge ? 'checked' : null }),
        h('span', {}, 'Delete the head branch after merging'))),
    confirmLabel: 'Confirm merge',
    onConfirm: () => {
      api.mergePullRequest(repo.fullName, pull.number, method);
      rerender();
      toast({ message: `Pull request #${pull.number} merged (${method})`, variant: 'success' });
      return true;
    },
  });
}

function openResolveDialog(repo, pull) {
  openDialog({
    title: 'Resolve conflicts',
    size: 'md',
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'RedGet can resolve simple conflicts in the browser editor. In this demo the resolution is recorded and the pull request becomes mergeable.'),
      h('ul', { class: 'link-list', role: 'list' },
        h('li', {}, h('code', { class: 'code-inline' }, `rgt pr checkout ${pull.number}`)),
        h('li', {}, h('code', { class: 'code-inline' }, `rgt merge ${pull.baseBranch}`)),
        h('li', {}, h('code', { class: 'code-inline' }, 'rgt push'))),
      h('p', { class: 'text-small text-muted' }, 'Or mark the conflicts resolved manually below.')),
    confirmLabel: 'Mark as resolved',
    onConfirm: () => {
      api.updateIssue(repo.fullName, pull.number, {});
      const db = getDatabase();
      const record = db.pullRequests.find((p) => p.id === pull.id);
      if (record) record.mergeableState = 'clean';
      rerender();
      toast({ message: 'Conflicts marked as resolved', variant: 'success' });
      return true;
    },
  });
}

/* ------------------------------------------------------------------ files */

function filesTab(repo, pull, diff, threads, files) {
  const session = getSession();
  const viewed = new Set(pull.viewedFiles || []);
  const wrap = h('div', { class: 'files-tab' });

  const filterInput = h('input', {
    class: 'input input-sm', type: 'search', placeholder: 'Filter changed files',
    'aria-label': 'Filter changed files', style: { width: '220px' },
  });

  const jumpTrigger = h('button', { class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' },
    icon('list-unordered', { size: 16 }), ' Jump to file');
  const jumpMenu = h('ul', { class: 'dropdown-menu file-jump-menu', role: 'menu', 'aria-label': 'Jump to file', hidden: true },
    ...files.map((file) => h('li', { role: 'none' },
      h('button', {
        class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
        onClick: () => {
          const target = document.getElementById(`diff-${file.path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()}`);
          if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        },
      }, icon('file', { size: 16 }), h('span', { class: 'file-jump-path' }, file.path), diffStat(file.additions || 0, file.deletions || 0, { showNumbers: false })))));
  attachMenu(jumpTrigger, jumpMenu, { align: 'left' });

  const viewedCount = h('span', { class: 'text-small text-muted' }, `${viewed.size}/${files.length} viewed`);

  const bar = h('div', { class: 'file-filter-bar' },
    filterInput,
    h('div', { class: 'dropdown' }, jumpTrigger, jumpMenu),
    viewedCount,
    h('span', { class: 'grow' }),
    h('span', {}, `${files.length} changed files`),
    diffStat(diff.additions, diff.deletions));

  filterInput.addEventListener('input', () => {
    const q = filterInput.value.toLowerCase();
    wrap.querySelectorAll('.diff-file').forEach((node) => {
      const path = (node.querySelector('.file-path')?.textContent || '').toLowerCase();
      node.hidden = Boolean(q) && !path.includes(q);
    });
  });

  const diffNode = renderDiff(diff, {
    repo,
    sha: pull.headSha || '',
    comments: threads,
    onViewedChange: (path, isViewed) => {
      api.markFileViewed(repo.fullName, pull.number, path, isViewed);
      if (isViewed) viewed.add(path); else viewed.delete(path);
      viewedCount.textContent = `${viewed.size}/${files.length} viewed`;
    },
    onAddComment: (payload) => openThreadDialog(repo, pull, payload),
    onReply: (thread) => openReplyDialog(repo, thread),
    onResolve: (thread, resolved) => {
      api.resolveThread(thread.id, resolved);
      rerender();
      toast({ message: resolved ? 'Conversation resolved' : 'Conversation un-resolved', variant: 'info' });
    },
    onApplySuggestion: (thread, batch) => {
      if (batch) {
        toast({ message: 'Suggestion added to the pending batch', variant: 'info' });
        return;
      }
      api.applySuggestionToThread(thread.id);
      rerender();
      toast({ message: 'Suggestion applied and committed', variant: 'success' });
    },
  });

  wrap.append(bar, diffNode, reviewBox(repo, pull, threads, session));
  return wrap;
}

function reviewBox(repo, pull, threads, session) {
  const pending = threads.filter((t) => t.authorLogin === session.login && !t.resolved);
  const body = h('textarea', { class: 'input', rows: '5', placeholder: 'Leave a review summary. Markdown, @mentions and #references work.', 'aria-label': 'Review summary' });

  const submit = (state) => {
    const text = body.value.trim();
    if (state !== 'comment' && !text) {
      toast({ message: state === 'approve' ? 'An approval can be empty, but a summary helps' : 'A summary is required when requesting changes', variant: 'attention' });
      if (state === 'changes') { body.focus(); return; }
    }
    api.submitReview(repo.fullName, pull.number, { state, body: text });
    rerender();
    toast({
      message: state === 'approve' ? 'Review approved' : state === 'changes' ? 'Changes requested' : 'Review comment submitted',
      variant: 'success',
    });
  };

  return h('div', { class: 'review-box', role: 'group', 'aria-label': 'Submit a review' },
    h('div', { class: 'review-box-title' }, icon('eye', { size: 16 }), ' Review changes',
      pending.length ? counter(pending.length) : null,
      h('span', { class: 'text-small text-muted' }, pending.length ? ' pending comments in this review' : ' No pending comments')),
    body,
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn', type: 'button', onClick: () => submit('comment') }, icon('comment', { size: 16 }), 'Comment'),
      h('button', { class: 'btn btn-danger', type: 'button', onClick: () => submit('changes') }, icon('x-circle', { size: 16 }), 'Request changes'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => submit('approve') }, icon('check-circle', { size: 16 }), 'Approve')));
}

function openThreadDialog(repo, pull, payload) {
  const body = h('textarea', { class: 'input', rows: '6', placeholder: 'Leave a comment. Use a ```suggestion block to propose exact code.', 'aria-label': 'Review comment' });

  openDialog({
    title: `Comment on ${payload.path}`,
    size: 'lg',
    body: h('div', { class: 'dialog-form' },
      h('p', { class: 'text-small text-muted' },
        `Line ${payload.side === 'LEFT' ? payload.oldNo : payload.newNo} (${payload.side === 'LEFT' ? 'original' : 'changed'})`),
      h('pre', { class: 'code-block' }, h('code', {}, String(payload.text == null ? '' : payload.text))),
      body,
      h('p', { class: 'field-help' }, 'Wrap the replacement in ', h('code', { class: 'code-inline' }, '```suggestion'), ' to offer an applicable change.')),
    confirmLabel: 'Add review comment',
    onConfirm: () => {
      const text = body.value.trim();
      if (!text) { toast({ message: 'Write a comment first', variant: 'attention' }); return false; }
      api.addReviewThread(repo.fullName, pull.number, {
        path: payload.path,
        side: payload.side,
        oldNo: payload.oldNo,
        newNo: payload.newNo,
        body: text,
        suggestion: extractSuggestion(text),
      });
      rerender();
      toast({ message: 'Review comment added', variant: 'success' });
      return true;
    },
  });
}

function openReplyDialog(repo, thread) {
  const body = h('textarea', { class: 'input', rows: '5', 'aria-label': 'Reply', placeholder: 'Write a reply…' });
  openDialog({
    title: `Reply on ${thread.path}:${thread.side === 'LEFT' ? thread.oldNo : thread.newNo}`,
    size: 'md',
    body: h('div', { class: 'dialog-form' },
      h('div', { class: 'quote-block' }, markdownNode(thread.body, { repo })),
      body),
    confirmLabel: 'Reply',
    onConfirm: () => {
      const text = body.value.trim();
      if (!text) { toast({ message: 'Write a reply first', variant: 'attention' }); return false; }
      api.replyToThread(thread.id, text);
      rerender();
      toast({ message: 'Reply added', variant: 'success' });
      return true;
    },
  });
}

/* ----------------------------------------------------------------- commits */

function commitsTab(repo, pull) {
  const all = repoCommits(repo, pull.headBranch);
  const baseSet = new Set(repoCommits(repo, pull.baseBranch).map((c) => c.sha));
  const ahead = all.filter((c) => !baseSet.has(c.sha)).slice(0, 60);
  const list = ahead.length ? ahead : all.slice(0, Math.max(1, pull.commits || 1));

  return h('div', { class: 'commits-tab' },
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h2', { class: 'page-title' }, 'Commits'),
        h('p', { class: 'page-subtitle' }, `${list.length} commits from ${pull.headBranch} into ${pull.baseBranch}.`))),
    h('ul', { class: 'commit-list', role: 'list' }, ...list.map((commit) => commitRow(repo, commit, { showFiles: true }))));
}

/* ------------------------------------------------------------------ checks */

function checksTab(repo, pull, checks) {
  const failing = checks.filter((c) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(c.conclusion));
  const pending = checks.filter((c) => c.status !== 'completed');
  const runs = (getDatabase().runs || []).filter((r) => r.repoFullName === repo.fullName && r.headBranch === pull.headBranch);

  const rows = checks.map((check) => h('div', { class: 'check-row' },
    checkStateIcon(check.status, check.conclusion),
    h('div', { class: 'grow' },
      h('span', { class: 'check-name' }, check.name, check.required ? badge('Required', 'accent') : null),
      h('span', { class: 'check-desc' }, `${check.workflowName} · ${check.conclusion || check.status}${check.annotations ? ` · ${check.annotations} annotation${check.annotations === 1 ? '' : 's'}` : ''}`)),
    check.durationMs ? h('span', { class: 'text-small text-muted' }, formatDuration(check.durationMs)) : null,
    h('a', { class: 'btn btn-sm', href: check.detailsUrl || `/${repo.fullName}/actions` }, 'Details')));

  return h('div', { class: 'checks-tab' },
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h2', { class: 'page-title' }, 'Checks'),
        h('p', { class: 'page-subtitle' },
          `${checks.length} checks · ${checks.length - failing.length - pending.length} passed · ${failing.length} failed · ${pending.length} pending`))),
    h('div', { class: `checks-summary ${failing.length ? 'failed' : pending.length ? 'pending' : 'passed'}` },
      icon(failing.length ? 'x-circle' : pending.length ? 'clock' : 'check-circle', { size: 16 }),
      h('div', { class: 'grow' },
        h('div', {}, failing.length ? 'Some checks failed' : pending.length ? 'Some checks have not completed' : 'All checks passed'),
        h('div', { class: 'text-small text-muted' }, `Head ${String(pull.headSha || '').slice(0, 7)} on ${pull.headBranch}`)),
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/actions` }, 'Open Actions')),
    h('div', { class: 'card card-flush check-list' }, ...rows.length ? rows : [h('p', { class: 'text-small text-muted p-3' }, 'No checks reported for this pull request.')]),
    runs.length
      ? h('section', {},
        h('h2', { class: 'section-title' }, 'Workflow runs for this branch', counter(runs.length)),
        h('ul', { class: 'link-list', role: 'list' },
          ...runs.slice(0, 10).map((run) => h('li', {},
            h('a', { href: `/${repo.fullName}/actions/runs/${run.id}` },
              checkStateIcon(run.status, run.conclusion), ` ${run.name} · ${run.displayTitle}`),
            ' ', relativeTimeEl(run.createdAt)))))
      : null);
}

/* ---------------------------------------------------------------- sidebar */

function pullSidebar(repo, pull, data) {
  const { reviews, maintainer, session } = data;
  const db = getDatabase();
  const labels = (pull.labels || []).map((label) => (typeof label === 'string'
    ? { name: label, color: 'd61a2f' }
    : label));
  const milestone = resolveMilestone(pull.milestone);
  const projects = resolveProjects(pull.projects);
  const linkedIssues = (pull.linkedIssues || [])
    .map((ref) => (db.issues || []).find((i) => i.repoFullName === repo.fullName && i.number === Number(ref)))
    .filter(Boolean);

  const openReviewerDialog = () => {
    const candidates = api.collaboratorsFor(repo.fullName);
    const selected = new Set(pull.reviewers || []);
    const list = h('div', { class: 'label-picker', role: 'group', 'aria-label': 'Possible reviewers' },
      ...candidates.map((user) => h('label', { class: 'checkbox-row label-picker-row' },
        h('input', {
          type: 'checkbox', checked: selected.has(user.login) || null,
          onChange: (event) => {
            if (event.target.checked) selected.add(user.login); else selected.delete(user.login);
          },
        }),
        avatar(user, { size: 20 }),
        h('span', {}, ` ${user.login}`))));

    openDialog({
      title: 'Request reviewers',
      body: h('div', { class: 'dialog-form' },
        h('p', { class: 'text-small text-muted' }, `Up to ${LIMITS.maxReviewers || 15} reviewers can be requested.`), list),
      confirmLabel: 'Request reviews',
      onConfirm: () => {
        const record = db.pullRequests.find((p) => p.id === pull.id);
        if (record) record.reviewers = [...selected];
        rerender();
        toast({ message: `Requested review from ${selected.size} ${selected.size === 1 ? 'person' : 'people'}`, variant: 'success' });
        return true;
      },
    });
  };

  return metaSidebar([
    sidebarAssignees(pull.assignees, { repo, kind: 'pull', number: pull.number }),
    sidebarReviewers(pull.reviewers, reviews, { onAdd: maintainer || pull.authorLogin === session.login ? openReviewerDialog : null }),
    sidebarLabels(labels, { repo, kind: 'pull', number: pull.number }),
    sidebarProjects(pull.projects, repo),
    sidebarMilestone(milestone, { repo, kind: 'pull', number: pull.number }),

    sidebarControl('linked-issues',
      linkedIssues.length
        ? h('ul', { class: 'link-list', role: 'list' }, ...linkedIssues.map((issue) => h('li', {},
          h('a', { href: issueHref(repo, issue.number) },
            icon(issue.state === 'closed' ? 'issue-closed' : 'issue-opened', { size: 16 }),
            ` #${issue.number} ${issue.title}`),
          ' ', stateBadge(issue.state))))
        : h('p', { class: 'text-small text-muted' },
          'No linked issues. Use ', h('code', { class: 'code-inline' }, 'Fixes #'), ' in the description to close issues automatically on merge.'),
      { title: `Linked issues${linkedIssues.length ? ` (${linkedIssues.length})` : ''}` }),

    sidebarControl('branches',
      h('div', { class: 'branch-info' },
        h('p', {}, icon('git-branch', { size: 16 }), ' ',
          h('code', { class: 'code-inline' }, pull.headBranch), ' → ', h('code', { class: 'code-inline' }, pull.baseBranch)),
        h('p', { class: 'text-small text-muted' }, 'Head ', h('code', { class: 'code-inline' }, String(pull.headSha || '').slice(0, 7)), ' · Base ', h('code', { class: 'code-inline' }, String(pull.baseSha || '').slice(0, 7))),
        h('div', { class: 'row gap-2' },
          h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/compare/${pull.baseBranch}...${pull.headBranch}` }, 'Compare'),
          h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/commits/${pull.headBranch}` }, 'Branch commits'))),
      { title: 'Branches' }),

    sidebarControl('notifications',
      h('div', {},
        h('p', { class: 'text-small text-muted' }, 'Subscribe to receive notifications about this pull request.'),
        h('button', {
          class: 'btn btn-sm btn-block', type: 'button',
          onClick: () => toast({ message: 'Watching this thread (demo)', variant: 'success' }),
        }, icon('bell', { size: 16 }), 'Subscribe')),
      { title: 'Notifications' }),
  ], { label: 'Pull request metadata' });
}

/* ------------------------------------------------------------------- data */

function prFiles(repo, pull) {
  const seeded = prDiff(pull);
  if (seeded && seeded.length) {
    return seeded.map((file) => ({
      path: file.path,
      oldPath: file.oldPath || null,
      status: file.status || 'modified',
      oldContent: file.oldContent || '',
      newContent: file.newContent || '',
      binary: Boolean(file.binary),
      tooLarge: Boolean(file.tooLarge),
    }));
  }
  // Fallback: build a diff from the commits the pull request claims.
  const all = repoCommits(repo, pull.headBranch);
  const baseSet = new Set(repoCommits(repo, pull.baseBranch).map((c) => c.sha));
  const ahead = all.filter((c) => !baseSet.has(c.sha));
  const map = new Map();
  ahead.slice(0, 8).forEach((commit) => commitDiffFiles(commit).forEach((file) => {
    if (!map.has(file.path)) map.set(file.path, file);
  }));
  return [...map.values()];
}

function openEditPullDialog(repo, pull) {
  const title = h('input', { class: 'input input-lg', type: 'text', value: pull.title, 'aria-label': 'Pull request title' });
  const body = h('textarea', { class: 'input', rows: '12', 'aria-label': 'Pull request body' });
  body.value = pull.body || '';

  openDialog({
    title: `Edit pull request #${pull.number}`,
    size: 'lg',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), title),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Body'), body)),
    confirmLabel: 'Save',
    onConfirm: () => {
      const value = title.value.trim();
      if (!value) { toast({ message: 'A title is required', variant: 'attention' }); return false; }
      const record = (getDatabase().pullRequests || []).find((p) => p.id === pull.id);
      if (record) { record.title = value; record.body = body.value; record.updatedAt = new Date().toISOString(); }
      rerender();
      toast({ message: 'Pull request updated', variant: 'success' });
      return true;
    },
  });
}

export default { render, renderCommits, renderChecks, renderFiles };
