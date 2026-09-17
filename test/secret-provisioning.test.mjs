import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { assertSecretAbsent } from '../scripts/secret-provisioning.mjs';
import { provisionMasterKeyV2 } from '../scripts/provision-master-key-v2.mjs';
import { provisionUpdateSigningKey } from '../scripts/provision-update-signing-key.mjs';

const masterOptions = { confirm: 'ROTATE-D1-MASTER-KEY', 'worker-name': 'test-worker',
  'primary-repo': 'test/primary', 'recovery-repo': 'test/recovery' };
const signingOptions = { confirm: 'CREATE-NEW-UPDATE-TRUST-ROOT',
  'primary-repo': 'test/primary', 'primary-environment': 'public-release',
  'recovery-repo': 'test/recovery', 'recovery-environment': 'recovery' };
const isList = args => args.includes('list');

test('secret-name preflight fails closed on existing roots or invalid provider metadata', () => {
  assert.doesNotThrow(() => assertSecretAbsent('[{"name":"OTHER"}]', 'ROOT', 'test'));
  assert.throws(() => assertSecretAbsent('[{"name":"ROOT"}]', 'ROOT', 'test'), /already exists/);
  for (const value of ['unavailable', '{}', '[null]', '[{"unknown":"ROOT"}]']) {
    assert.throws(() => assertSecretAbsent(value, 'ROOT', 'test'), /Cannot verify/);
  }
});

test('D1 provisioning refuses an existing V2 root in any store before generating or changing secrets', () => {
  for (let occupied = 0; occupied < 3; occupied++) {
    let reads = 0, generated = 0;
    const writes = [];
    assert.throws(() => provisionMasterKeyV2(masterOptions, {
      createSecret: () => { generated++; return 'a'.repeat(43); },
      run: (_command, args) => {
        if (!isList(args)) { writes.push(args); return ''; }
        return JSON.stringify(reads++ === occupied ? [{ name: 'MASTER_KEY_V2' }] : []);
      },
    }), /already exists/);
    assert.equal(generated, 0);
    assert.deepEqual(writes, []);
  }
});

test('D1 provisioning backs up both copies before Worker activation and never deletes on partial failure', () => {
  for (const failAt of [null, 0, 1, 2]) {
    const calls = [];
    const operation = () => provisionMasterKeyV2(masterOptions, {
      createSecret: () => 'a'.repeat(43),
      run: (command, args, input) => {
        if (isList(args)) return '[]';
        calls.push({ command, args, input });
        if (calls.length - 1 === failAt) throw new Error('Synthetic provider failure');
        return '';
      },
    });
    if (failAt === null) assert.equal(operation().privateValueWrittenToDisk, false);
    else assert.throws(operation, /Synthetic provider failure/);
    assert.equal(calls[0].args[calls[0].args.indexOf('--repo') + 1], 'test/recovery');
    if (calls.length > 1) assert.equal(calls[1].args[calls[1].args.indexOf('--repo') + 1], 'test/primary');
    if (calls.length > 2) assert.ok(calls[2].args.includes('put'));
    assert.ok(calls.every(call => !call.args.includes('delete')));
    assert.equal(calls.length, failAt === null ? 3 : failAt + 1);
    assert.ok(calls.every(call => call.input.trim() === 'a'.repeat(43)));
  }
});

test('update trust provisioning refuses either existing private key before key generation or Environment changes', () => {
  for (let occupied = 0; occupied < 2; occupied++) {
    let reads = 0, generated = 0;
    const writes = [];
    assert.throws(() => provisionUpdateSigningKey(signingOptions, {
      createKeyPair: () => { generated++; return generateKeyPairSync('ed25519'); },
      run: (_command, args) => {
        if (!isList(args)) { writes.push(args); return ''; }
        return JSON.stringify(reads++ === occupied ? [{ name: 'TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM' }] : []);
      },
    }), /already exists/);
    assert.equal(generated, 0);
    assert.deepEqual(writes, []);
  }
});

test('update trust provisioning saves recovery first without changing protected Environments or printing private material', () => {
  const calls = [];
  const receipt = provisionUpdateSigningKey(signingOptions, {
    run: (_command, args, input) => {
      if (isList(args)) return '[]';
      calls.push({ args, input });
      return '';
    },
  });
  assert.equal(receipt.privateKeyWrittenToDisk, false);
  assert.equal(calls.length, 4);
  assert.ok(calls.slice(0, 2).every(call => call.args.includes('test/recovery')));
  assert.ok(calls.slice(2).every(call => call.args.includes('test/primary')));
  assert.ok(calls.every(call => !call.args.includes('api') && !call.args.includes('delete')));
  assert.equal(calls[0].input, calls[2].input);
  assert.match(calls[0].input, /BEGIN PRIVATE KEY/);
  assert.equal(JSON.stringify(receipt).includes('PRIVATE KEY'), false);
});

test('provisioning requires explicit intent and stops before generation when a store cannot be checked', () => {
  for (const [provision, options] of [[provisionMasterKeyV2, masterOptions], [provisionUpdateSigningKey, signingOptions]]) {
    assert.throws(() => provision({ ...options, confirm: '' }, { run: () => assert.fail('No provider call') }), /Refusing/);
    assert.throws(() => provision(options, { run: () => { throw new Error('Metadata unavailable'); },
      createSecret: () => assert.fail('No new root'), createKeyPair: () => assert.fail('No new key') }), /Metadata unavailable/);
  }
});
