// Copies app/ to dist/ and stamps the git sha into the page (R6). Refuses a dirty tree, so the sha
// on the page always names the exact source that was deployed.
import { execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();
if (run('git status --porcelain') && !process.argv.includes('--allow-dirty')) {
  console.error('Working tree is dirty. Commit first, so the build sha names what is deployed.');
  process.exit(1);
}
const sha = run('git rev-parse HEAD');
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const page = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync('dist/index.html', page);
console.log(sha);
