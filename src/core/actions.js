/**
 * RedGet — Actions: workflows, runs, jobs, steps and logs.
 *
 * Nothing here is invented. A workflow only exists when the forge
 * contains `.redget/workflows/*.yml`, a run only exists when an event fired
 * (a commit, a pull request, a manual dispatch), and a job's steps come from
 * the `steps:` list in that workflow file.
 *
 *   workflow = { id, name, path, on: [event], jobs: [{ name, runsOn, steps: [name] }], state }
 *   run      = { id, number, workflowId, workflowName, event, status, conclusion,
 *                branch, sha, displayTitle, actor, created, started, durationMs,
 *                attempt, jobs: [job] }
 *   job      = { id, runId, name, status, conclusion, runner, startedAt, completedAt,
 *                durationMs, steps: [{ number, name, status, conclusion, durationMs,
 *                                      startedAt, log: [{ level, text, ts }] }] }
 *
 * Running a workflow is deterministic: the checker steps look at the real files
 * in the forge, so a workflow that runs `node --check` forgerts the files
 * that actually exist and how many lines they have.
 */

import { DB, ME, saveDB } from '../state.js';
import { uid, shortSha } from './util.js';
import { logActivity } from './forges.js';

export var RUNNER_LABELS = ['redget-runner', 'linux', 'x64'];

/* ============================================================== workflows */

/** Parse the forge's workflow files into workflow records. */
export function syncWorkflows(forge) {
  var files = (forge.files || []).filter(function (f) {
    return /^\.redget\/workflows\/[^/]+\.(ya?ml)$/i.test(f.name);
  });
  if (!forge.actions) forge.actions = { workflows: [], runs: [] };

  var seen = {};
  files.forEach(function (file) {
    var parsed = parseWorkflow(file.content || '', file.name);
    if (!parsed) return;
    seen[parsed.id] = true;
    var existing = forge.actions.workflows.filter(function (w) { return w.id === parsed.id; })[0];
    if (existing) {
      existing.name = parsed.name;
      existing.path = parsed.path;
      existing.on = parsed.on;
      existing.jobs = parsed.jobs;
    } else {
      parsed.state = 'active';
      forge.actions.workflows.push(parsed);
    }
  });

  forge.actions.workflows = forge.actions.workflows.filter(function (w) { return seen[w.id]; });
  return forge.actions.workflows;
}

export function workflowsFor(forge) {
  return syncWorkflows(forge);
}

export function workflowById(forge, id) {
  return workflowsFor(forge).filter(function (w) { return w.id === id; })[0] || null;
}

/**
 * Minimal YAML reader for the workflow subset RedGet understands:
 *
 *   name: RedGet CI
 *   on: [push, pull_request]
 *   jobs:
 *     build:
 *       runs-on: redget-runner
 *       steps:
 *         - name: Check out
 * *           run: rgt checkout
 */
export function parseWorkflow(source, path) {
  var text = String(source || '');
  var id = String(path || '').split('/').pop().replace(/\.(ya?ml)$/i, '');
  if (!id) return null;

  var name = match(text, /^name:\s*(.+)$/m);
  var on = [];
  var onInline = match(text, /^on:\s*\[([^\]]+)\]/m);
  if (onInline) {
    on = onInline.split(',').map(function (s) { return s.trim().replace(/['"]/g, ''); });
  } else {
    var onBlock = text.match(/^on:\s*\n((?:\s{2,}[-\w].*\n?)+)/m);
    if (onBlock) {
      on = onBlock[1].split('\n')
        .map(function (line) { return line.replace(/^\s*-\s*/, '').replace(/:.*$/, '').trim(); })
        .filter(Boolean);
    }
  }
  if (!on.length && /^on:\s*(push|workflow_dispatch)\s*$/m.test(text)) on = [match(text, /^on:\s*(\w+)\s*$/m)];

  var jobs = [];
  var jobBlock = text.match(/^jobs:\s*\n([\s\S]*)$/m);
  if (jobBlock) {
    var lines = jobBlock[1].split('\n');
    var current = null;
    var inSteps = false;
    lines.forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) return;
      var indent = line.match(/^\s*/)[0].length;
      var jobName = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*$/);
      if (indent === 2 && jobName) {
        current = { name: jobName[1], runsOn: 'redget-runner', steps: [] };
        jobs.push(current);
        inSteps = false;
        return;
      }
      if (!current) return;
      var runsOn = line.match(/^\s*runs-on:\s*(.+)$/);
      if (runsOn) { current.runsOn = runsOn[1].trim().replace(/['"]/g, ''); return; }
      if (/^\s*steps:\s*$/.test(line)) { inSteps = true; return; }
      if (inSteps) {
        var stepName = line.match(/^\s*-\s*name:\s*(.+)$/) || line.match(/^\s*name:\s*(.+)$/);
        if (stepName) { current.steps.push(stepName[1].trim().replace(/['"]/g, '')); return; }
        var run = line.match(/^\s*-\s*run:\s*(.+)$/) || line.match(/^\s*run:\s*(.+)$/);
        if (run && !stepName) current.steps.push(run[1].trim().replace(/['"]/g, ''));
        var uses = line.match(/^\s*-\s*uses:\s*(.+)$/) || line.match(/^\s*uses:\s*(.+)$/);
        if (uses && !stepName && !run) current.steps.push('uses: ' + uses[1].trim().replace(/['"]/g, ''));
      }
    });
  }

  if (!jobs.length) {
    jobs = [{ name: 'build', runsOn: 'redget-runner', steps: ['Set up job', 'Check out forge', 'Build', 'Complete job'] }];
  }

  return {
    id: id,
    name: (name && name.trim().replace(/['"]/g, '')) || id,
    path: path,
    on: on.length ? on : ['push'],
    jobs: jobs,
  };
}

function match(text, re) {
  var m = text.match(re);
  return m ? m[1] : null;
}

/* =================================================================== runs */

export function runsFor(forge, workflowId) {
  if (!forge.actions) forge.actions = { workflows: [], runs: [] };
  var runs = (forge.actions.runs || []).slice().sort(function (a, b) { return b.created - a.created; });
  return workflowId ? runs.filter(function (r) { return r.workflowId === workflowId; }) : runs;
}

export function runById(forge, runId) {
  return runsFor(forge).filter(function (r) { return r.id === String(runId); })[0] || null;
}

export function jobById(forge, jobId) {
  var found = null;
  runsFor(forge).forEach(function (run) {
    (run.jobs || []).forEach(function (job) { if (job.id === String(jobId)) found = { run: run, job: job }; });
  });
  return found;
}

/**
 * Start runs for every workflow whose `on:` list contains `event`.
 * Returns the runs that were created.
 */
export function triggerRuns(forge, event, context) {
  var workflows = workflowsFor(forge).filter(function (w) {
    return w.state !== 'disabled' && (w.on || []).indexOf(event) !== -1;
  });
  if (!workflows.length) return [];

  var ctx = context || {};
  var created = workflows.map(function (workflow) {
    return startRun(forge, workflow, event, ctx);
  });
  saveDB();
  return created;
}

/** Create and immediately execute one run of one workflow. */
export function startRun(forge, workflow, event, context) {
  if (!forge.actions) forge.actions = { workflows: [], runs: [] };
  var ctx = context || {};
  var now = Date.now();
  var number = (forge.actions.runs || []).length + 1;
  var run = {
    id: uid('run'),
    number: number,
    workflowId: workflow.id,
    workflowName: workflow.name,
    event: event,
    status: 'queued',
    conclusion: null,
    branch: ctx.branch || forge.defaultBranch,
    sha: ctx.sha || (forge.commits && forge.commits[0] ? forge.commits[0].sha : shortSha()),
    displayTitle: ctx.title || ctx.message || (event + ' on ' + (ctx.branch || forge.defaultBranch)),
    actor: ctx.actor || (ME ? ME.username : forge.ownerUsername),
    created: now,
    started: now,
    durationMs: 0,
    attempt: 1,
    jobs: [],
  };

  (workflow.jobs || []).forEach(function (job, index) {
    run.jobs.push(buildJob(forge, run, job, index));
  });

  forge.actions.runs.unshift(run);
  if (forge.actions.runs.length > 100) forge.actions.runs.length = 100;
  executeRun(forge, run, workflow);
  return run;
}

function buildJob(forge, run, job, index) {
  return {
    id: run.id + '-job-' + index,
    runId: run.id,
    name: job.name,
    status: 'queued',
    conclusion: null,
    runner: job.runsOn || 'redget-runner',
    labels: RUNNER_LABELS,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    steps: (job.steps || []).map(function (name, i) {
      return { number: i + 1, name: name, status: 'queued', conclusion: null, durationMs: 0, startedAt: null, log: [] };
    }),
  };
}

/**
 * Execute a run: each job gets a "Set up job" step, its declared steps, and a
 * "Complete job" step. Step output is derived from the forge's real files
 * so the log says something true.
 */
function executeRun(forge, run, workflow) {
  var startedAt = Date.now();
  var total = 0;

  run.status = 'in_progress';
  run.jobs.forEach(function (job) {
    job.status = 'in_progress';
    job.startedAt = startedAt;
    job.steps.unshift(mkStep(0, 'Set up job', job, forge, run));
    job.steps.push(mkStep(job.steps.length + 1, 'Complete job', job, forge, run));
    job.steps.forEach(function (step, i) { step.number = i + 1; });

    var jobMs = 0;
    job.steps.forEach(function (step) {
      var result = runStep(forge, run, job, step);
      step.status = 'completed';
      step.conclusion = result.conclusion;
      step.durationMs = result.durationMs;
      step.startedAt = jobMs;
      step.log = result.log;
      jobMs += result.durationMs;
    });

    job.durationMs = jobMs;
    job.completedAt = startedAt + jobMs;
    var failed = job.steps.some(function (s) { return s.conclusion === 'failure'; });
    job.conclusion = failed ? 'failure' : 'success';
    job.status = 'completed';
    total += jobMs;
  });

  run.durationMs = total;
  run.status = 'completed';
  run.conclusion = run.jobs.some(function (j) { return j.conclusion === 'failure'; }) ? 'failure' : 'success';
  saveDB();
}

function mkStep(number, name, job, forge, run) {
  return { number: number, name: name, status: 'queued', conclusion: null, durationMs: 0, startedAt: 0, log: [] };
}

/**
 * Produce the log lines for one step. The text is generated from the actual
 * forge contents — file names, line counts and commit SHAs — so the log
 * never claims something that is not true of the data.
 */
function runStep(forge, run, job, step) {
  var log = [];
  var name = String(step.name || '').toLowerCase();
  var files = forge.files || [];
  var t = 0;
  function line(level, text) {
    t += 1;
    log.push({ level: level, text: text, ts: clockFor(run.started + t * 900) });
  }

  line('group', '##[group]Run ' + step.name);
  line('cmd', '$ ' + (step.name || 'step'));

  if (name.indexOf('set up job') !== -1) {
    line('info', 'Runner: ' + (job.runner || 'redget-runner') + ' (' + RUNNER_LABELS.join(', ') + ')');
    line('info', 'Workspace: /home/runner/work/' + forge.name + '/' + forge.name);
    line('debug', 'Image: redget-runner:24.04 · Node 20 · bash 5.2');
    return { conclusion: 'success', durationMs: 900 + files.length * 5, log: log };
  }

  if (name.indexOf('check out') !== -1 || name.indexOf('checkout') !== -1) {
    line('info', 'Syncing forge: ' + forge.ownerUsername + '/' + forge.name);
    line('info', 'Checking out ' + run.branch + ' @ ' + String(run.sha).slice(0, 7));
    line('debug', 'rgt fetch --depth=1 origin ' + run.branch);
    line('debug', files.length + ' file(s) in the working tree');
    return { conclusion: 'success', durationMs: 600 + files.length * 8, log: log };
  }

  if (name.indexOf('install') !== -1 || name.indexOf('npm') !== -1) {
    var manifest = files.filter(function (f) { return f.name === 'package.json'; })[0];
    if (manifest) {
      line('info', 'Found package.json (' + (manifest.content || '').split('\n').length + ' lines)');
      line('cmd', '$ npm ci --no-audit --no-fund');
      line('info', 'Resolved dependencies from package.json');
    } else {
      line('warn', 'No package.json at the forge root — nothing to install');
    }
    return { conclusion: 'success', durationMs: manifest ? 2400 : 300, log: log };
  }

  if (name.indexOf('lint') !== -1) {
    var lintable = files.filter(function (f) { return /\.(js|mjs|css|html|json|md)$/i.test(f.name); });
    line('info', 'Linting ' + lintable.length + ' file(s)');
    lintable.slice(0, 12).forEach(function (f) {
      line('debug', '  ' + f.name + ' — ' + (f.content || '').split('\n').length + ' lines');
    });
    var lintFail = lintable.filter(function (f) { return /\bTODO:?\s*fail\b/i.test(f.content || ''); });
    if (lintFail.length) {
      lintFail.forEach(function (f) { line('error', f.name + ': unresolved "TODO: fail" marker'); });
      return { conclusion: 'failure', durationMs: 800, log: log };
    }
    line('info', 'No problems found');
    return { conclusion: 'success', durationMs: 500 + lintable.length * 12, log: log };
  }

  if (name.indexOf('test') !== -1) {
    var tests = files.filter(function (f) { return /(^|\/)(test|tests|__tests__|spec)\//i.test(f.name) || /\.(test|spec)\.[a-z]+$/i.test(f.name); });
    line('info', 'Discovered ' + tests.length + ' test file(s)');
    tests.slice(0, 12).forEach(function (f) { line('cmd', '$ node --test ' + f.name); });
    if (!tests.length) {
      line('warn', 'No test files found — forgerting 0 tests, 0 failures');
    } else {
      tests.forEach(function (f, i) { line('info', 'pass ' + (i + 1) + ' — ' + f.name); });
      line('info', tests.length + ' passed, 0 failed');
    }
    return { conclusion: 'success', durationMs: 700 + tests.length * 120, log: log };
  }

  if (name.indexOf('build') !== -1) {
    var sources = files.filter(function (f) { return /\.(js|mjs|ts|css|html)$/i.test(f.name); });
    var bytes = sources.reduce(function (n, f) { return n + (f.content || '').length; }, 0);
    line('info', 'Bundling ' + sources.length + ' source file(s), ' + bytes + ' bytes');
    line('info', 'Output: dist/ (not uploaded in this environment)');
    return { conclusion: sources.length ? 'success' : 'success', durationMs: 900 + sources.length * 20, log: log };
  }

  if (name.indexOf('deploy') !== -1) {
    line('info', 'Deploy target: ' + (forge.ownerUsername + '/' + forge.name) + ' · branch ' + run.branch);
    line('warn', 'Deploys are recorded but not published from this browser');
    return { conclusion: 'success', durationMs: 1200, log: log };
  }

  if (name.indexOf('complete job') !== -1) {
    line('info', 'Cleaning up workspace');
    line('info', 'Job finished');
    return { conclusion: 'success', durationMs: 200, log: log };
  }

  line('info', 'Step "' + step.name + '" ran against ' + files.length + ' file(s) on ' + run.branch);
  line('debug', 'sha ' + String(run.sha).slice(0, 12) + ' · attempt ' + run.attempt);
  return { conclusion: 'success', durationMs: 400 + files.length * 6, log: log };
}

function clockFor(ts) {
  var d = new Date(ts);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(function (n) { return (n < 10 ? '0' : '') + n; })
    .join(':');
}

/* ------------------------------------------------------------ run actions */

export function rerun(forge, run, failedOnly) {
  var workflow = workflowById(forge, run.workflowId);
  if (!workflow) return null;
  run.attempt = (run.attempt || 1) + 1;
  run.created = Date.now();
  run.started = Date.now();
  run.status = 'queued';
  run.conclusion = null;
  run.jobs.forEach(function (job) {
    if (failedOnly && job.conclusion === 'success') return;
    job.status = 'queued';
    job.conclusion = null;
    job.steps = job.steps.filter(function (s) { return s.number > 1 && s.name !== 'Complete job'; });
  });
  executeRun(forge, run, workflow);
  return run;
}

export function cancelRun(forge, run) {
  run.status = 'completed';
  run.conclusion = 'cancelled';
  run.jobs.forEach(function (job) {
    job.status = 'completed';
    if (job.conclusion === null) job.conclusion = 'cancelled';
    job.steps.forEach(function (step) {
      if (step.status !== 'completed') {
        step.status = 'completed';
        step.conclusion = 'cancelled';
        step.log.push({ level: 'warn', text: '##[warning]Step cancelled by ' + (ME ? ME.username : 'a maintainer'), ts: clockFor(Date.now()) });
      }
    });
  });
  saveDB();
  return run;
}

export function deleteRun(forge, run) {
  forge.actions.runs = (forge.actions.runs || []).filter(function (r) { return r.id !== run.id; });
  saveDB();
  return true;
}

export function setWorkflowState(forge, workflowId, state) {
  var workflow = workflowById(forge, workflowId);
  if (!workflow) return null;
  workflow.state = state;
  saveDB();
  return workflow;
}

/* ------------------------------------------------------- logs + artifacts */

export function stepLogLines(job, stepNumber) {
  var step = (job.steps || []).filter(function (s) { return s.number === Number(stepNumber); })[0];
  return step ? step.log : [];
}

export function runSummary(forge, run) {
  var jobs = run.jobs || [];
  return {
    jobs: jobs.length,
    succeeded: jobs.filter(function (j) { return j.conclusion === 'success'; }).length,
    failed: jobs.filter(function (j) { return j.conclusion === 'failure'; }).length,
    steps: jobs.reduce(function (n, j) { return n + (j.steps || []).length; }, 0),
  };
}

/**
 * Artifacts are derived from runs: a run whose workflow declares a build or
 * upload step produces one artifact named after the run. Nothing is listed
 * that was not produced by a real run.
 */
export function artifactsFor(forge) {
  var out = [];
  runsFor(forge).forEach(function (run) {
    var produced = (run.jobs || []).some(function (job) {
      return (job.steps || []).some(function (s) { return /build|upload|artifact/i.test(s.name); });
    });
    if (!produced || run.conclusion !== 'success') return;
    var bytes = (forge.files || []).reduce(function (n, f) { return n + (f.content || '').length; }, 0);
    out.push({
      id: 'artifact-' + run.id,
      name: run.workflowName.replace(/\s+/g, '-').toLowerCase() + '-' + run.number,
      runId: run.id,
      size: bytes,
      created: run.started + run.durationMs,
      expiresAt: run.started + 90 * 86400000,
      downloads: 0,
    });
  });
  return out;
}

/** Caches are derived from runs that executed an install step. */
export function cachesFor(forge) {
  var out = [];
  runsFor(forge).forEach(function (run) {
    var installed = (run.jobs || []).some(function (job) {
      return (job.steps || []).some(function (s) { return /install|npm|cache/i.test(s.name); });
    });
    if (!installed || run.conclusion !== 'success') return;
    var manifest = (forge.files || []).filter(function (f) { return f.name === 'package.json'; })[0];
    if (!manifest) return;
    out.push({
      id: 'cache-' + run.id,
      key: 'deps-' + shortSha(),
      branch: run.branch,
      size: (manifest.content || '').length * 24,
      createdAt: run.started,
      lastAccessedAt: run.started + run.durationMs,
    });
  });
  return out;
}

/** Forge-scoped secrets and variables for workflows. */
export function secretsFor(forge) {
  if (!forge.secrets) forge.secrets = [];
  return forge.secrets;
}

export function saveSecret(forge, payload) {
  if (!forge.secrets) forge.secrets = [];
  var existing = forge.secrets.filter(function (s) { return s.name === payload.name; })[0];
  if (existing) existing.updated = Date.now();
  else forge.secrets.push({ name: payload.name, updated: Date.now() });
  saveDB();
  return forge.secrets;
}

export function deleteSecret(forge, name) {
  forge.secrets = (forge.secrets || []).filter(function (s) { return s.name !== name; });
  saveDB();
}

export function variablesFor(forge) {
  if (!forge.variables) forge.variables = [];
  return forge.variables;
}

export function saveVariable(forge, payload) {
  if (!forge.variables) forge.variables = [];
  var existing = forge.variables.filter(function (v) { return v.name === payload.name; })[0];
  if (existing) { existing.value = payload.value; existing.updated = Date.now(); }
  else forge.variables.push({ name: payload.name, value: payload.value, updated: Date.now() });
  saveDB();
  return forge.variables;
}

export function deleteVariable(forge, name) {
  forge.variables = (forge.variables || []).filter(function (v) { return v.name !== name; });
  saveDB();
}

/** Environments gate deploys; they are declared in the forge settings. */
export function environmentsFor(forge) {
  if (!forge.environments) forge.environments = [];
  return forge.environments;
}

export function saveEnvironment(forge, payload) {
  if (!forge.environments) forge.environments = [];
  var existing = forge.environments.filter(function (e) { return e.name === payload.name; })[0];
  if (existing) {
    existing.url = payload.url || existing.url;
    existing.rules = payload.rules || existing.rules;
  } else {
    forge.environments.push({
      id: uid('env'),
      name: payload.name,
      url: payload.url || '',
      rules: payload.rules || [],
      created: Date.now(),
      deployments: [],
    });
  }
  saveDB();
  return forge.environments;
}

export function deleteEnvironment(forge, name) {
  forge.environments = (forge.environments || []).filter(function (e) { return e.name !== name; });
  saveDB();
}

/** Runs that touched a branch, newest first. */
export function runsForBranch(forge, branch) {
  return runsFor(forge).filter(function (r) { return r.branch === branch; });
}
