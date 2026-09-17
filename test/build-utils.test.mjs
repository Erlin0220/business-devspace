import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compareDottedVersions, machOMinimumMacOS, run } from '../scripts/build-utils.mjs';

test('build command capture drains both pipes before returning', async () => {
  const size = 512 * 1024;
  const result = await run(process.execPath, ['-e', `process.stdout.write('x'.repeat(${size}));process.stderr.write('y'.repeat(${size}));`], {
    capture: true, env: { NODE_OPTIONS: '', NODE_USE_ENV_PROXY: '' },
  });
  assert.equal(result.stdout.length, size);
  assert.equal(result.stderr.length, size);
});

test('build commands reject excessive captured output, nonzero exit and timeout', async () => {
  await assert.rejects(run(process.execPath, ['-e', "process.stdout.write('x'.repeat(65536))"], { capture: true, maxOutputBytes: 1024 }), /output limit/);
  await assert.rejects(run(process.execPath, ['-e', "process.stderr.write('expected failure');process.exitCode=3"], { capture: true }), /exited 3.*\nexpected failure/);
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 }), /timeout/);
  assert.throws(() => run(process.execPath, [], { maxOutputBytes: 0 }), /output limit/);
});

test('build downloads bound transfer size and retain HTTPS across redirects before validating hashes', async () => {
  const source = await readFile('scripts/build-utils.mjs', 'utf8');
  assert.match(source, /'--max-filesize', String\(256 \* 1024 \* 1024\)/);
  assert.match(source, /'--proto-redir', '=https'/);
  assert.match(source, /url\.username \|\| url\.password/);
});

test('build downloads can resume slow pinned binaries across the full retry budget', async () => {
  const source = await readFile('scripts/build-utils.mjs', 'utf8');
  assert.match(source, /const DOWNLOAD_RETRIES = 3;/);
  assert.match(source, /const DOWNLOAD_ATTEMPT_TIMEOUT_SECONDS = 600;/);
  assert.match(source, /'--continue-at', '-'/);
  assert.match(source, /timeout: DOWNLOAD_PROCESS_TIMEOUT_MS/);
  assert.match(source, /\(DOWNLOAD_RETRIES \+ 1\) \* DOWNLOAD_ATTEMPT_TIMEOUT_SECONDS/);
});

test('Mach-O release gate reads the binary minimum macOS version instead of trusting an environment variable', async t => {
  const work = await mkdtemp(join(tmpdir(), 'tds-macho-'));
  t.after(() => rm(work, { recursive: true, force: true }));
  const binary = Buffer.alloc(56);
  binary.writeUInt32LE(0xfeedfacf, 0);
  binary.writeUInt32LE(1, 16);
  binary.writeUInt32LE(24, 20);
  binary.writeUInt32LE(0x32, 32); // LC_BUILD_VERSION
  binary.writeUInt32LE(24, 36);
  binary.writeUInt32LE(1, 40); // PLATFORM_MACOS
  binary.writeUInt32LE((12 << 16) | (3 << 8), 44);
  const path = join(work, 'cloudflared');
  await writeFile(path, binary);
  assert.equal(await machOMinimumMacOS(path), '12.3.0');
  assert.equal(compareDottedVersions('12.3.0', '12.0'), 1);
  assert.equal(compareDottedVersions('12.0.0', '12.0'), 0);
  assert.equal(compareDottedVersions('11.7', '12.0'), -1);
});
