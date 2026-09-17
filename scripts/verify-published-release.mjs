import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DOWNLOAD_TARGETS, packageName, validateCatalog } from '../client/release-catalog.mjs';
import { verifySignedCatalog } from '../client/update-policy.mjs';
import { sha256File } from './build-utils.mjs';

const sha256 = /^[a-f0-9]{64}$/;

export async function verifyPublishedRelease(directory, {
  expectedVersion, expectedCommit, expectedProfileSha256, publicKey,
} = {}) {
  const root = resolve(directory);
  const evidencePath = join(root, 'PUBLIC-RELEASE-EVIDENCE.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  assert.equal(evidence.schema, 1, 'Unsupported public release evidence schema');
  if (expectedVersion !== undefined) assert.equal(evidence.release, expectedVersion, 'Public release version mismatch');
  assert.match(evidence.commit ?? '', /^[a-f0-9]{40}$/, 'Public release commit is invalid');
  if (expectedCommit !== undefined) assert.equal(evidence.commit, expectedCommit, 'Public release commit mismatch');
  assert.match(evidence.releaseProfileSha256 ?? '', sha256, 'Public release profile digest is invalid');
  if (expectedProfileSha256 !== undefined) {
    assert.equal(evidence.releaseProfileSha256, expectedProfileSha256, 'Public release profile mismatch');
  }
  assert.ok(Array.isArray(evidence.targets), 'Public release targets are missing');
  assert.equal(evidence.targets.length, DOWNLOAD_TARGETS.length, 'Public release target count mismatch');
  assert.match(evidence.sha256sumsSha256 ?? '', sha256, 'Public release SHA256SUMS digest is invalid');

  const targets = {};
  const seen = new Set();
  for (const target of DOWNLOAD_TARGETS) {
    const item = evidence.targets.find(entry => entry?.target === target);
    assert.ok(item, `Public release evidence is missing ${target}`);
    assert.equal(seen.has(target), false, `Duplicate public release target: ${target}`);
    seen.add(target);
    const expectedName = packageName(evidence.release, target);
    assert.equal(item.name, expectedName, `${target}: public release filename mismatch`);
    assert.ok(Number.isSafeInteger(item.size) && item.size > 0, `${target}: invalid public release size`);
    assert.match(item.sha256 ?? '', sha256, `${target}: invalid public release digest`);
    assert.match(item.acceptanceSha256 ?? '', sha256, `${target}: native acceptance attestation is missing`);
    assert.match(item.redistributionEvidenceSha256 ?? '', sha256, `${target}: redistribution attestation is missing`);
    const file = join(root, item.name);
    assert.equal((await stat(file)).size, item.size, `${target}: final GitHub asset size mismatch`);
    assert.equal(await sha256File(file), item.sha256, `${target}: final GitHub asset digest mismatch`);
    targets[target] = { file: item.name, size: item.size, sha256: item.sha256 };
  }

  const expectedSums = `${evidence.targets.map(item => `${item.sha256}  ${item.name}`).join('\n')}\n`;
  const sumsPath = join(root, 'SHA256SUMS');
  assert.equal(await readFile(sumsPath, 'utf8'), expectedSums, 'Final GitHub SHA256SUMS differs from public release evidence');
  assert.equal(await sha256File(sumsPath), evidence.sha256sumsSha256, 'Final GitHub SHA256SUMS digest mismatch');

  const catalog = validateCatalog(JSON.parse(await readFile(join(root, 'catalog.json'), 'utf8')));
  assert.deepEqual(catalog, { schema: 1, version: evidence.release, commit: evidence.commit, targets },
    'Final GitHub catalog differs from public release evidence');
  const signedUpdate = JSON.parse(await readFile(join(root, 'update.json'), 'utf8'));
  const verified = await verifySignedCatalog(signedUpdate, publicKey, evidence.release);
  assert.deepEqual(verified, catalog, 'Final GitHub signed update differs from the immutable catalog');
  return { evidence, catalog, signedUpdate, root };
}
