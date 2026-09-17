import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

const DOWNLOAD_RETRIES = 3;
const DOWNLOAD_ATTEMPT_TIMEOUT_SECONDS = 600;
const DOWNLOAD_RETRY_DELAY_SECONDS = 2;
// Keep the parent timeout strictly larger than curl's complete retry budget.
// Otherwise a slow first transfer can consume --max-time and make --retry
// ineffective, which is especially painful for the larger Windows binaries.
const DOWNLOAD_PROCESS_TIMEOUT_MS = ((DOWNLOAD_RETRIES + 1) * DOWNLOAD_ATTEMPT_TIMEOUT_SECONDS +
  DOWNLOAD_RETRIES * DOWNLOAD_RETRY_DELAY_SECONDS + 30) * 1000;

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function decodeMachOVersion(value) {
  return `${value >>> 16}.${(value >>> 8) & 0xff}.${value & 0xff}`;
}

export async function machOMinimumMacOS(path) {
  const binary = await readFile(path);
  if (binary.length < 32 || binary.readUInt32LE(0) !== 0xfeedfacf) {
    throw new Error(`Expected a thin little-endian 64-bit Mach-O binary: ${basename(path)}`);
  }
  const commandCount = binary.readUInt32LE(16);
  let offset = 32;
  for (let index = 0; index < commandCount; index += 1) {
    if (offset + 8 > binary.length) throw new Error(`Invalid Mach-O load-command table: ${basename(path)}`);
    const command = binary.readUInt32LE(offset);
    const commandSize = binary.readUInt32LE(offset + 4);
    if (commandSize < 8 || offset + commandSize > binary.length) {
      throw new Error(`Invalid Mach-O load command: ${basename(path)}`);
    }
    if (command === 0x32) { // LC_BUILD_VERSION
      if (commandSize < 24) throw new Error(`Invalid LC_BUILD_VERSION: ${basename(path)}`);
      return decodeMachOVersion(binary.readUInt32LE(offset + 12));
    }
    if (command === 0x24) { // LC_VERSION_MIN_MACOSX
      if (commandSize < 16) throw new Error(`Invalid LC_VERSION_MIN_MACOSX: ${basename(path)}`);
      return decodeMachOVersion(binary.readUInt32LE(offset + 8));
    }
    offset += commandSize;
  }
  throw new Error(`Mach-O binary does not declare a minimum macOS version: ${basename(path)}`);
}

export function compareDottedVersions(left, right) {
  const parse = value => String(value).split('.').map(part => Number(part));
  const a = parse(left); const b = parse(right);
  if ([...a, ...b].some(part => !Number.isSafeInteger(part) || part < 0)) throw new Error('Invalid dotted version');
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function isNativeMacosHost(architecture = process.arch, execute = execFileSync) {
  const options = { encoding: 'utf8', timeout: 10000 };
  const machine = execute('/usr/bin/uname', ['-m'], options).trim();
  // Intel does not expose hw.optional.arm64. Ignore only an absent optional
  // translation key; command failures and unexpected values must still fail.
  const translated = execute('/usr/sbin/sysctl', ['-in', 'sysctl.proc_translated'], options).trim();
  return ['', '0'].includes(translated) &&
    ({ arm64: 'arm64', x64: 'x86_64' })[architecture] === machine;
}

export function sourceIdentity(cwd = process.cwd()) {
  const options = { cwd, encoding: 'utf8', windowsHide: true, timeout: 30000 };
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], options).trim();
  // Compare canonical Git content and modes, not rsync/DrvFS stat-cache hints.
  // Include staged changes and untracked source; errors never count as clean.
  const diff = spawnSync('git', ['diff', '--quiet', 'HEAD', '--'], options);
  if (diff.error || ![0, 1].includes(diff.status)) throw diff.error ?? new Error('Cannot verify source changes');
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], options);
  return { commit, sourceDirty: diff.status === 1 || untracked.length > 0 };
}

export async function downloadPinned(artifact, cache) {
  const url = new URL(artifact.url);
  if (url.protocol !== 'https:' || url.username || url.password || !/^[a-f0-9]{64}$/.test(artifact.sha256)) {
    throw new Error('Every binary must have an HTTPS origin and an exact SHA-256 pin');
  }
  await mkdir(cache, { recursive: true });
  const target = join(cache, basename(new URL(artifact.url).pathname));
  try {
    await access(target);
    const size = (await stat(target)).size;
    if (size > 0 && size <= 256 * 1024 * 1024 && await sha256File(target) === artifact.sha256) return target;
    await rm(target); // An interrupted/invalid build cache is replaceable; never execute it.
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${target}.${process.pid}.partial`;
  try {
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
    await run(curl, ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--tlsv1.2',
      '--retry', String(DOWNLOAD_RETRIES), '--retry-all-errors', '--retry-delay', String(DOWNLOAD_RETRY_DELAY_SECONDS),
      '--connect-timeout', '30', '--max-time', String(DOWNLOAD_ATTEMPT_TIMEOUT_SECONDS), '--continue-at', '-',
      '--max-filesize', String(256 * 1024 * 1024),
      '--output', temporary, artifact.url], { timeout: DOWNLOAD_PROCESS_TIMEOUT_MS });
    const size = (await stat(temporary)).size;
    if (size <= 0 || size > 256 * 1024 * 1024) throw new Error('Binary download exceeds release size limit');
    if (await sha256File(temporary) !== artifact.sha256) throw new Error(`Downloaded binary failed SHA-256 verification: ${basename(target)}`);
    await rename(temporary, target);
    return target;
  } finally { await rm(temporary, { force: true }); }
}

export function run(command, args, { cwd, env, capture = false, timeout = 300000, maxOutputBytes = 32 * 1024 * 1024 } = {}) {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new Error('Invalid build output limit');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'] });
    let stdout = ''; let stderr = ''; let capturedBytes = 0;
    if (capture) {
      const append = (chunk, stream) => {
        capturedBytes += Buffer.byteLength(chunk);
        if (capturedBytes > maxOutputBytes) {
          child.kill();
          clearTimeout(timer);
          reject(new Error(`${basename(command)} exceeded its captured output limit`));
          return;
        }
        if (stream === 'stdout') stdout += chunk;
        else stderr += chunk;
      };
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => append(chunk, 'stdout'));
      child.stderr.on('data', chunk => append(chunk, 'stderr'));
    }
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${basename(command)} exceeded its build timeout`)); }, timeout);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    // exit may precede the last pipe data; close means both streams drained.
    child.once('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${basename(command)} exited ${code}${capture ? `\n${stderr.slice(-6000)}\n${stdout.slice(-3000)}` : ''}`));
      else resolve({ stdout, stderr });
    });
  });
}
