/**
 * RedGet — diff engine + diff viewer.
 *
 * computeDiff() implements a line-level LCS diff (Myers-style dynamic program with
 * a fallback for very large inputs) and produces the classic unified patch model:
 *
 *   { files: [{ path, oldPath, status, additions, deletions, hunks: [{ oldStart,
 *     oldLines, newStart, newLines, lines: [{ type: 'context'|'add'|'del'|'hunk',
 *     oldNo, newNo, text }] }] }] }
 *
 * renderDiff() turns that model into the DOM used by pull requests and commits:
 *
 *   <div class="diff" data-view="unified|split">
 *     <div class="diff-toolbar"> unified/split toggle · whitespace · diffstat </div>
 *     <div class="diff-file" id="diff-<slug>">
 *       <div class="diff-file-header"> path · +N −N · collapse · viewed · raw </div>
 *       <div class="diff-file-body">
 *         <table class="diff"><tbody>
 *           <tr class="line-hunk"><td colspan="4">@@ -1,4 +1,5 @@</td></tr>
 *           <tr class="line-add"><td class="line-num">…<td class="line-num">…
 *             <td class="code-cell"><span class="line-add">…</span></td></tr>
 *           <tr class="line-del">…</tr>  <tr class="line-context">…</tr>
 *         </tbody></table>
 *       </div>
 *     </div>
 *   </div>
 */

import { h } from '../core/dom.js';
import { icon, qs } from '../core/dom.js';
import { escapeHtml, slugify, clamp, formatBytes } from '../core/util.js';
import { highlight, languageForPath, normalizeLanguage } from './highlight.js';
import { t } from '../core/i18n.js';
import { toast, toastSuccess, copyButton, openDialog, confirmDialog } from './overlay.js';
import { getPrefs, setPref, mutate } from '../core/store.js';

const MAX_CELLS = 4_000_000; // guard for the O(n*m) LCS table

/* ==========================================================================
   Diff computation
   ========================================================================== */

/** Trim shared prefix/suffix — the usual real-world win. */
function trimCommon(a, b) {
  let start = 0;
  const maxStart = Math.min(a.length, b.length);
  while (start < maxStart && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  return { start, endA, endB };
}

function lcsDiff(aLines, bLines) {
  const n = aLines.length;
  const m = bLines.length;
  const ops = [];
  if (n * m > MAX_CELLS) {
    // Too large for the full table: fall back to a block replace.
    aLines.forEach((text) => ops.push({ type: 'del', text }));
    bLines.forEach((text) => ops.push({ type: 'add', text }));
    return ops;
  }
  const dp = new Uint32Array((n + 1) * (m + 1));
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[at(i, j)] = aLines[i] === bLines[j]
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) { ops.push({ type: 'context', text: aLines[i] }); i += 1; j += 1; } else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) { ops.push({ type: 'del', text: aLines[i] }); i += 1; } else { ops.push({ type: 'add', text: bLines[j] }); j += 1; }
  }
  while (i < n) { ops.push({ type: 'del', text: aLines[i] }); i += 1; }
  while (j < m) { ops.push({ type: 'add', text: bLines[j] }); j += 1; }
  return ops;
}

/** Word-level diff between two lines, returned as [{type,text}] segments. */
/** Build a <span> whose content is trusted, already-escaped HTML. */
export function htmlSpan(html, options = {}) {
  const node = h(options.tag || 'span', options.attrs || {});
  node.innerHTML = html == null ? '' : String(html);
  return node;
}

export function wordDiff(oldLine, newLine) {
  const tokenize = (line) => String(line || '').match(/[\w$]+|[^\s\w$]|\s+/g) || [];
  const a = tokenize(oldLine);
  const b = tokenize(newLine);
  const ops = lcsDiff(a, b);
  return ops;
}

/** Group ops into hunks with `context` lines on each side. */
function buildHunks(ops, context = 3) {
  const hunks = [];
  const changeIndexes = [];
  ops.forEach((op, index) => { if (op.type !== 'context') changeIndexes.push(index); });
  if (changeIndexes.length === 0) return hunks;

  let oldNo = 1;
  let newNo = 1;
  let cursor = 0;
  let current = null;

  const flush = () => {
    if (current && current.lines.length) hunks.push(current);
    current = null;
  };

  for (const changeIndex of changeIndexes) {
    const from = Math.max(cursor, changeIndex - context);
    if (!current || from > cursor) {
      flush();
      // Recompute line numbers up to `from`.
      let o = 1; let n = 1;
      for (let k = 0; k < from; k += 1) {
        if (ops[k].type !== 'add') o += 1;
        if (ops[k].type !== 'del') n += 1;
      }
      oldNo = o; newNo = n;
      current = { oldStart: oldNo, newStart: newNo, oldLines: 0, newLines: 0, lines: [], startIndex: from };
    }
    // Add skipped context lines between this change and the last emitted index.
    for (let k = cursor; k < from; k += 1) {
      const op = ops[k];
      current.lines.push({ type: 'context', text: op.text, oldNo, newNo });
      oldNo += 1; newNo += 1;
      current.oldLines += 1; current.newLines += 1;
    }
    cursor = from;
    // Emit contiguous block: all ops from cursor until `context` consecutive context lines.
    let runContext = 0;
    while (cursor < ops.length) {
      const op = ops[cursor];
      if (op.type === 'context') {
        runContext += 1;
        const nextChange = changeIndexes.find((ci) => ci > cursor);
        if (runContext >= context && (nextChange === undefined || nextChange - cursor > context)) {
          // Include up to `context` trailing context lines then stop.
          const trailing = Math.min(context, ops.length - cursor);
          for (let k = 0; k < trailing; k += 1) {
            const tOp = ops[cursor + k];
            current.lines.push({ type: 'context', text: tOp.text, oldNo, newNo });
            oldNo += 1; newNo += 1;
            current.oldLines += 1; current.newLines += 1;
          }
          cursor += trailing;
          break;
        }
        current.lines.push({ type: 'context', text: op.text, oldNo, newNo });
        oldNo += 1; newNo += 1;
        current.oldLines += 1; current.newLines += 1;
        cursor += 1;
      } else {
        runContext = 0;
        current.lines.push({
          type: op.type,
          text: op.text,
          oldNo: op.type === 'add' ? null : oldNo,
          newNo: op.type === 'del' ? null : newNo,
        });
        if (op.type === 'del') oldNo += 1; else newNo += 1;
        if (op.type === 'del') current.oldLines += 1; else current.newLines += 1;
        cursor += 1;
      }
    }
  }
  flush();
  return hunks;
}

/**
 * Diff two file contents.
 * @returns {{path,status,additions,deletions,hunks,oldLines,newLines,binary,tooLarge}}
 */
export function computeFileDiff(file) {
  const {
    path, oldPath = null, oldContent = '', newContent = '', status = 'modified',
    binary = false, tooLarge = false,
  } = file;

  if (binary || tooLarge) {
    return { path, oldPath, status, additions: 0, deletions: 0, hunks: [], binary, tooLarge, oldLines: 0, newLines: 0 };
  }

  const a = String(oldContent == null ? '' : oldContent).split('\n');
  const b = String(newContent == null ? '' : newContent).split('\n');
  if (a.length === 1 && a[0] === '' && status === 'added') a.length = 0;
  if (b.length === 1 && b[0] === '' && status === 'removed') b.length = 0;

  const { start, endA, endB } = trimCommon(a, b);
  const headContext = a.slice(Math.max(0, start - 3), start);
  const tailContext = a.slice(endA, Math.min(a.length, endA + 3));
  const ops = [];
  headContext.forEach((text, i) => ops.push({ type: 'context', text }));
  lcsDiff(a.slice(start, endA), b.slice(start, endB)).forEach((op) => ops.push(op));
  tailContext.forEach((text) => ops.push({ type: 'context', text }));

  const hunks = buildHunks(ops, 3);
  // Fix hunk start numbers when we prepended head context.
  let oldCursor = Math.max(1, start - headContext.length + 1);
  let newCursor = Math.max(1, start - headContext.length + 1);
  hunks.forEach((hunk) => {
    hunk.oldStart = oldCursor;
    hunk.newStart = newCursor;
    hunk.lines.forEach((line) => {
      line.oldNo = line.type === 'add' ? null : oldCursor;
      line.newNo = line.type === 'del' ? null : newCursor;
      if (line.type !== 'add') oldCursor += 1;
      if (line.type !== 'del') newCursor += 1;
    });
  });

  let additions = 0;
  let deletions = 0;
  hunks.forEach((hunk) => hunk.lines.forEach((line) => {
    if (line.type === 'add') additions += 1;
    if (line.type === 'del') deletions += 1;
  }));

  return {
    path, oldPath, status, additions, deletions, hunks, binary, tooLarge,
    oldLines: a.length, newLines: b.length,
  };
}

export function computeDiff(files) {
  const diffs = (files || []).map(computeFileDiff);
  const additions = diffs.reduce((acc, d) => acc + d.additions, 0);
  const deletions = diffs.reduce((acc, d) => acc + d.deletions, 0);
  return {
    files: diffs,
    additions,
    deletions,
    changed: diffs.length,
    total: additions + deletions,
  };
}

/** Serialize a diff back into unified patch text (for "Copy patch" / raw logs). */
export function toUnifiedPatch(diff, options = {}) {
  const { context = 3 } = options;
  const out = [];
  diff.files.forEach((file) => {
    out.push(`diff --git a/${file.oldPath || file.path} b/${file.path}`);
    if (file.status === 'added') out.push('new file mode 100644');
    if (file.status === 'removed') out.push('deleted file mode 100644');
    if (file.status === 'renamed') out.push(`rename from ${file.oldPath}\nrename to ${file.path}`);
    out.push(`--- ${file.status === 'added' ? '/dev/null' : `a/${file.oldPath || file.path}`}`);
    out.push(`+++ ${file.status === 'removed' ? '/dev/null' : `b/${file.path}`}`);
    file.hunks.forEach((hunk) => {
      out.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
      hunk.lines.forEach((line) => {
        const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
        out.push(`${prefix}${line.text}`);
      });
    });
    void context;
  });
  return out.join('\n');
}

/** Parse unified patch text back into a diff model (used by the compare page). */
export function parseUnifiedPatch(patch) {
  const lines = String(patch || '').split('\n');
  const files = [];
  let current = null;
  let hunk = null;
  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      current = { path: '', status: 'modified', additions: 0, deletions: 0, hunks: [], binary: false, tooLarge: false };
      files.push(current);
      hunk = null;
      const match = /diff --git a\/(.+) b\/(.+)$/.exec(line);
      if (match) current.path = match[2];
      continue;
    }
    if (!current) continue;
    if (line.startsWith('--- ')) {
      const value = line.slice(4).trim();
      if (value !== '/dev/null') current.oldPath = value.replace(/^a\//, '');
      else current.status = 'added';
      continue;
    }
    if (line.startsWith('+++ ')) {
      const value = line.slice(4).trim();
      if (value === '/dev/null') current.status = 'removed';
      else current.path = value.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      hunk = {
        oldStart: match ? Number(match[1]) : 1,
        oldLines: match && match[2] ? Number(match[2]) : 0,
        newStart: match ? Number(match[3]) : 1,
        newLines: match && match[4] ? Number(match[4]) : 0,
        lines: [],
      };
      current.hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('+')) {
      hunk.lines.push({ type: 'add', text: line.slice(1), oldNo: null, newNo: hunk.newStart + hunk.lines.filter((l) => l.type !== 'del').length });
      current.additions += 1;
    } else if (line.startsWith('-')) {
      hunk.lines.push({ type: 'del', text: line.slice(1), oldNo: hunk.oldStart + hunk.lines.filter((l) => l.type !== 'add').length, newNo: null });
      current.deletions += 1;
    } else if (line.startsWith(' ') || line === '') {
      hunk.lines.push({ type: 'context', text: line.slice(1), oldNo: null, newNo: null });
    }
  }
  const additions = files.reduce((acc, f) => acc + f.additions, 0);
  const deletions = files.reduce((acc, f) => acc + f.deletions, 0);
  return { files, additions, deletions, changed: files.length, total: additions + deletions };
}

/* ==========================================================================
   Rendering
   ========================================================================== */

function diffStatBlocks(additions, deletions, total) {
  const blocks = clamp(Math.ceil((additions + deletions) / Math.max(1, total) * 5), 1, 5);
  const addBlocks = additions === 0 && deletions === 0 ? 0 : Math.max(additions > 0 ? 1 : 0, Math.round((additions / (additions + deletions)) * blocks));
  const delBlocks = Math.max(0, blocks - addBlocks);
  const nodes = [];
  for (let i = 0; i < addBlocks; i += 1) nodes.push(h('i', { class: 'add' }));
  for (let i = 0; i < delBlocks; i += 1) nodes.push(h('i', { class: 'del' }));
  for (let i = nodes.length; i < 5; i += 1) nodes.push(h('i'));
  return h('span', { class: 'diffstat-blocks', 'aria-hidden': 'true' }, nodes);
}

export function diffStat(additions, deletions, options = {}) {
  const { showNumbers = true } = options;
  return h('span', {
    class: 'diffstat',
    'aria-label': `${additions} additions and ${deletions} deletions`,
  },
  showNumbers ? h('span', { class: 'diffstat-add' }, `+${additions}`) : null,
  showNumbers ? h('span', { class: 'diffstat-del' }, `−${deletions}`) : null,
  diffStatBlocks(additions, deletions, Math.max(1, additions + deletions)));
}

function statusLabel(status) {
  switch (status) {
    case 'added': return 'Added';
    case 'removed': return 'Deleted';
    case 'renamed': return 'Renamed';
    case 'copied': return 'Copied';
    case 'type-changed': return 'Type changed';
    default: return 'Modified';
  }
}

function statusBadge(status) {
  const map = {
    added: ['badge-success', 'file-added'],
    removed: ['badge-danger', 'trash'],
    renamed: ['badge-attention', 'file-submodule'],
    copied: ['badge-attention', 'copy'],
    modified: ['badge-accent', 'pencil'],
  };
  const [cls, iconName] = map[status] || map.modified;
  return h('span', { class: `badge ${cls}` }, icon(iconName, { size: 12 }), statusLabel(status));
}

/** Render a single hunk's rows for the unified view. */
function renderUnifiedHunk(hunk, options) {
  const { language, showWhitespace, comments, onAddComment, viewed, repo, sha } = options;
  const rows = [];
  rows.push(h('tr', { class: 'line-hunk' },
    h('td', { class: 'line-num', colSpan: '2', 'aria-hidden': 'true' }, ''),
    h('td', { class: 'code-cell', colSpan: '2' }, `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`)));

  hunk.lines.forEach((line) => {
    const cls = line.type === 'add' ? 'line-add' : line.type === 'del' ? 'line-del' : 'line-context';
    const marker = line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' ';
    let codeHtml = highlight(line.text, language);
    if (showWhitespace) {
      codeHtml = codeHtml
        .replace(/( +)$/g, (m) => `<span class="tok-constant">${'·'.repeat(m.length)}</span>`)
        .replace(/\t/g, '<span class="tok-constant">⇥</span>');
    }
    const row = h('tr', {
      class: [cls, viewed ? 'is-viewed' : ''].filter(Boolean).join(' '),
      dataset: { oldNo: line.oldNo || '', newNo: line.newNo || '', type: line.type },
      id: line.newNo ? `diff-${sha}-R${line.newNo}` : (line.oldNo ? `diff-${sha}-L${line.oldNo}` : undefined),
    },
    h('td', { class: 'line-num', 'aria-hidden': 'true', title: line.oldNo ? `Old line ${line.oldNo}` : '' }, line.oldNo != null ? String(line.oldNo) : ''),
    h('td', { class: 'line-num', 'aria-hidden': 'true', title: line.newNo ? `New line ${line.newNo}` : '' }, line.newNo != null ? String(line.newNo) : ''),
    h('td', { class: 'code-cell diff-comment-anchor' },
      h('span', { class: 'sr-only' }, `${marker} `),
      htmlSpan(codeHtml || '&nbsp;', { attrs: { class: cls } }),
      onAddComment && line.type !== 'hunk'
        ? h('button', {
          class: 'add-line-comment', type: 'button', 'aria-label': 'Add line comment',
          'data-tooltip': 'Add a comment on this line',
          onClick: (event) => {
            event.stopPropagation();
            onAddComment({
              path: options.path, side: line.type === 'del' ? 'LEFT' : 'RIGHT',
              oldNo: line.oldNo, newNo: line.newNo, text: line.text, anchor: row,
            });
          },
        }, icon('plus', { size: 12 }))
        : null));
    rows.push(row);

    // Inline review comments attached to this line.
    const lineComments = (comments || []).filter((c) => matchesLine(c, line, options.path));
    lineComments.forEach((comment) => {
      rows.push(h('tr', {}, h('td', { colSpan: '4', style: { padding: '0' } }, renderInlineComment(comment, options))));
    });
  });
  return rows;
}

function matchesLine(comment, line, path) {
  if (!comment || !comment.path) return false;
  if (comment.path !== path) return false;
  if (comment.side === 'LEFT') return comment.oldNo != null && comment.oldNo === line.oldNo && line.type !== 'add';
  return comment.newNo != null && comment.newNo === line.newNo && line.type !== 'del';
}

/** Split view: two side-by-side tables built from the same hunks. */
function renderSplitHunk(hunk, options) {
  const { language, showWhitespace, viewed } = options;
  const rows = [];
  rows.push(h('tr', { class: 'line-hunk' },
    h('td', { class: 'line-num' }, ''),
    h('td', { class: 'code-cell' }, `@@ -${hunk.oldStart},${hunk.oldLines}`),
    h('td', { class: 'split-divider', 'aria-hidden': 'true' }, ''),
    h('td', { class: 'line-num' }, ''),
    h('td', { class: 'code-cell' }, `@@ +${hunk.newStart},${hunk.newLines} @@`)));

  // Pair deletions with additions so the two columns line up.
  const left = [];
  const right = [];
  let pendingDel = [];
  hunk.lines.forEach((line) => {
    if (line.type === 'del') { pendingDel.push(line); return; }
    if (line.type === 'add') {
      const partner = pendingDel.shift();
      left.push(partner || { type: 'empty' });
      right.push(line);
      return;
    }
    while (pendingDel.length) { left.push(pendingDel.shift()); right.push({ type: 'empty' }); }
    left.push(line);
    right.push(line);
  });
  while (pendingDel.length) { left.push(pendingDel.shift()); right.push({ type: 'empty' }); }

  const cellHtml = (line) => {
    if (line.type === 'empty') return '';
    let html = highlight(line.text, language);
    if (showWhitespace) {
      html = html.replace(/( +)$/g, (m) => `<span class="tok-constant">${'·'.repeat(m.length)}</span>`).replace(/\t/g, '<span class="tok-constant">⇥</span>');
    }
    return html || '&nbsp;';
  };

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] || { type: 'empty' };
    const r = right[i] || { type: 'empty' };
    const lClass = l.type === 'del' ? 'line-del' : l.type === 'context' ? 'line-context' : 'line-empty';
    const rClass = r.type === 'add' ? 'line-add' : r.type === 'context' ? 'line-context' : 'line-empty';
    rows.push(h('tr', { class: [viewed ? 'is-viewed' : ''].filter(Boolean).join(' ') },
      h('td', { class: 'line-num', 'aria-hidden': 'true' }, l.oldNo != null ? String(l.oldNo) : ''),
      h('td', { class: `code-cell ${lClass}` }, htmlSpan(cellHtml(l))),
      h('td', { class: 'split-divider', 'aria-hidden': 'true' }, ''),
      h('td', { class: 'line-num', 'aria-hidden': 'true' }, r.newNo != null ? String(r.newNo) : ''),
      h('td', { class: `code-cell ${rClass}` }, htmlSpan(cellHtml(r)))));
  }
  return rows;
}

export function renderInlineComment(comment, options = {}) {
  const { onReply = null, onResolve = null, onApplySuggestion = null, onEdit = null, onDelete = null } = options;
  const body = h('div', { class: 'review-comment-body' });
  const md = h('div', { class: 'markdown-body compact' });
  md.innerHTML = renderCommentBody(comment.body || '');
  body.appendChild(md);

  if (comment.suggestion) {
    body.appendChild(h('div', { class: 'suggested-change' },
      h('div', { class: 'suggested-change-header' }, icon('light-bulb', { size: 14 }), ' Suggested change'),
      h('pre', {}, htmlSpan(highlight(comment.suggestion, options.language || 'text'), { tag: 'code' })),
      onApplySuggestion && !comment.suggestionApplied
        ? h('div', { class: 'row gap-2 p-2' },
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => onApplySuggestion(comment) }, 'Apply suggestion'),
          h('button', { class: 'btn btn-sm', type: 'button', onClick: () => onApplySuggestion(comment, true) }, 'Add suggestion to batch'))
        : comment.suggestionApplied
          ? h('div', { class: 'row gap-2 p-2 text-small text-success' }, icon('check-circle', { size: 14 }), ' Suggestion applied')
          : null));
  }

  if (comment.replies && comment.replies.length) {
    comment.replies.forEach((reply) => {
      const replyBody = h('div', { class: 'markdown-body compact' });
      replyBody.innerHTML = renderCommentBody(reply.body || '');
      body.appendChild(h('div', { class: 'comment mt-3', style: { borderLeft: '2px solid var(--border-accent-muted)' } },
        h('div', { class: 'comment-header' },
          h('strong', {}, reply.authorLogin),
          h('span', {}, ' replied '),
          h('time', { datetime: reply.createdAt, title: reply.createdAt }, relativeLabel(reply.createdAt))),
        h('div', { class: 'comment-body' }, replyBody)));
    });
  }

  const node = h('div', {
    class: ['review-comment', comment.resolved ? 'is-resolved' : ''].filter(Boolean).join(' '),
    dataset: { commentId: comment.id },
  },
  h('div', { class: 'review-comment-header' },
    h('strong', {}, comment.authorLogin),
    h('span', { class: 'text-muted' }, comment.resolved ? ' · resolved this conversation' : ` commented on line ${comment.side === 'LEFT' ? comment.oldNo : comment.newNo}`),
    h('time', { class: 'text-muted', datetime: comment.createdAt, title: comment.createdAt }, relativeLabel(comment.createdAt)),
    h('span', { class: 'ml-auto row gap-1' },
      comment.resolved
        ? (onResolve ? h('button', { class: 'btn btn-xs', type: 'button', onClick: () => onResolve(comment, false) }, 'Unresolve') : null)
        : (onResolve ? h('button', { class: 'btn btn-xs', type: 'button', onClick: () => onResolve(comment, true) }, icon('check', { size: 12 }), ' Resolve') : null),
      onReply ? h('button', { class: 'btn btn-xs btn-invisible', type: 'button', onClick: () => onReply(comment) }, icon('reply', { size: 12 }), ' Reply') : null,
      onEdit ? h('button', { class: 'btn btn-xs btn-invisible', type: 'button', 'aria-label': 'Edit comment', onClick: () => onEdit(comment) }, icon('pencil', { size: 12 })) : null,
      onDelete ? h('button', { class: 'btn btn-xs btn-invisible', type: 'button', 'aria-label': 'Delete comment', onClick: () => onDelete(comment) }, icon('trash', { size: 12 })) : null)));
  node.appendChild(body);
  if (comment.resolved) {
    node.insertBefore(h('div', { class: 'comment-minimized-note' }, 'This conversation was marked as resolved.'), body);
  }
  return node;
}

function relativeLabel(iso) {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Escape + minimal markdown for one-line comment bodies inside diffs. */
export function renderCommentBody(body) {
  const escaped = escapeHtml(String(body || ''));
  return escaped
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|\s)\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/@([a-zA-Z0-9-]+)/g, '<a class="user-mention" href="/$1">@$1</a>')
    .replace(/\n/g, '<br>');
}

/**
 * Render the full diff UI.
 * @param {object} diff model from computeDiff()
 * @param {object} options { repo, sha, comments, view, showWhitespace, onAddComment, … }
 */
export function renderDiff(diff, options = {}) {
  const prefs = getPrefs();
  const {
    repo = null, sha = '', comments = [], onAddComment = null, onResolve = null,
    onApplySuggestion = null, onViewedChange = null, onReply = null,
    allowToggle = true, filter = '', initialView = null,
  } = options;

  const state = {
    view: initialView || prefs.diffView || 'unified',
    whitespace: prefs.showWhitespace || false,
    filter: filter || '',
    viewed: new Set(),
    collapsed: new Set(),
  };

  const root = h('div', { class: 'diff', dataset: { view: state.view } });

  const files = diff.files.filter((file) => !state.filter
    || file.path.toLowerCase().includes(state.filter.toLowerCase()));

  /* ---- toolbar -------------------------------------------------------- */
  const viewToggle = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Diff display mode' },
    h('button', {
      type: 'button', 'aria-pressed': String(state.view === 'unified'),
      onClick: () => setView('unified'),
    }, icon('unified', { size: 14 }), ' Unified'),
    h('button', {
      type: 'button', 'aria-pressed': String(state.view === 'split'),
      onClick: () => setView('split'),
    }, icon('split', { size: 14 }), ' Split'));

  const whitespaceBtn = h('button', {
    class: 'btn btn-sm', type: 'button', 'aria-pressed': String(state.whitespace),
    onClick: () => {
      state.whitespace = !state.whitespace;
      whitespaceBtn.setAttribute('aria-pressed', String(state.whitespace));
      setPref('showWhitespace', state.whitespace);
      rerender();
    },
  }, 'Whitespace: ', h('strong', {}, state.whitespace ? 'shown' : 'ignored'));

  const toolbar = h('div', { class: 'diff-toolbar' },
    h('span', { class: 'text-muted' }, `${diff.changed} changed file${diff.changed === 1 ? '' : 's'}`),
    diffStat(diff.additions, diff.deletions),
    h('span', { class: 'spacer' }),
    allowToggle ? viewToggle : null,
    whitespaceBtn,
    h('input', {
      type: 'search', class: 'input-sm', placeholder: 'Filter files…',
      'aria-label': 'Filter changed files', style: { width: '180px' },
      value: state.filter,
      onInput: (event) => { state.filter = event.target.value; rerender(); },
    }));

  root.appendChild(toolbar);

  /* ---- files ---------------------------------------------------------- */
  const filesWrap = h('div', { class: 'diff-files' });
  root.appendChild(filesWrap);

  function setView(view) {
    state.view = view;
    setPref('diffView', view);
    root.dataset.view = view;
    viewToggle.querySelectorAll('button').forEach((button, index) => {
      button.setAttribute('aria-pressed', String((index === 0 && view === 'unified') || (index === 1 && view === 'split')));
    });
    rerender();
  }

  function rerender() {
    filesWrap.replaceChildren(...files.filter((file) => !state.filter
      || file.path.toLowerCase().includes(state.filter.toLowerCase())).map((file) => renderFile(file)));
    if (files.filter((file) => !state.filter || file.path.toLowerCase().includes(state.filter.toLowerCase())).length === 0) {
      filesWrap.appendChild(h('section', { class: 'empty-state empty-state-sm' },
        h('p', {}, 'No files match that filter.')));
    }
  }

  function renderFile(file) {
    const id = `diff-${slugify(file.path)}`;
    const language = normalizeLanguage(languageForPath(file.path));
    const isCollapsed = state.collapsed.has(file.path);
    const isViewed = state.viewed.has(file.path);

    const header = h('div', { class: 'diff-file-header' },
      h('button', {
        class: 'btn btn-xs btn-invisible', type: 'button',
        'aria-expanded': String(!isCollapsed), 'aria-controls': `${id}-body`,
        'aria-label': isCollapsed ? 'Expand file diff' : 'Collapse file diff',
        onClick: () => {
          if (isCollapsed) state.collapsed.delete(file.path); else state.collapsed.add(file.path);
          rerender();
        },
      }, icon(isCollapsed ? 'chevron-right' : 'chevron-down', { size: 14 })),
      h('a', { class: 'file-path', href: repo ? `/${repo.ownerLogin}/${repo.name}/blob/${repo.defaultBranch}/${file.path}` : '#', title: file.path }, file.path),
      file.oldPath && file.oldPath !== file.path ? h('span', { class: 'text-muted text-small' }, `(from ${file.oldPath})`) : null,
      statusBadge(file.status),
      diffStat(file.additions, file.deletions),
      h('span', { class: 'file-actions' },
        h('label', { class: 'row gap-1 text-small text-muted nowrap', style: { cursor: 'pointer' } },
          h('input', {
            type: 'checkbox', checked: isViewed || undefined,
            'aria-label': `Mark ${file.path} as viewed`,
            onChange: (event) => {
              if (event.target.checked) state.viewed.add(file.path); else state.viewed.delete(file.path);
              rerender();
              if (onViewedChange) onViewedChange(file.path, event.target.checked);
            },
          }), 'Viewed'),
        copyButton(() => file.path, { cls: 'btn btn-xs btn-invisible', tooltipText: 'Copy path' }),
        repo ? h('a', {
          class: 'btn btn-xs btn-invisible', href: `/${repo.ownerLogin}/${repo.name}/blob/${repo.defaultBranch}/${file.path}`,
          'aria-label': `View ${file.path}`,
        }, icon('file', { size: 12 })) : null));

    const body = h('div', { class: 'diff-file-body', id: `${id}-body`, hidden: isCollapsed || undefined });

    if (file.binary) {
      body.appendChild(h('div', { class: 'blob-binary' },
        h('p', {}, icon('image', { size: 24 }), ' Binary file not shown.'),
        h('p', { class: 'text-small text-muted' }, 'Use the Rich diff or image diff view for rendered assets.')));
    } else if (file.tooLarge) {
      body.appendChild(h('div', { class: 'blob-too-large' },
        h('p', {}, 'This diff is too large to display inline.'),
        h('div', { class: 'row gap-2 row-center' },
          h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toast({ title: 'Loading full diff', message: `${file.path} (${formatBytes(file.newLines * 40)})`, variant: 'info' }) }, 'View the whole file'),
          h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toast({ title: 'Rich diff', message: 'Rendered/rich diff is not available for this file type.', variant: 'attention' }) }, 'Rich diff'))));
    } else if (file.hunks.length === 0) {
      body.appendChild(h('div', { class: 'blob-binary' }, h('p', { class: 'text-muted' }, 'No content changes detected (metadata-only change).')));
    } else {
      const table = h('table', { class: 'diff', dataset: { view: state.view } });
      const tbody = h('tbody');
      file.hunks.forEach((hunk) => {
        const rows = state.view === 'split'
          ? renderSplitHunk(hunk, { language, showWhitespace: state.whitespace, viewed: isViewed })
          : renderUnifiedHunk(hunk, {
            language, showWhitespace: state.whitespace, viewed: isViewed, comments,
            onAddComment: onAddComment && !isViewed ? (payload) => onAddComment({ ...payload, sha }) : null,
            path: file.path, repo, sha,
          });
        rows.forEach((row) => tbody.appendChild(row));
      });
      table.appendChild(tbody);
      body.appendChild(table);

      const fileComments = (comments || []).filter((c) => c.path === file.path && c.newNo == null && c.oldNo == null);
      if (fileComments.length) {
        fileComments.forEach((comment) => {
          body.appendChild(renderInlineComment(comment, { language, onResolve, onApplySuggestion, onReply }));
        });
      }
    }

    const footer = h('div', { class: 'diff-file-meta' },
      h('span', {}, `${file.oldLines} → ${file.newLines} lines`),
      h('span', {}, `${file.hunks.length} hunk${file.hunks.length === 1 ? '' : 's'}`),
      h('span', {}, language),
      h('button', {
        class: 'btn-link text-small ml-auto', type: 'button',
        onClick: () => toast({ title: 'Diff settings', message: `Whitespace ${state.whitespace ? 'shown' : 'ignored'} · ${state.view} view · context 3 lines`, variant: 'info' }),
      }, 'Diff settings'));

    return h('div', { class: ['diff-file', isCollapsed ? 'is-collapsed' : ''].filter(Boolean).join(' '), id },
      header, body, footer);
  }

  rerender();
  return root;
}

/** Line-comment composer opened from the "+" gutter button. */
export function openLineCommentDialog(payload, options = {}) {
  const { onSubmit = null } = options;
  const textarea = h('textarea', {
    class: 'w-100', rows: '4', placeholder: 'Leave a comment. Use Markdown, @mentions and `suggestion` blocks.',
    'aria-label': 'Comment body', 'data-autofocus': 'true',
  });
  const side = payload.side === 'LEFT' ? `old line ${payload.oldNo}` : `new line ${payload.newNo}`;
  return openDialog({
    title: `Comment on ${payload.path}`,
    size: 'lg',
    confirmLabel: 'Add single comment',
    body: h('div', {},
      h('div', { class: 'code-search-match' },
        h('code', {}, `${payload.text == null ? '' : payload.text}`)),
      h('p', { class: 'text-small text-muted' }, `Commenting on ${side}.`),
      textarea),
    onConfirm: () => {
      const body = textarea.value.trim();
      if (!body) { toast({ title: 'Comment is empty', message: 'Write something before submitting.', variant: 'attention' }); return false; }
      const suggestion = extractSuggestion(body);
      if (onSubmit) {
        onSubmit({
          ...payload, body, suggestion: suggestion || null,
          createdAt: new Date().toISOString(), resolved: false,
        });
      }
      toastSuccess('Comment added to the pending review.');
      return true;
    },
  });
}

/** Extract a ```suggestion block from a comment body. */
export function extractSuggestion(body) {
  const match = /```suggestion\n([\s\S]*?)```/.exec(String(body || ''));
  return match ? match[1].replace(/\n$/, '') : null;
}

/** Full-screen review diff dialog for a single file. */
export function openFileDiffDialog(file, options = {}) {
  const single = { files: [file], additions: file.additions, deletions: file.deletions, changed: 1, total: file.additions + file.deletions };
  return openDialog({
    title: file.path,
    size: 'full',
    hideFooter: true,
    body: renderDiff(single, { ...options, allowToggle: true }),
  });
}

/** Apply a suggested change to a file's content in the mock database. */
export function applySuggestion(comment, repo, fileContent, lineNumber) {
  if (!comment.suggestion) return fileContent;
  const lines = String(fileContent).split('\n');
  const index = clamp((lineNumber || comment.newNo || 1) - 1, 0, lines.length);
  lines.splice(index, 1, ...comment.suggestion.split('\n'));
  mutate((db) => {
    const entry = db.comments.find((c) => c.id === comment.id);
    if (entry) entry.suggestionApplied = true;
  }, 'comments');
  return lines.join('\n');
}

export { qs };

export default {
  computeDiff, computeFileDiff, wordDiff, renderDiff, diffStat, toUnifiedPatch,
  parseUnifiedPatch, renderInlineComment, renderCommentBody, openLineCommentDialog,
  extractSuggestion, openFileDiffDialog, applySuggestion,
};
