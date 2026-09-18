/**
 * RedGet — demo data controls.
 *
 * The seed is deterministic, so "reset" means "drop the recorded patch and
 * rebuild". Three flavours are offered:
 *
 *   1. Reset to today's seed     — drop local mutations, keep the anchor date.
 *   2. Generate a fresh dataset  — new anchor, new relative timestamps, new data.
 *   3. Export / import the patch — take your mutations with you as JSON.
 *
 * The same functions back `tools/seed-reset.mjs` and the /settings/data page.
 */

import { h, icon } from '../core/dom.js';
import { openDialog, confirmDialog, toast, toastSuccess, toastError } from './overlay.js';
import { getDb, getPatch, resetDatabase, clearAllStorage, persist } from '../core/store.js';
import { buildDatabase, applyReferenceTime, prepareReferenceTime, getReferenceTime } from '../data/mockData.js';
import { STORAGE } from '../config.js';
import { EVENTS, emit } from '../core/bus.js';
import { navigate } from '../core/router.js';

/** Rebuild the dataset in place (no page reload) and notify subscribers. */
export function rebuild(options = { newAnchor: false }) {
  if (options.newAnchor) applyReferenceTime(Date.now(), STORAGE.anchor);
  else prepareReferenceTime(STORAGE.anchor);
  const db = buildDatabase();
  resetDatabase(db);
  emit(EVENTS.dataChange, { scope: 'db:reset' });
  return db;
}

export async function resetToSeed() {
  rebuild({ newAnchor: false });
  return true;
}

export async function regenerate() {
  rebuild({ newAnchor: true });
  return true;
}

export function wipeEverything() {
  clearAllStorage();
  applyReferenceTime(Date.now(), STORAGE.anchor);
  const db = buildDatabase();
  resetDatabase(db);
  return db;
}

export function confirmResetData() {
  const patch = getPatch();
  const regenerateButton = h('button', {
    class: 'btn', type: 'button',
    onClick: () => { regenerate(); toastSuccess('Generated a fresh dataset with new timestamps'); navigate('/dashboard'); },
  }, icon('sync', { size: 16 }), 'Generate a fresh dataset instead');
  const wipeButton = h('button', {
    class: 'btn btn-danger', type: 'button',
    onClick: () => { wipeEverything(); toastSuccess('All RedGet storage cleared'); navigate('/dashboard'); },
  }, icon('trash', { size: 16 }), 'Wipe all RedGet storage');

  const body = h('div', { class: 'dialog-form' },
    h('p', {}, `This drops ${patch.mutations.length} local change${patch.mutations.length === 1 ? '' : 's'} (comments, stars, merges, settings, created repositories) and rebuilds the seeded dataset.`),
    h('p', { class: 'field-help' }, 'Nothing leaves your browser — RedGet has no server side state.'),
    h('div', { class: 'form-actions' }, regenerateButton, wipeButton));

  return confirmDialog({
    title: 'Reset the demo data?',
    size: 'md',
    confirmLabel: 'Reset to seed',
    danger: true,
    body,
  }).then((confirmed) => {
    if (confirmed) {
      resetToSeed();
      toastSuccess('Demo data reset to the seed');
      navigate('/dashboard');
    }
    return confirmed;
  });
}

/** Full data-management dialog (used by /settings/data and the command palette). */
export function openDataDialog() {
  const patch = getPatch();
  const db = getDb();
  const counts = db ? [
    ['Repositories', db.repos.length],
    ['Issues', db.issues.length],
    ['Pull requests', db.pullRequests.length],
    ['Commits', db.commits.length],
    ['Workflow runs', db.runs.length],
    ['Comments', db.comments.length],
  ] : [];

  const list = h('dl', { class: 'data-counts' },
    counts.flatMap(([label, value]) => [h('dt', {}, label), h('dd', {}, String(value))]));

  openDialog({
    title: 'Demo data',
    size: 'md',
    hideFooter: true,
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'RedGet ships a deterministic, fully local dataset. Your changes are recorded as a patch and replayed on top of the seed at every boot.'),
      list,
      h('div', { class: 'field' },
        h('span', { class: 'text-strong' }, 'Local changes recorded: '),
        h('span', {}, `${patch.mutations.length}`),
        h('span', { class: 'field-help' }, `Seed anchor: ${new Date(db ? db.anchor : getReferenceTime()).toISOString()}`)),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => { resetToSeed(); toastSuccess('Reset to the seed'); } }, icon('history', { size: 16 }), 'Reset to seed'),
        h('button', { class: 'btn', type: 'button', onClick: () => { regenerate(); toastSuccess('Regenerated with a new anchor'); } }, icon('sync', { size: 16 }), 'Regenerate'),
        h('button', { class: 'btn', type: 'button', onClick: () => exportPatch() }, icon('download', { size: 16 }), 'Export patch'),
        h('button', { class: 'btn', type: 'button', onClick: () => importPatch() }, icon('upload', { size: 16 }), 'Import patch'),
        h('button', { class: 'btn btn-danger', type: 'button', onClick: () => { wipeEverything(); toastSuccess('Storage wiped'); } }, icon('trash', { size: 16 }), 'Wipe storage'))),
  });
}

export function exportPatch() {
  const payload = {
    app: 'RedGet',
    kind: 'mutation-patch',
    version: STORAGE.version,
    exportedAt: new Date().toISOString(),
    ...getPatch(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: `redget-patch-${Date.now()}.json` });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toastSuccess(`Exported ${payload.mutations.length} mutation(s)`);
}

export function importPatch() {
  const input = h('input', { type: 'file', accept: 'application/json', class: 'input', 'aria-label': 'Patch file' });
  openDialog({
    title: 'Import a patch',
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'Choose a RedGet mutation patch JSON file. Its mutations are appended to your current patch log and replayed immediately.'),
      input),
    confirmLabel: 'Import',
    onConfirm: () => {
      const file = input.files && input.files[0];
      if (!file) { toastError('No file selected'); return false; }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result));
          if (!Array.isArray(parsed.mutations)) throw new Error('missing mutations array');
          writeImportedPatch(parsed.mutations);
          toastSuccess(`Imported ${parsed.mutations.length} mutation(s)`);
        } catch (error) {
          toastError(`Could not import: ${error.message}`);
        }
      };
      reader.readAsText(file);
      return true;
    },
  });
}

function writeImportedPatch(mutations) {
  const current = getPatch();
  const merged = [...current.mutations, ...mutations.map((entry, index) => ({
    id: `imported-${index}-${Date.now().toString(36)}`,
    op: entry.op || 'import',
    source: String(entry.source || ''),
    at: entry.at || new Date().toISOString(),
  }))];
  try {
    window.localStorage.setItem(STORAGE.db, JSON.stringify({ anchor: current.anchor, generatedAt: current.generatedAt, mutations: merged, savedAt: new Date().toISOString() }));
  } catch (error) {
    toastError(`Storage write failed: ${error.message}`);
    return;
  }
  rebuild({ newAnchor: false });
  persist();
}

export default {
  rebuild, resetToSeed, regenerate, wipeEverything, confirmResetData, openDataDialog,
  exportPatch, importPatch,
};
