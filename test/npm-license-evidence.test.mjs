import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectNpmLicenseEvidence, verifyNpmLicenseEvidence } from '../scripts/npm-license-evidence.mjs';

test('npm license evidence preserves upstream files and labels metadata-only fallbacks without pretending they are originals', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tds-npm-licenses-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'LICENSES'), { recursive: true });
  await writeFile(join(root, 'LICENSES', 'cloudflared-LICENSE.txt'), 'Apache License Version 2.0\n');
  await writeFile(join(root, 'package-lock.json'), JSON.stringify({ packages: {
    'node_modules/has-license': { version: '1.0.0' },
    'node_modules/no-license': { version: '2.0.0' },
  } }));
  for (const [name, version, license] of [['has-license', '1.0.0', 'MIT'], ['no-license', '2.0.0', 'MIT']]) {
    const directory = join(root, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version, license, author: 'Fixture' }));
    await writeFile(join(directory, 'README.md'), `${name} readme\n`);
  }
  await writeFile(join(root, 'node_modules', 'has-license', 'LICENSE-MIT'), 'original upstream license\n');
  const manifest = await collectNpmLicenseEvidence(root);
  assert.equal(manifest.packages, 2);
  assert.equal(manifest.fallbackPackages, 1);
  const fallback = manifest.entries.find(item => item.name === 'no-license');
  assert.equal(fallback.strategy, 'published-metadata-fallback');
  const evidence = await verifyNpmLicenseEvidence(root);
  assert.equal(evidence.fallbackPackages, 1);
  const text = await readFile(join(root, 'LICENSES', 'npm-fallback', fallback.evidenceDirectory, 'DECLARED-LICENSE.txt'), 'utf8');
  assert.match(text, /generated evidence and is not represented as an upstream-authored/);
});
