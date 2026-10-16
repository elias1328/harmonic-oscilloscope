// G5.5 README coverage and G5.7 CI workflow.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

const readme = readFileSync('README.md', 'utf8');

describe('G5.7: CI workflow', () => {
  const wf = yaml.load(readFileSync('.github/workflows/deploy.yml', 'utf8'));
  const steps = wf.jobs['build-and-deploy'].steps;

  it('G5.7: parses as YAML and runs npm ci, test, lint, build, then the upload', () => {
    const names = steps.map(s => s.run || s.uses);
    const idx = (x) => names.findIndex(n => n && n.startsWith(x));
    const order = ['npm ci', 'npm test', 'npm run lint', 'npm run build', 'actions/upload-pages-artifact'].map(idx);
    order.forEach(i => expect(i).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
  });

  it('G5.7: CI uses a Node version the test runner supports (vitest needs ≥ 22.12)', () => {
    const node = steps.find(s => (s.uses || '').startsWith('actions/setup-node')).with['node-version'];
    expect(Number(String(node).split('.')[0])).toBeGreaterThanOrEqual(22);
  });
});

describe('G5.5: README', () => {
  it('G5.5: no Bach claim', () => {
    expect(readme).not.toMatch(/bach/i);
  });

  it('G5.5: documents the clock, ghost/phosphor, φ sweep, 12-TET precession, tunnel, formats and scripts', () => {
    for (const re of [/truthful clock/i, /slow motion/i, /Slow-mo/, /ghost/i, /phosphor/i, /φ/, /collapses/i,
      /precesses/i, /Time Tunnel/, /Supported formats/, /npm test/, /npm run lint/, /npm run e2e/]) {
      expect(readme, String(re)).toMatch(re);
    }
  });
});
