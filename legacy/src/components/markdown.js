/**
 * RedGet — markdown renderer.
 *
 * A self-contained Markdown → DOM implementation with RedGet flavour:
 *   - ATX headings with anchors, thematic breaks, paragraphs
 *   - fenced code blocks (```lang) rendered through the syntax highlighter,
 *     with a copy button and a language chip
 *   - inline code, bold, italic, strikethrough, links, images, autolinks
 *   - ordered / unordered / nested lists and GFM task lists (- [x])
 *   - GFM tables with alignment, footnotes ([^1] … [^1]: …)
 *   - blockquotes, <details>/<summary>, and GitHub-style alerts
 *     (> [!NOTE] / TIP / IMPORTANT / WARNING / CAUTION)
 *   - @mentions, #123 / owner/repo#123 cross references, 7–40 char commit SHAs
 *   - :emoji: shortcodes
 *
 * Safety: input text is always HTML-escaped before being inserted. The only
 * innerHTML assignments receive markup produced here, and code spans are
 * extracted into a placeholder table first so their content can never be
 * re-interpreted as markdown or HTML.
 */

import { h } from '../core/dom.js';
import { highlight, normalizeLanguage } from './highlight.js';
import { escapeHtml, slugify, shortId } from '../core/util.js';
import { copyButton } from './overlay.js';

const EMOJI = {
  '+1': '👍', '-1': '👎', '100': '💯', tada: '🎉', fire: '🔥', bug: '🐛',
  sparkles: '✨', rocket: '🚀', warning: '⚠️', bulb: '💡', memo: '📝',
  book: '📖', lock: '🔒', key: '🔑', wrench: '🔧', hammer: '🔨', gear: '⚙️',
  zap: '⚡', star: '⭐', star2: '🌟', heart: '❤️', broken_heart: '💔',
  eyes: '👀', thinking: '🤔', wave: '👋', clap: '👏', muscle: '💪',
  pray: '🙏', skull: '💀', ghost: '👻', alien: '👽', robot: '🤖',
  cat: '🐱', dog: '🐶', octopus: '🐙', unicorn: '🦄', penguin: '🐧',
  apple: '🍎', banana: '🍌', pizza: '🍕', coffee: '☕', beer: '🍺',
  check: '✅', x: '❌', question: '❓', exclamation: '❗', bangbang: '‼️',
  bell: '🔔',bookmark: '🔖', link: '🔗', package: '📦', truck: '🚚',
  shield: '🛡️', sword: '⚔️', trophy: '🏆', medal: '🏅', gem: '💎',
  money: '💰', chart: '📈', chart_down: '📉', calendar: '📅', clock: '⏰',
  hourglass: '⌛', sun: '☀️', moon: '🌙', cloud: '☁️', rain: '🌧️',
  snowflake: '❄️', rainbow: '🌈', earth: '🌍', globe: '🌐', computer: '💻',
  phone: '📱', camera: '📷', movie: '🎬', game: '🎮', music: '🎵',
  art: '🎨', science: '🔬', microscope: '🔬', telescope: '🔭', dna: '🧬',
  seedling: '🌱', tree: '🌳', leaf: '🍃', cactus: '🌵', rose: '🌹',
  cherry_blossom: '🌸', sunflower: '🌻', mushroom: '🍄', corn: '🌽',
  car: '🚗', plane: '✈️', ship: '🚢', train: '🚆', bike: '🚲',
  house: '🏠', office: '🏢', hospital: '🏥', school: '🏫', factory: '🏭',
  red_circle: '🔴', black_circle: '⚫', white_circle: '⚪',
  crimson: '🔺', blood: '🩸', mask: '😷', smile: '😄', laugh: '😆',
  joy: '😂', wink: '😉', cool: '😎', cry: '😢', angry: '😠',
  scream: '😱', sleeping: '😴', neutral: '😐', confused: '😕',
  sunglasses: '🕶️', cowboy: '🤠', nerd: '🤓', clown: '🤡',
};

const ALERTS = {
  NOTE: { variant: 'note', label: 'Note', icon: 'info' },
  TIP: { variant: 'tip', label: 'Tip', icon: 'light-bulb' },
  IMPORTANT: { variant: 'important', label: 'Important', icon: 'zap' },
  WARNING: { variant: 'warning', label: 'Warning', icon: 'alert' },
  CAUTION: { variant: 'caution', label: 'Caution', icon: 'stop' },
};

/* ==========================================================================
   Inline parsing
   ========================================================================== */

function protectCodeSpans(text, store) {
  // Fenced inline code first (``code``), then single backticks.
  return text
    .replace(/``(.+?)``/gs, (m, code) => {
      const key = `\u0000CODE${store.length}\u0000`;
      store.push({ code, html: `<code>${highlight(code, 'text')}</code>` });
      return key;
    })
    .replace(/`([^`\n]+)`/g, (m, code) => {
      const key = `\u0000CODE${store.length}\u0000`;
      store.push({ code, html: `<code>${highlight(code, 'text')}</code>` });
      return key;
    });
}

function restoreCodeSpans(html, store) {
  return html.replace(/\u0000CODE(\d+)\u0000/g, (m, index) => {
    const entry = store[Number(index)];
    return entry ? entry.html : '';
  });
}

/** Decide the href for a markdown link target. External URLs are kept but
 *  flagged nofollow/noreferrer; everything else is treated as a local route. */
function resolveHref(raw) {
  const target = String(raw || '').trim();
  if (!target) return '#';
  if (/^(https?:|mailto:|tel:)/i.test(target)) {
    return { href: target, external: true };
  }
  if (target.startsWith('//')) return { href: target, external: true };
  if (target.startsWith('#')) return { href: target, external: false };
  if (target.startsWith('/')) return { href: target, external: false };
  return { href: `/${target.replace(/^\.?\//, '')}`, external: false };
}

function linkAttrs(external) {
  return external ? ' rel="noopener noreferrer nofollow" target="_blank"' : '';
}

/** Inline markdown → HTML string. */
export function renderInline(raw, options = {}) {
  const { repo = null, baseUrl = '' } = options;
  const store = [];
  const text = String(raw == null ? '' : raw);

  // 1. Pull out code spans so their contents are never re-parsed.
  let work = protectCodeSpans(text, store);

  // 2. Escape everything else.
  work = escapeHtml(work);

  // 3. Images ![alt](src "title")
  work = work.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (m, alt, src, title) => {
    const resolved = resolveHref(src);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    if (/^data:image\//i.test(src)) {
      return `<img class="md-image" src="${escapeHtml(src)}" alt="${alt}"${t} loading="lazy">`;
    }
    return `<img class="md-image" src="${escapeHtml(baseUrl + (resolved.external ? resolved.href : resolved.href))}" alt="${alt}"${t} loading="lazy">`;
  });

  // 4. Links [text](href "title")
  work = work.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (m, label, href, title) => {
    const resolved = resolveHref(href);
    const t = title ? ` title="${escapeHtml(title)}"` : '';
    return `<a href="${escapeHtml(resolved.href)}"${linkAttrs(resolved.external)}${t}>${label}</a>`;
  });

  // 5. Reference-style links [text][ref] with [ref]: url definitions
  work = work.replace(/\[([^\]]+)\]\[([^\]]+)\]/g, (m, label, ref) => {
    const slug = slugify(ref);
    return `<a href="#ref-${slug}">${label}</a>`;
  });

  // 6. Autolinks <https://…>
  work = work.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (m, url) => `<a href="${url}"${linkAttrs(true)}>${url}</a>`);

  // 7. Bare URLs (not already inside an href)
  work = work.replace(/(^|[\s(>])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, (m, prefix, url) => {
    if (m.includes('href="')) return m;
    return `${prefix}<a href="${url}"${linkAttrs(true)}>${url}</a>`;
  });

  // 8. @mentions and @org/team
  work = work.replace(/(^|[\s(,:[\]{}])@([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)(?:\/([a-zA-Z0-9_-]+))?/g,
    (m, prefix, user, team) => {
      const label = team ? `@${user}/${team}` : `@${user}`;
      const href = team ? `/orgs/${user}/teams` : `/${user}`;
      return `${prefix}<a class="user-mention" href="${href}">${label}</a>`;
    });

  // 9. Cross references: owner/repo#123, #123, owner/repo@sha, GH-123
  const repoPrefix = repo ? `${repo.ownerLogin}/${repo.name}` : null;
  work = work.replace(/(^|[\s(])((?:[\w.-]+\/[\w.-]+)?)#(\d+)(?=[\s.,;:!?)\]]|$)/g, (m, prefix, owner, num) => {
    const target = owner ? owner.replace(/\/$/, '') : repoPrefix;
    const href = target ? `/${target}/issues/${num}` : `#issue-${num}`;
    const label = `${owner || ''}#${num}`;
    return `${prefix}<a class="issue-link" href="${href}">${label}</a>`;
  });
  work = work.replace(/(^|[\s(])\b([0-9a-f]{7,40})\b(?=[\s.,;:!?)\]]|$)/g, (m, prefix, sha) => {
    const short = sha.slice(0, 7);
    const href = repoPrefix ? `/${repoPrefix}/commit/${sha}` : `/commit/${sha}`;
    return `${prefix}<a class="commit-sha" href="${href}">${short}</a>`;
  });

  // 10. Emoji shortcodes
  work = work.replace(/:([a-z0-9_+-]+):/g, (m, name) => {
    const glyph = EMOJI[name];
    return glyph ? `<span class="emoji" role="img" aria-label="${name}">${glyph}</span>` : m;
  });

  // 11. Bold / italic / strikethrough / highlight
  work = work.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  work = work.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  work = work.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  work = work.replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
  work = work.replace(/(^|[^\w_])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
  work = work.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  work = work.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

  // 12. Hard line breaks (two trailing spaces) and backslash breaks
  work = work.replace(/ {2,}\n/g, '<br>\n');
  work = work.replace(/\\\n/g, '<br>\n');

  // 13. Restore code spans.
  work = restoreCodeSpans(work, store);
  return work;
}

/* ==========================================================================
   Block parsing
   ========================================================================== */

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;
const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const FOOTNOTE_DEF_RE = /^\s{0,3}\[\^([^\]]+)\]:\s*(.*)$/;
const BLOCKQUOTE_RE = /^\s{0,3}>\s?(.*)$/;

function splitRow(line) {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells = [];
  let current = '';
  let escaped = false;
  for (const ch of text) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '|') { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function alignFromSep(cell) {
  const left = cell.trim().startsWith(':');
  const right = cell.trim().endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return null;
}

/**
 * Parse markdown text into an array of DOM nodes.
 * @param {string} source
 * @param {object} options { repo, baseUrl, headingOffset, taskEditable, onTaskToggle }
 */
export function renderMarkdown(source, options = {}) {
  const {
    repo = null, baseUrl = '', headingOffset = 0, taskEditable = false,
    onTaskToggle = null, compact = false, anchors = true,
  } = options;

  const lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').split('\n');
  const root = h('div', { class: ['markdown-body', compact ? 'compact' : ''].filter(Boolean).join(' ') });
  const footnotes = [];
  const headings = [];
  let index = 0;

  function inlineNode(text) {
    const span = h('span');
    span.innerHTML = renderInline(text, { repo, baseUrl });
    return span;
  }

  function parseBlocks(srcLines, container, start, end, depth = 0) {
    const lines = srcLines;
    let i = start;
    let listStack = []; // [{ el, indent, ordered }]

    function closeLists(toIndent = -1) {
      while (listStack.length && listStack[listStack.length - 1].indent > toIndent) {
        listStack.pop();
      }
    }

    while (i < end) {
      const line = lines[i];

      /* blank ------------------------------------------------------------ */
      if (/^\s*$/.test(line)) { closeLists(); i += 1; continue; }

      /* footnote definition --------------------------------------------- */
      const fn = FOOTNOTE_DEF_RE.exec(line);
      if (fn) {
        const body = [fn[2]];
        let j = i + 1;
        while (j < end && /^\s{2,}\S/.test(lines[j])) { body.push(lines[j].trim()); j += 1; }
        footnotes.push({ id: fn[1], html: renderInline(body.join(' '), { repo, baseUrl }) });
        closeLists();
        i = j;
        continue;
      }

      /* fenced code ------------------------------------------------------ */
      const fence = FENCE_RE.exec(line);
      if (fence) {
        closeLists();
        const marker = fence[1][0];
        const fenceLen = fence[1].length;
        const lang = normalizeLanguage(fence[2] || 'text');
        const meta = fence[3] || '';
        const body = [];
        let j = i + 1;
        while (j < end) {
          const closeMatch = new RegExp(`^\\s{0,3}${marker === '`' ? '`' : '~'}{${fenceLen},}\\s*$`).test(lines[j]);
          if (closeMatch) break;
          body.push(lines[j]);
          j += 1;
        }
        const code = body.join('\n');
        const pre = h('pre', { class: 'md-code-block', dataset: { lang } },
          h('code', { class: `language-${lang}` }));
        pre.querySelector('code').innerHTML = highlight(code, lang);
        const header = h('div', { class: 'md-code-header' },
          h('span', {}, lang === 'text' ? 'text' : lang),
          meta ? h('span', { class: 'text-muted' }, meta) : null,
          copyButton(() => code, { cls: 'md-copy-code', label: 'Copy' }));
        container.appendChild(h('div', {}, header, pre));
        i = j + 1;
        continue;
      }

      /* heading ---------------------------------------------------------- */
      const heading = HEADING_RE.exec(line);
      if (heading) {
        closeLists();
        const level = Math.min(6, heading[1].length + headingOffset);
        const text = heading[2];
        const id = `md-${slugify(text) || shortId(6, text)}`;
        headings.push({ level, text, id });
        const node = h(`h${level}`, { id });
        const inner = inlineNode(text);
        node.appendChild(inner);
        if (anchors) {
          node.appendChild(h('a', { class: 'anchor', href: `#${id}`, 'aria-label': `Permalink to ${text}` }));
        }
        container.appendChild(node);
        i += 1;
        continue;
      }

      /* thematic break --------------------------------------------------- */
      if (HR_RE.test(line)) {
        closeLists();
        container.appendChild(h('hr'));
        i += 1;
        continue;
      }

      /* blockquote / alerts --------------------------------------------- */
      if (BLOCKQUOTE_RE.test(line)) {
        closeLists();
        const quoteLines = [];
        let j = i;
        while (j < end) {
          const match = BLOCKQUOTE_RE.exec(lines[j]);
          if (!match) {
            // Lazy continuation for paragraph lines inside a quote.
            if (quoteLines.length && lines[j].trim() !== '' && !/^\s{0,3}(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|`{3})/.test(lines[j])) {
              quoteLines.push(lines[j]);
              j += 1;
              continue;
            }
            break;
          }
          quoteLines.push(match[1]);
          j += 1;
        }
        const alertMatch = /^\[!(\w+)\]\s*(.*)$/.exec(quoteLines[0] || '');
        if (alertMatch && ALERTS[alertMatch[1].toUpperCase()]) {
          const meta = ALERTS[alertMatch[1].toUpperCase()];
          const rest = quoteLines.slice(1);
          if (alertMatch[2]) rest.unshift(alertMatch[2]);
          const body = h('div');
          parseBlocks(rest, body, 0, rest.length, depth + 1);
          container.appendChild(h('div', { class: 'md-alert', dataset: { variant: meta.variant } },
            h('p', { class: 'md-alert-title' }, h('span', { class: 'icon-wrap' }, h('span', { text: meta.icon === 'info' ? 'ℹ' : meta.icon === 'light-bulb' ? '💡' : meta.icon === 'zap' ? '⚡' : meta.icon === 'alert' ? '⚠️' : '⛔' })), meta.label),
            body));
        } else {
          const quote = h('blockquote');
          parseBlocks(quoteLines, quote, 0, quoteLines.length, depth + 1);
          container.appendChild(quote);
        }
        i = j;
        continue;
      }

      /* details/summary -------------------------------------------------- */
      const detailsMatch = /^\s*<details(?:\s+([^>]*))?>\s*$/i.exec(line);
      if (detailsMatch) {
        closeLists();
        const attrs = detailsMatch[1] || '';
        const isOpen = /\bopen\b/i.test(attrs);
        let summary = 'Details';
        let j = i + 1;
        const summaryMatch = j < end ? /^\s*<summary>([\s\S]*?)<\/summary>\s*$/i.exec(lines[j]) : null;
        if (summaryMatch) { summary = summaryMatch[1].trim(); j += 1; }
        const body = [];
        while (j < end && !/^\s*<\/details>\s*$/i.test(lines[j])) { body.push(lines[j]); j += 1; }
        const details = h('details', { class: 'md-details', open: isOpen || undefined });
        const summaryEl = h('summary');
        summaryEl.innerHTML = renderInline(summary, { repo, baseUrl });
        details.appendChild(summaryEl);
        const inner = h('div');
        parseBlocks(body, inner, 0, body.length, depth + 1);
        details.appendChild(inner);
        container.appendChild(details);
        i = j + 1;
        continue;
      }

      /* table ------------------------------------------------------------ */
      if (line.includes('|') && i + 1 < end && TABLE_SEP_RE.test(lines[i + 1])) {
        closeLists();
        const headerCells = splitRow(line);
        const sepCells = splitRow(lines[i + 1]);
        const aligns = sepCells.map(alignFromSep);
        const rows = [];
        let j = i + 2;
        while (j < end && lines[j].includes('|') && lines[j].trim() !== '' && !HR_RE.test(lines[j])) {
          rows.push(splitRow(lines[j]));
          j += 1;
        }
        const thead = h('thead', {}, h('tr', {}, headerCells.map((cell, ci) => h('th', {
          scope: 'col',
          style: aligns[ci] ? { textAlign: aligns[ci] } : undefined,
        }, inlineNode(cell)))));
        const tbody = h('tbody', {}, rows.map((row) => h('tr', {},
          headerCells.map((_, ci) => h('td', {
            style: aligns[ci] ? { textAlign: aligns[ci] } : undefined,
          }, inlineNode(row[ci] != null ? row[ci] : ''))))));
        container.appendChild(h('table', { class: 'md-table' }, thead, tbody));
        i = j;
        continue;
      }

      /* lists ------------------------------------------------------------ */
      const listMatch = LIST_RE.exec(line);
      if (listMatch) {
        const indent = listMatch[1].replace(/\t/g, '  ').length;
        const ordered = /\d/.test(listMatch[2]);
        let content = listMatch[3];
        let checked = null;
        const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(content);
        if (taskMatch) { checked = taskMatch[1].toLowerCase() === 'x'; content = taskMatch[2]; }

        // Gather continuation lines (indented or lazy) belonging to this item.
        const itemLines = [content];
        let j = i + 1;
        while (j < end) {
          const next = lines[j];
          if (/^\s*$/.test(next)) {
            // Blank line: include only if the following line is indented content.
            if (j + 1 < end && /^\s{2,}\S/.test(lines[j + 1]) && !LIST_RE.test(lines[j + 1])) {
              itemLines.push('');
              j += 1;
              continue;
            }
            break;
          }
          const nextIndent = next.match(/^\s*/)[0].replace(/\t/g, '  ').length;
          if (LIST_RE.test(next) && nextIndent <= indent) break;
          if (nextIndent >= indent + 2 || (!LIST_RE.test(next) && nextIndent >= 1)) {
            itemLines.push(next.slice(Math.min(next.length, indent + 2)));
            j += 1;
            continue;
          }
          // Lazy continuation of a paragraph inside the item.
          if (!/^(#{1,6}\s|>|`{3}|(?:[-*+]|\d+[.)])\s)/.test(next)) {
            itemLines.push(next);
            j += 1;
            continue;
          }
          break;
        }

        // Ensure the correct list container exists for this indent level.
        while (listStack.length && listStack[listStack.length - 1].indent > indent) listStack.pop();
        let entry = listStack[listStack.length - 1];
        if (!entry || entry.indent < indent) {
          const parent = entry ? entry.lastItem : container;
          const list = h(ordered ? 'ol' : 'ul', {
            class: checked != null ? 'contains-task-list' : '',
            start: ordered && /^\d/.test(listMatch[2]) ? listMatch[2].replace(/[.)]/g, '') : undefined,
          });
          parent.appendChild(list);
          entry = { el: list, indent, ordered, lastItem: null };
          listStack.push(entry);
        } else if (entry.ordered !== ordered && entry.indent === indent) {
          const list = h(ordered ? 'ol' : 'ul', { class: checked != null ? 'contains-task-list' : '' });
          container.appendChild(list);
          entry = { el: list, indent, ordered, lastItem: null };
          listStack[listStack.length - 1] = entry;
        }

        const li = h('li', { class: checked != null ? 'task-list-item' : '' });
        if (checked != null) {
          const box = h('input', {
            type: 'checkbox',
            class: 'task-list-item-checkbox',
            checked: checked || undefined,
            disabled: taskEditable ? undefined : true,
            dataset: { sourceLine: String(i) },
          });
          if (taskEditable && typeof onTaskToggle === 'function') {
            box.addEventListener('change', (event) => onTaskToggle(event.target.checked, { lines, lineIndex: i, event }));
          }
          li.appendChild(box);
        }

        // If the item contains block-level content, parse recursively.
        const hasBlocks = itemLines.length > 1 || /^\s*(?:#{1,6}\s|>|`{3}|[-*+]\s|\d+[.)]\s)/.test(itemLines[0] || '');
        if (hasBlocks && itemLines.length > 1) {
          parseBlocks(itemLines, li, 0, itemLines.length, depth + 1);
        } else if (hasBlocks && itemLines.length === 1 && LIST_RE.test(itemLines[0])) {
          parseBlocks(itemLines, li, 0, 1, depth + 1);
        } else {
          li.appendChild(inlineNode(itemLines.join('\n')));
        }
        entry.el.appendChild(li);
        entry.lastItem = li;
        i = j;
        continue;
      }

      /* indented code block (4 spaces / 1 tab) --------------------------- */
      if (/^(?: {4}|\t)/.test(line) && !listStack.length) {
        closeLists();
        const codeLines = [];
        let j = i;
        while (j < end && (/^(?: {4}|\t)/.test(lines[j]) || /^\s*$/.test(lines[j]))) {
          codeLines.push(lines[j].replace(/^(?: {4}|\t)/, ''));
          j += 1;
        }
        while (codeLines.length && codeLines[codeLines.length - 1].trim() === '') codeLines.pop();
        const pre = h('pre', {}, h('code', {}));
        pre.querySelector('code').innerHTML = highlight(codeLines.join('\n'), 'text');
        container.appendChild(pre);
        i = j;
        continue;
      }

      /* paragraph -------------------------------------------------------- */
      closeLists();
      const paraLines = [];
      let j = i;
      while (j < end) {
        const next = lines[j];
        if (/^\s*$/.test(next)) break;
        if (HEADING_RE.test(next) || FENCE_RE.test(next) || HR_RE.test(next)
          || BLOCKQUOTE_RE.test(next) || LIST_RE.test(next) || /^\s*<details/i.test(next)) break;
        if (next.includes('|') && j + 1 < end && TABLE_SEP_RE.test(lines[j + 1])) break;
        paraLines.push(next);
        j += 1;
      }
      if (paraLines.length === 0) { j = i + 1; }
      const p = h('p');
      p.innerHTML = renderInline(paraLines.join('\n'), { repo, baseUrl });
      container.appendChild(p);
      i = j;
    }
  }

  parseBlocks(lines, root, 0, lines.length);

  /* footnotes ------------------------------------------------------------ */
  if (footnotes.length) {
    const refs = root.querySelectorAll('a[href^="#fn-"]');
    refs.forEach((a) => {
      const id = decodeURIComponent(a.getAttribute('href')).slice(1);
      const note = footnotes.find((f) => `fn-${slugify(f.id)}` === id);
      if (note) a.title = note.html.replace(/<[^>]+>/g, '');
    });
    const section = h('section', { class: 'footnotes', 'data-footnotes': 'true', 'aria-label': 'Footnotes' },
      h('h2', { class: 'sr-only' }, 'Footnotes'),
      h('ol', {}, footnotes.map((note) => h('li', { id: `fn-${slugify(note.id)}` },
        (() => { const span = h('span'); span.innerHTML = `${note.html} `; return span; })(),
        h('a', { href: '#', 'aria-label': 'Back to reference', class: 'footnote-backref' }, '↩')))));
    root.appendChild(section);
  }

  return { root, headings, footnotes };
}

/** Convenience: return just the DOM node. */
export function markdown(source, options = {}) {
  return renderMarkdown(source, options).root;
}

/** Render markdown to an HTML string (used by the copy-as-HTML action). */
export function markdownToHtml(source, options = {}) {
  const { root } = renderMarkdown(source, options);
  const wrapper = h('div');
  wrapper.appendChild(root);
  return wrapper.innerHTML;
}

/** Plain-text rendering (notifications previews, search snippets). */
export function markdownToText(source) {
  return String(source == null ? '' : source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, '• ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Turn selected text into a blockquote (used by "Quote reply"). */
export function quoteSelection(text) {
  return String(text || '')
    .split('\n')
    .map((line) => `> ${line}`.trimEnd())
    .join('\n');
}

export function emojiList() {
  return Object.entries(EMOJI).map(([name, glyph]) => ({ name, glyph }));
}

export default { renderMarkdown, renderInline, markdown, markdownToHtml, markdownToText, quoteSelection, emojiList, EMOJI, ALERTS };
