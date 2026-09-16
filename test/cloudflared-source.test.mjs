import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { collectCloudflaredNotices, verifyCloudflaredNotices } from '../scripts/cloudflared-source.mjs';
import release from '../scripts/release-profile.mjs';

test('cloudflared notice evidence retains root and vendored licenses with exact hashes', async t => {
  const work = await mkdtemp(join(tmpdir(), 'tds-cloudflared-notices-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const source = join(work, 'source');
  const output = join(work, 'licenses');
  await mkdir(join(source, 'vendor/example/module'), { recursive: true });
  await writeFile(join(source, 'LICENSE'), 'root license\n');
  await writeFile(join(source, 'vendor/example/module', 'NOTICE.txt'), 'vendor notice\n');
  await writeFile(join(source, 'vendor/example/module', 'ignored.go'), 'package example\n');
  await (await import('../scripts/build-utils.mjs')).run('git', ['init', '-q', source]);
  await (await import('../scripts/build-utils.mjs')).run('git', ['-C', source, 'config', 'user.email', 'test@example.invalid']);
  await (await import('../scripts/build-utils.mjs')).run('git', ['-C', source, 'config', 'user.name', 'Test']);
  await (await import('../scripts/build-utils.mjs')).run('git', ['-C', source, 'add', '.']);
  await (await import('../scripts/build-utils.mjs')).run('git', ['-C', source, 'commit', '-q', '-m', 'fixture']);
  const actual = (await (await import('../scripts/build-utils.mjs')).run('git', ['-C', source, 'rev-parse', 'HEAD'], { capture: true })).stdout.trim();
  // Collection is deliberately bound to the production source pin. Replace the
  // temporary repository's HEAD with that identity only inside the command shim
  // would weaken the test, so verify the pure manifest checker with a fixture
  // produced from a minimal copied tree instead.
  assert.notEqual(actual, release.cloudflaredSourceCommit);
  await assert.rejects(collectCloudflaredNotices(source, output), /source identity mismatch/);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'LICENSE'), 'root license\n');
  await mkdir(join(output, 'vendor/example/module'), { recursive: true });
  await writeFile(join(output, 'vendor/example/module/NOTICE.txt'), 'vendor notice\n');
  const { sha256File } = await import('../scripts/build-utils.mjs');
  const files = [];
  for (const path of ['LICENSE', 'vendor/example/module/NOTICE.txt']) {
    const bytes = await readFile(join(output, ...path.split('/')));
    files.push({ path, size: bytes.length, sha256: await sha256File(join(output, ...path.split('/'))) });
  }
  await writeFile(join(output, 'MANIFEST.json'), JSON.stringify({ schema: 1, component: 'cloudflared',
    version: release.cloudflaredVersion, sourceCommit: release.cloudflaredSourceCommit, files }));
  assert.equal((await verifyCloudflaredNotices(output)).files.length, 2);
});
