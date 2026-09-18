import { buildDatabase } from './src/data/mockData.js';
import { hydrate } from './src/core/store.js';
hydrate(buildDatabase());
const s = await import('./src/pages/_shared.js');
const repo = s.db().repos[0];
const commit = s.repoCommits(repo)[0];
console.log(commit.sha.slice(0,7), commit.files, commit.additions, commit.deletions);
const files = s.commitDiffFiles(commit);
console.log(JSON.stringify(files[0]).slice(0, 400));
