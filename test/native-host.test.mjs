import test from 'node:test';
import assert from 'node:assert/strict';
import { isNativeMacosHost } from '../scripts/build-utils.mjs';

function host(machine, translated) {
  return (command, args) => {
    if (command === '/usr/bin/uname') { assert.deepEqual(args, ['-m']); return `${machine}\n`; }
    assert.equal(command, '/usr/sbin/sysctl');
    assert.deepEqual(args, ['-in', 'sysctl.proc_translated']);
    return translated;
  };
}

test('native macOS accepts Intel without an ARM-only sysctl and native Apple Silicon', () => {
  assert.equal(isNativeMacosHost('x64', host('x86_64', '')), true);
  assert.equal(isNativeMacosHost('arm64', host('arm64', '0\n')), true);
  assert.equal(isNativeMacosHost('x64', host('x86_64', '0\n')), true);
});

test('native macOS rejects Rosetta, mismatched architecture and unknown probe values', () => {
  assert.equal(isNativeMacosHost('x64', host('x86_64', '1\n')), false);
  assert.equal(isNativeMacosHost('x64', host('arm64', '0')), false);
  assert.equal(isNativeMacosHost('arm64', host('x86_64', '0')), false);
  assert.equal(isNativeMacosHost('arm64', host('arm64', 'unknown')), false);
  assert.equal(isNativeMacosHost('other', host('x86_64', '')), false);
});

test('a failed native host probe is not treated as Intel evidence', () => {
  assert.throws(() => isNativeMacosHost('x64', () => { throw new Error('probe failed'); }), /probe failed/);
});
