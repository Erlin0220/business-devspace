import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateCatalog } from '../client/release-catalog.mjs';
import release, { requireProductionProfile } from './release-profile.mjs';
import { signUpdateCatalog } from './sign-updates.mjs';

export async function prepareSignedUpdate(directory) {
  requireProductionProfile(release);
  const root = resolve(directory);
  const evidence = JSON.parse(await readFile(join(root, 'PUBLIC-RELEASE-EVIDENCE.json'), 'utf8'));
  assert.equal(evidence.schema, 1, 'Unsupported public release evidence schema');
  assert.equal(evidence.release, release.version, 'Public release evidence version differs from release profile');
  assert.match(evidence.commit ?? '', /^[a-f0-9]{40}$/, 'Public release evidence commit is invalid');
  assert.equal(evidence.targets.length, release.distribution.targets.length, 'Public release evidence target count mismatch');
  const targets = {};
  for (const item of evidence.targets) {
    assert.ok(release.distribution.targets.includes(item.target), `Unexpected public release target: ${item.target}`);
    targets[item.target] = { file: item.name, size: item.size, sha256: item.sha256 };
  }
  const catalog = validateCatalog({ schema: 1, version: release.version, commit: evidence.commit, targets });
  const update = await signUpdateCatalog(catalog);
  await writeFile(join(root, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
  await writeFile(join(root, 'update.json'), `${JSON.stringify(update, null, 2)}\n`);
  console.log(JSON.stringify({ signedUpdatePrepared: true, release: release.version,
    commit: evidence.commit, updatePublicKey: release.distribution.updatePublicKey }));
  return { catalog, update };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { directory: { type: 'string' } } });
  if (!values.directory) throw new Error('Supply --directory');
  await prepareSignedUpdate(values.directory);
}
