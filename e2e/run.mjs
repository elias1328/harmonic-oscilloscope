// `npm run e2e`: build, serve dist/ with `vite preview` on a fixed port, generate fixtures,
// run the Playwright smoke suite, then shut the server down.
// Results: e2e/results/results.json, screenshots in e2e/results/screenshots/.
import { spawn, spawnSync } from 'node:child_process';

const PORT = 4179;
const URL_ = `http://127.0.0.1:${PORT}/`;
// Strict by default: any failing gate makes `npm run e2e` exit 1. `npm run e2e -- --no-strict` to only report.
const args = process.argv.slice(2);
const extra = args.includes('--no-strict') ? args.filter(a => a !== '--no-strict') : [...args, '--strict'];

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`✖ ${cmd} ${args.join(' ')} failed`); process.exit(r.status || 1); }
};

run('npx', ['vite', 'build']);
run(process.execPath, ['e2e/make-fixtures.mjs']);

const preview = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
  stdio: ['ignore', 'ignore', 'inherit'], detached: true
});
const stopPreview = () => { try { process.kill(-preview.pid, 'SIGTERM'); } catch { /* already gone */ } };
process.on('exit', stopPreview);

let up = false;
for (let i = 0; i < 100 && !up; i++) {
  try { up = (await fetch(URL_)).ok; } catch { await new Promise(r => setTimeout(r, 200)); }
}
if (!up) { console.error(`✖ preview server did not come up on ${URL_}`); process.exit(1); }

const r = spawnSync(process.execPath, ['e2e/e2e.mjs', URL_, ...extra], { stdio: 'inherit' });
stopPreview();
process.exit(r.status ?? 1);
