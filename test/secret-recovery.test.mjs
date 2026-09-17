import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DOWNLOAD_TARGETS, packageName } from '../client/release-catalog.mjs';
import { verifySignedCatalog } from '../client/update-policy.mjs';
import { signUpdateCatalog } from '../scripts/sign-updates.mjs';
import { validateDeploymentAdmin } from '../scripts/private-config.mjs';

const commit = 'a'.repeat(40);
const sha = 'b'.repeat(64);

test('deployment never generates an encryption root or promotes a legacy key as a credential fallback', async () => {
  const source = await readFile('scripts/deploy.mjs', 'utf8');
  assert.doesNotMatch(source, /randomSecret\s*\(/, 'Deployment must not generate a replacement identity/encryption root');
  assert.doesNotMatch(source, /masterKeyV2\s*=\s*admin\.masterKey\b/,
    'A legacy key must not overwrite the canonical V2 root without a migration');
  assert.ok(source.indexOf('validateDeploymentAdmin(values.ci') < source.indexOf('const zone = await api('),
    'Canonical credentials must be validated before any remote resource mutation');
});

test('deployment credentials fail closed for missing, legacy-only, malformed or foreign state without changing it', () => {
  const gateway = 'https://team.example.test';
  const valid = { gateway, adminToken: 'a'.repeat(43), masterKeyV2: 'b'.repeat(43) };
  assert.equal(validateDeploymentAdmin(valid, gateway), valid);
  for (const admin of [null, {}, { gateway, adminToken: valid.adminToken, masterKey: 'c'.repeat(43) },
    { ...valid, masterKeyV2: 'bad' }, { ...valid, gateway: 'https://other.example.test' }]) {
    const before = structuredClone(admin);
    assert.throws(() => validateDeploymentAdmin(admin, gateway), /Restore the existing|different gateway/);
    assert.deepEqual(admin, before);
  }
});

function signingFixture() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    pem: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(),
    publicKey: publicKey.export({ format: 'jwk' }).x,
  };
}

function catalog(version) {
  return { schema: 1, version, commit, targets: Object.fromEntries(DOWNLOAD_TARGETS.map((target, index) =>
    [target, { file: packageName(version, target), size: 100 + index, sha256: sha }])) };
}

test('production update signing requires an explicit protected credential and verifies its public identity', async () => {
  const fixture = signingFixture();
  const value = catalog('1.2.3');
  await assert.rejects(signUpdateCatalog(value, { publicKey: fixture.publicKey }), /Protected update signing credential/);
  const signed = await signUpdateCatalog(value, { keyPem: fixture.pem, publicKey: fixture.publicKey });
  assert.deepEqual(await verifySignedCatalog(signed, fixture.publicKey, value.version), value);
  const other = signingFixture();
  await assert.rejects(signUpdateCatalog(value, { keyPem: other.pem, publicKey: fixture.publicKey }), /does not match/);
  await assert.rejects(signUpdateCatalog(value, { keyPem: fixture.pem, keyFile: 'unused.pem', publicKey: fixture.publicKey }), /Choose update signing key/);
});

test('protected public-release signing emits catalog and update metadata without a workstation key path', async t => {
  const root = await mkdtemp(join(tmpdir(), 'tds-signed-update-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = JSON.parse(await readFile('release.config.json', 'utf8'));
  const fixture = signingFixture();
  const version = base.version;
  const targets = DOWNLOAD_TARGETS.map((target, index) => ({ target, name: packageName(version, target),
    size: 100 + index, sha256: sha, acceptanceSha256: 'c'.repeat(64), redistributionEvidenceSha256: 'd'.repeat(64) }));
  await writeFile(join(root, 'PUBLIC-RELEASE-EVIDENCE.json'), JSON.stringify({
    schema: 1, release: version, commit, releaseProfileSha256: 'e'.repeat(64), targets, sha256sumsSha256: 'f'.repeat(64),
  }));
  const releaseProfile = JSON.stringify({ gateway: 'https://team.example.test', downloadOrigin: 'https://downloads.example.test',
    updatePublicKey: fixture.publicKey });
  const result = spawnSync(process.execPath, ['scripts/prepare-signed-update.mjs', '--directory', root], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, TEAM_DEVSPACE_RELEASE_PROFILE_JSON: releaseProfile,
      TEAM_DEVSPACE_RELEASE_PROFILE: '', TEAM_DEVSPACE_UPDATE_SIGNING_KEY: '', TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM: fixture.pem },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const emittedCatalog = JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8'));
  const update = JSON.parse(await readFile(join(root, 'update.json'), 'utf8'));
  assert.deepEqual(await verifySignedCatalog(update, fixture.publicKey, version), emittedCatalog);
  assert.equal(result.stdout.includes('PRIVATE KEY'), false);
});
