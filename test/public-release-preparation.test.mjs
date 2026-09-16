import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { packageName } from '../client/release-catalog.mjs';
import base from '../release.config.json' with { type: 'json' };

const exec = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('public release preparation re-verifies four exact accepted production-profile installers after artifact transfer', async t => {
  const work = await mkdtemp(join(tmpdir(), 'tds-public-release-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const input = join(work, 'input'); const output = join(work, 'output');
  const commit = '1'.repeat(40);
  const profile = { gateway: 'https://gateway.production.invalid', downloadOrigin: 'https://downloads.production.invalid',
    updatePublicKey: 'B'.repeat(43) };
  const profileSha256 = sha256(JSON.stringify({ gateway: profile.gateway, downloadOrigin: profile.downloadOrigin,
    updatePublicKey: profile.updatePublicKey }));
  for (const target of base.distribution.targets) {
    const directory = join(input, `transfer-${target}`);
    await mkdir(directory, { recursive: true });
    const name = packageName(base.version, target);
    const bytes = Buffer.from(`accepted-${target}\n`);
    await writeFile(join(directory, name), bytes);
    const checks = { releaseLayout: true, installerTransaction: true, installedPayload: true,
      existingInstallUpgrade: true, nativeArchitecture: true, zeroResidue: true,
      finalEntrypointTransaction: true, nativeStartup: true, trayProtocol: true, traySingleInstance: true };
    await writeFile(join(directory, 'acceptance.json'), JSON.stringify({ schema: 1, passed: true, release: base.version,
      target, releaseProfileSha256: profileSha256, commit, sourceDirty: false, checks,
      entrypoint: { name, sha256: sha256(bytes) } }));
    await writeFile(join(directory, 'evidence.json'), JSON.stringify({ schema: 1, release: base.version, target,
      gitForWindowsRedistributed: false }));
  }
  await exec(process.execPath, ['scripts/prepare-public-release.mjs', '--input', input, '--output', output, '--commit', commit], {
    cwd: process.cwd(), timeout: 10000, env: { ...process.env, NODE_OPTIONS: '', TEAM_DEVSPACE_RELEASE_PROFILE: '',
      TEAM_DEVSPACE_RELEASE_PROFILE_JSON: JSON.stringify(profile) },
  });
  const files = (await readdir(output)).sort();
  assert.deepEqual(files, [...base.distribution.targets.map(target => packageName(base.version, target)),
    'PUBLIC-RELEASE-EVIDENCE.json', 'SHA256SUMS'].sort());
  const evidence = JSON.parse(await readFile(join(output, 'PUBLIC-RELEASE-EVIDENCE.json'), 'utf8'));
  assert.equal(evidence.commit, commit);
  assert.equal(evidence.releaseProfileSha256, profileSha256);
  assert.equal(evidence.targets.length, 4);
  const sums = await readFile(join(output, 'SHA256SUMS'), 'utf8');
  for (const target of base.distribution.targets) assert.ok(sums.includes(packageName(base.version, target)));
});
