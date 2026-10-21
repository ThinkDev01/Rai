/**
 * Regenerate package-lock.json inside Linux (node:20) — the environment CodeBuild
 * uses — so the lock includes Linux-only native deps and `npm ci` matches CI.
 *
 * Run this whenever you add / change / remove a dependency (instead of a plain
 * `npm install` on Windows), then commit the updated package-lock.json.
 *
 *   npm run lock:fix
 */
import { execFileSync } from 'node:child_process';

const IMAGE = 'node:20';
const cwd = process.cwd().replace(/\\/g, '/');

console.log(`Regenerating package-lock.json in Linux (${IMAGE}) …`);
execFileSync(
  'docker',
  [
    'run', '--rm',
    '-v', `${cwd}:/host`,
    '-v', 'rai-npm-cache:/root/.npm',
    '-w', '/work',
    IMAGE,
    'bash', '-c',
    'cp /host/package.json /work/ && npm install --no-audit --no-fund && cp /work/package-lock.json /host/package-lock.json',
  ],
  { stdio: 'inherit' },
);
console.log('\n✓ package-lock.json regenerated on Linux. Review the diff, commit it, then push.');
