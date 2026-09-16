import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { run, sha256File } from './build-utils.mjs';
import release from './release-profile.mjs';

const LICENSE_FILE = /^(license|licence|notice|copying|copyright)(\..*)?$/i;

export async function prepareCloudflaredSource(directory = resolve('build/cloudflared-source')) {
  const source = resolve(directory);
  try {
    const head = (await run('git', ['-C', source, 'rev-parse', 'HEAD'], { capture: true, timeout: 30000 })).stdout.trim();
    if (head === release.cloudflaredSourceCommit) return source;
  } catch {}
  await rm(source, { recursive: true, force: true });
  await mkdir(dirname(source), { recursive: true });
  await run('git', ['init', '-q', source]);
  await run('git', ['-C', source, 'remote', 'add', 'origin', 'https://github.com/cloudflare/cloudflared.git']);
  await run('git', ['-C', source, 'fetch', '--quiet', '--depth=1', 'origin', release.cloudflaredSourceCommit], { timeout: 180000 });
  await run('git', ['-C', source, 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);
  const head = (await run('git', ['-C', source, 'rev-parse', 'HEAD'], { capture: true, timeout: 30000 })).stdout.trim();
  if (head !== release.cloudflaredSourceCommit) throw new Error('cloudflared source identity mismatch');
  return source;
}

export async function collectCloudflaredNotices(source, destination) {
  const root = resolve(source);
  const output = resolve(destination);
  const head = (await run('git', ['-C', root, 'rev-parse', 'HEAD'], { capture: true, timeout: 30000 })).stdout.trim();
  if (head !== release.cloudflaredSourceCommit) throw new Error('cloudflared notice source identity mismatch');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.git') continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`cloudflared license tree contains a symlink: ${relative(root, path)}`);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.isFile() || !LICENSE_FILE.test(entry.name)) continue;
      const relativePath = relative(root, path).replaceAll('\\', '/');
      const target = join(output, ...relativePath.split('/'));
      await mkdir(dirname(target), { recursive: true });
      await cp(path, target);
      const stats = await lstat(target);
      files.push({ path: relativePath, sha256: await sha256File(target), size: stats.size });
    }
  }
  await walk(root);
  files.sort((left, right) => left.path.localeCompare(right.path));
  if (!files.some(file => file.path === 'LICENSE') || !files.some(file => file.path.startsWith('vendor/'))) {
    throw new Error('cloudflared license collection did not include root and vendored license material');
  }
  const manifest = { schema: 1, component: 'cloudflared', version: release.cloudflaredVersion,
    sourceCommit: release.cloudflaredSourceCommit, files };
  await writeFile(join(output, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function verifyCloudflaredNotices(directory) {
  const root = resolve(directory);
  const manifest = JSON.parse(await readFile(join(root, 'MANIFEST.json'), 'utf8'));
  if (manifest.schema !== 1 || manifest.component !== 'cloudflared' || manifest.version !== release.cloudflaredVersion ||
      manifest.sourceCommit !== release.cloudflaredSourceCommit || !Array.isArray(manifest.files) || manifest.files.length < 2) {
    throw new Error('Invalid cloudflared license manifest');
  }
  const seen = new Set();
  for (const file of manifest.files) {
    if (!/^[a-f0-9]{64}$/.test(file.sha256 ?? '') || !Number.isSafeInteger(file.size) || file.size < 1 ||
        typeof file.path !== 'string' || file.path.startsWith('/') || file.path.includes('\\') ||
        file.path.split('/').some(part => !part || part === '..') || seen.has(file.path)) {
      throw new Error('Invalid cloudflared license manifest entry');
    }
    seen.add(file.path);
    const path = join(root, ...file.path.split('/'));
    const stats = await lstat(path);
    if (!stats.isFile() || stats.size !== file.size || await sha256File(path) !== file.sha256) {
      throw new Error(`cloudflared license evidence differs from manifest: ${file.path}`);
    }
  }
  return manifest;
}
