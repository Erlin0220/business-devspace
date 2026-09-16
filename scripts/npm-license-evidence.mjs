import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

const NOTICE_FILE = /^(?:license|licence|notice|copying|copyright|unlicense)(?:[._-].*)?$/i;
const sha256 = value => createHash('sha256').update(value).digest('hex');
const MIT_TERMS = `MIT License

Copyright attribution: see the adjacent package.json and README copied verbatim
from the published npm package. The upstream package did not ship a standalone
license file in this installation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const safeId = (name, version, path) =>
  `${name.replaceAll('@', '_at_').replaceAll('/', '__')}-${version}-${sha256(path).slice(0, 10)}`;

export async function collectNpmLicenseEvidence(bundle) {
  const root = resolve(bundle);
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const output = join(root, 'LICENSES', 'npm-fallback');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const packages = [];
  for (const [relativePath, lockEntry] of Object.entries(lock.packages ?? {})) {
    if (!relativePath.includes('node_modules/') || !lockEntry?.version) continue;
    const normalizedPath = relativePath.replaceAll('\\', '/');
    const packageDirectory = join(root, ...normalizedPath.split('/'));
    let packageJsonText;
    try { packageJsonText = await readFile(join(packageDirectory, 'package.json'), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    const metadata = JSON.parse(packageJsonText);
    const name = metadata.name;
    const version = metadata.version;
    if (!name || version !== lockEntry.version) throw new Error(`Installed npm package identity mismatch: ${normalizedPath}`);
    const entries = await readdir(packageDirectory, { withFileTypes: true });
    const originalNotices = entries.filter(entry => entry.isFile() && NOTICE_FILE.test(entry.name)).map(entry => entry.name).sort();
    if (originalNotices.length) {
      packages.push({ name, version, path: normalizedPath, declaredLicense: metadata.license ?? null,
        strategy: 'upstream-files', files: originalNotices });
      continue;
    }
    if (!['MIT', 'Apache-2.0'].includes(metadata.license)) {
      throw new Error(`npm package has no standalone license/notice file and no supported fallback declaration: ${name}@${version}`);
    }
    const evidenceDirectory = safeId(name, version, normalizedPath);
    const directory = join(output, evidenceDirectory);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, 'published-package.json.txt'), packageJsonText);
    const readme = entries.find(entry => entry.isFile() && /^readme(?:[._-].*)?$/i.test(entry.name));
    if (readme) await cp(join(packageDirectory, readme.name), join(directory, readme.name));
    const licenseText = metadata.license === 'MIT'
      ? MIT_TERMS
      : await readFile(resolve('LICENSES/cloudflared-LICENSE.txt'), 'utf8');
    const notice = [
      `Package: ${name}@${version}`,
      `Published package path: ${normalizedPath}`,
      `Declared license: ${metadata.license}`,
      `Published author metadata: ${JSON.stringify(metadata.author ?? null)}`,
      `Published repository metadata: ${JSON.stringify(metadata.repository ?? null)}`,
      '',
      'The published npm package did not contain a standalone LICENSE/NOTICE/COPYING file.',
      'Team DevSpace therefore retains its package.json content and README (when present) verbatim and',
      'adds the declared standard license terms below as redistribution evidence. This file is',
      'generated evidence and is not represented as an upstream-authored standalone license file.',
      '', licenseText,
    ].join('\n');
    await writeFile(join(directory, 'DECLARED-LICENSE.txt'), notice);
    const fallbackFiles = (await readdir(directory)).sort();
    packages.push({ name, version, path: normalizedPath, declaredLicense: metadata.license,
      strategy: 'published-metadata-fallback', evidenceDirectory, files: fallbackFiles,
      evidence: Object.fromEntries(await Promise.all(fallbackFiles.map(async file =>
        [file, sha256(await readFile(join(directory, file)))]))) });
  }
  packages.sort((left, right) => left.path.localeCompare(right.path));
  const fallbackPackages = packages.filter(item => item.strategy === 'published-metadata-fallback').length;
  const manifest = { schema: 1, packages: packages.length, fallbackPackages, entries: packages };
  await writeFile(join(output, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyNpmLicenseEvidence(bundle) {
  const root = resolve(bundle);
  const manifestPath = join(root, 'LICENSES', 'npm-fallback', 'MANIFEST.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 1 || !Number.isSafeInteger(manifest.packages) || !Number.isSafeInteger(manifest.fallbackPackages) ||
      !Array.isArray(manifest.entries) || manifest.entries.length !== manifest.packages ||
      manifest.entries.filter(item => item.strategy === 'published-metadata-fallback').length !== manifest.fallbackPackages) {
    throw new Error('Invalid npm license evidence manifest');
  }
  for (const item of manifest.entries) {
    if (!item.name || !item.version || !item.path || !Array.isArray(item.files) || !item.files.length ||
        item.path.startsWith('/') || item.path.includes('\\') || item.path.split('/').some(part => !part || part === '..')) {
      throw new Error('Invalid npm license evidence entry');
    }
    const packageDirectory = join(root, ...item.path.split('/'));
    const metadata = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'));
    if (metadata.name !== item.name || metadata.version !== item.version) throw new Error(`npm license package identity changed: ${item.path}`);
    if (item.strategy === 'upstream-files') {
      for (const file of item.files) {
        if (!NOTICE_FILE.test(file) || !(await lstat(join(packageDirectory, file))).isFile()) {
          throw new Error(`npm upstream license file disappeared: ${item.path}/${file}`);
        }
      }
    } else if (item.strategy === 'published-metadata-fallback') {
      if (!['MIT', 'Apache-2.0'].includes(item.declaredLicense) || !item.evidence || !item.files.includes('DECLARED-LICENSE.txt') ||
          item.evidenceDirectory !== safeId(item.name, item.version, item.path)) {
        throw new Error(`Invalid npm license fallback: ${item.path}`);
      }
      const directory = join(root, 'LICENSES', 'npm-fallback', item.evidenceDirectory);
      for (const file of item.files) {
        const path = join(directory, file);
        if (!(await lstat(path)).isFile() || sha256(await readFile(path)) !== item.evidence[file]) {
          throw new Error(`npm license fallback evidence changed: ${item.path}/${file}`);
        }
      }
    } else throw new Error(`Unknown npm license evidence strategy: ${item.strategy}`);
  }
  return { ...manifest, manifestSha256: sha256(await readFile(manifestPath)) };
}
