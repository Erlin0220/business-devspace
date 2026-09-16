import assert from 'node:assert/strict';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { packageName } from '../client/release-catalog.mjs';
import { sha256File } from './build-utils.mjs';
import release, { releaseProfileDigest, requireProductionProfile } from './release-profile.mjs';
import { verifyAcceptance } from './verify-acceptance.mjs';

async function findFiles(directory, name, results = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await findFiles(path, name, results);
    else if (entry.isFile() && entry.name === name) results.push(path);
  }
  return results;
}

export async function preparePublicRelease({ input, output, expectedCommit }) {
  requireProductionProfile(release);
  assert.match(expectedCommit ?? '', /^[a-f0-9]{40}$/, 'Public Release requires the exact reviewed main commit');
  const inputRoot = resolve(input);
  const outputRoot = resolve(output);
  const acceptanceFiles = await findFiles(inputRoot, 'acceptance.json');
  assert.equal(acceptanceFiles.length, release.distribution.targets.length, 'Public Release requires exactly one acceptance receipt per target');
  await rm(outputRoot, { recursive: true, force: true });
  const verificationRoot = join(outputRoot, '.verification');
  await mkdir(verificationRoot, { recursive: true });
  const expectedProfileSha256 = releaseProfileDigest(release);
  const targets = [];
  for (const acceptancePath of acceptanceFiles) {
    const acceptance = JSON.parse(await readFile(acceptancePath, 'utf8'));
    const target = acceptance.target;
    assert.ok(release.distribution.targets.includes(target), `Unexpected public release target: ${target}`);
    assert.equal(targets.some(entry => entry.target === target), false, `Duplicate public release target: ${target}`);
    const directory = resolve(acceptancePath, '..');
    const expectedName = packageName(release.version, target);
    assert.equal(acceptance.entrypoint?.name, expectedName, `${target}: unexpected accepted entrypoint`);
    const entrypoint = join(directory, expectedName);
    assert.equal(await sha256File(entrypoint), acceptance.entrypoint.sha256, `${target}: transferred bytes differ from acceptance`);
    const evidencePath = join(directory, 'evidence.json');
    const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
    assert.equal(evidence.release, release.version, `${target}: redistribution evidence release mismatch`);
    assert.equal(evidence.target, target, `${target}: redistribution evidence target mismatch`);
    assert.equal(evidence.gitForWindowsRedistributed, false, `${target}: Git for Windows entered redistributed bytes`);
    const targetVerification = join(verificationRoot, target);
    await mkdir(targetVerification, { recursive: true });
    await cp(entrypoint, join(targetVerification, expectedName));
    await cp(acceptancePath, join(targetVerification, 'acceptance.json'));
    const publishedEntrypoint = join(outputRoot, expectedName);
    await cp(entrypoint, publishedEntrypoint);
    targets.push({ target, name: expectedName, size: (await (await import('node:fs/promises')).stat(publishedEntrypoint)).size,
      sha256: acceptance.entrypoint.sha256, acceptanceSha256: await sha256File(acceptancePath),
      redistributionEvidenceSha256: await sha256File(evidencePath) });
  }
  targets.sort((left, right) => release.distribution.targets.indexOf(left.target) - release.distribution.targets.indexOf(right.target));
  await verifyAcceptance({ version: release.version, targets: release.distribution.targets, root: verificationRoot,
    expectedCommit, requireFinalWindows: true, requireInstalledUpgrade: true, requireNativeArchitecture: true,
    expectedProfileSha256 });
  const checksums = `${targets.map(entry => `${entry.sha256}  ${entry.name}`).join('\n')}\n`;
  await writeFile(join(outputRoot, 'SHA256SUMS'), checksums);
  const manifest = { schema: 1, release: release.version, commit: expectedCommit, releaseProfileSha256: expectedProfileSha256,
    targets, sha256sumsSha256: await sha256File(join(outputRoot, 'SHA256SUMS')) };
  await writeFile(join(outputRoot, 'PUBLIC-RELEASE-EVIDENCE.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await rm(verificationRoot, { recursive: true, force: true });
  console.log(JSON.stringify({ publicReleasePrepared: true, release: release.version, commit: expectedCommit, targets }));
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { input: { type: 'string' }, output: { type: 'string' }, commit: { type: 'string' } } });
  if (!values.input || !values.output || !values.commit) throw new Error('Supply --input, --output and --commit');
  await preparePublicRelease({ input: values.input, output: values.output, expectedCommit: values.commit });
}
