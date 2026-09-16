import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256File } from './build-utils.mjs';
import { verifyCloudflaredNotices } from './cloudflared-source.mjs';
import { verifyNpmLicenseEvidence } from './npm-license-evidence.mjs';
import release from './release-profile.mjs';

export async function verifyRedistribution({ bundle, inventory, output }) {
  const root = resolve(bundle);
  const summary = JSON.parse(await readFile(resolve(inventory), 'utf8'));
  assert.equal(summary.schema, 1);
  assert.equal(summary.tool, 'syft');
  assert.ok(Array.isArray(summary.packages) && summary.packages.length > 0, 'Final-byte inventory is empty');
  const provenance = JSON.parse(await readFile(join(root, 'release-provenance.json'), 'utf8'));
  assert.equal(provenance.release, release.version);
  assert.equal(provenance.target, `${process.platform}-${process.arch}`);
  const sbomPath = join(root, 'sbom.cdx.json');
  const sbom = JSON.parse(await readFile(sbomPath, 'utf8'));
  const missingSbomLicenses = (sbom.components ?? []).filter(component => !(component.licenses ?? []).length)
    .map(component => `${component.name}@${component.version}`);
  assert.deepEqual(missingSbomLicenses, [], `SBOM components are missing license declarations: ${missingSbomLicenses.join(', ')}`);
  await stat(join(root, 'runtime', 'LICENSE'));
  const cloudflared = await verifyCloudflaredNotices(join(root, 'LICENSES', 'cloudflared'));
  assert.ok(cloudflared.files.length >= 50, 'cloudflared vendored license evidence is unexpectedly incomplete');
  const npmLicenses = await verifyNpmLicenseEvidence(root);
  assert.ok(npmLicenses.packages >= 300, 'npm license evidence is unexpectedly incomplete');
  const noticesPath = join(root, 'THIRD-PARTY-NOTICES.txt');
  const notices = await readFile(noticesPath, 'utf8');
  assert.ok(notices.includes(release.cloudflaredSourceCommit), 'Third-party notices do not bind cloudflared licenses to the source commit');
  const names = summary.packages.map(item => String(item.name ?? ''));
  assert.equal(names.some(name => /portablegit|git for windows/i.test(name)), false, 'Git for Windows entered release bytes');
  const forbiddenExecutables = summary.packages.flatMap(item => item.locations ?? [])
    .filter(path => /(?:^|\/)(?:git|bash)\.exe$/i.test(path));
  assert.deepEqual(forbiddenExecutables, [], 'Git/Bash executable entered Team DevSpace release bytes');
  const rustDirectory = join(root, 'LICENSES', 'rust');
  if (provenance.tray?.implementation === 'rust') {
    assert.ok((await readdir(rustDirectory)).length > 0, 'Rust tray licenses are missing');
  }
  const evidence = {
    schema: 1, target: provenance.target, release: release.version,
    inventory: { tool: summary.tool, toolVersion: summary.toolVersion, packages: summary.packages.length,
      npm: summary.packages.filter(item => item.type === 'npm').length,
      goModules: summary.packages.filter(item => item.type === 'go-module').length,
      binaries: summary.packages.filter(item => item.type === 'binary').length,
      summarySha256: await sha256File(resolve(inventory)) },
    licenses: { sbomComponents: (sbom.components ?? []).length, missingSbomLicenses: 0,
      sbomSha256: await sha256File(sbomPath), cloudflaredFiles: cloudflared.files.length,
      npmPackages: npmLicenses.packages, npmFallbackPackages: npmLicenses.fallbackPackages,
      npmManifestSha256: npmLicenses.manifestSha256,
      cloudflaredSourceCommit: cloudflared.sourceCommit,
      cloudflaredManifestSha256: await sha256File(join(root, 'LICENSES', 'cloudflared', 'MANIFEST.json')),
      noticesSha256: await sha256File(noticesPath), rustNotices: provenance.tray?.implementation === 'rust' },
    gitForWindowsRedistributed: false,
  };
  if (output) await writeFile(resolve(output), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ redistributionVerified: true, ...evidence }));
  return evidence;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { bundle: { type: 'string' }, inventory: { type: 'string' }, output: { type: 'string' } } });
  if (!values.bundle || !values.inventory) throw new Error('Supply --bundle and --inventory summary paths');
  await verifyRedistribution(values);
}
