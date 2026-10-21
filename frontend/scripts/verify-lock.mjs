/**
 * Pre-push lock guard — validates package-lock.json in LINUX (node:20), the same
 * environment CodeBuild uses.
 *
 * Why Linux: a lock generated on Windows can omit Linux-only native deps (sharp's
 * @emnapi packages, esbuild platform binaries). A Windows `npm ci` then passes
 * while CodeBuild's Linux `npm ci` fails with "Missing X from lock file". This
 * runs the real strict install in Linux to catch that BEFORE the push leaves the
 * machine.
 *
 * Invoked by the pre-push hook only when package.json / package-lock.json change.
 * Fix a failure with:  npm run lock:fix
 */
import { execFileSync } from 'node:child_process';

const IMAGE = 'node:20'; // CodeBuild installs nodejs 20

const docker = (args, opts = {}) => execFileSync('docker', args, { stdio: 'pipe', ...opts });

// Docker is required to validate in Linux. Block (don't silently pass) so a bad
// lock can't slip through — this hook only runs when deps actually changed.
try {
  docker(['info']);
} catch {
  console.error('\n✖ lock guard: Docker is not running.');
  console.error('  This push changes dependencies, so the lock must be validated in Linux');
  console.error('  (the env CodeBuild uses). Start Docker Desktop and push again, or run');
  console.error('  `npm run lock:fix` to regenerate the lock on Linux first.\n');
  process.exit(1);
}

const cwd = process.cwd().replace(/\\/g, '/');
console.log(`lock guard: validating package-lock.json in Linux (${IMAGE}) …`);
try {
  docker([
    'run', '--rm',
    '-v', `${cwd}:/host:ro`,
    '-v', 'rai-npm-cache:/root/.npm',
    '-w', '/work',
    IMAGE,
    'bash', '-c',
    'cp /host/package.json /host/package-lock.json /work/ && npm ci --no-audit --no-fund',
  ]);
  console.log('✓ lock guard: `npm ci` passes in Linux — CodeBuild will install cleanly.');
} catch (e) {
  console.error('\n✖ lock guard: `npm ci` FAILS in Linux — CodeBuild would fail at install.');
  console.error('  Fix:  npm run lock:fix   (regenerates the lock in Linux), then commit + push.');
  console.error('  ── npm said ──');
  console.error((e.stdout?.toString() || '') + (e.stderr?.toString() || e.message || ''));
  process.exit(1);
}
