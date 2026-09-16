import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  confirm: { type: 'string' },
  'primary-repo': { type: 'string', default: 'Erlin0220/business-devspace' },
  'primary-environment': { type: 'string', default: 'public-release' },
  'recovery-repo': { type: 'string', default: 'Erlin0220/team-devspace' },
  'recovery-environment': { type: 'string', default: 'recovery' },
} });

if (values.confirm !== 'CREATE-NEW-UPDATE-TRUST-ROOT') {
  throw new Error('Refusing to create a new update trust root without --confirm CREATE-NEW-UPDATE-TRUST-ROOT');
}

for (const value of [values['primary-repo'], values['recovery-repo']]) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Invalid GitHub repository');
}
for (const value of [values['primary-environment'], values['recovery-environment']]) {
  if (!/^[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Invalid GitHub Environment');
}

function gh(args, input) {
  const result = spawnSync('gh', args, { input, encoding: 'utf8', windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`GitHub CLI failed: ${String(result.stderr || result.stdout).trim()}`);
}

for (const [repo, environment] of [
  [values['primary-repo'], values['primary-environment']],
  [values['recovery-repo'], values['recovery-environment']],
]) {
  gh(['api', '-X', 'PUT', `repos/${repo}/environments/${environment}`]);
}

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
const publicJwkX = publicKey.export({ format: 'jwk' }).x;

for (const [repo, environment] of [
  [values['primary-repo'], values['primary-environment']],
  [values['recovery-repo'], values['recovery-environment']],
]) {
  gh(['secret', 'set', 'TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM', '--repo', repo, '--env', environment], privatePem);
  gh(['variable', 'set', 'TEAM_DEVSPACE_NEXT_UPDATE_PUBLIC_KEY', '--repo', repo, '--env', environment, '--body', publicJwkX]);
}

console.log(JSON.stringify({ provisioned: true, algorithm: 'Ed25519', publicKey: publicJwkX,
  privateKeyWrittenToDisk: false,
  primary: `${values['primary-repo']}:${values['primary-environment']}`,
  recovery: `${values['recovery-repo']}:${values['recovery-environment']}` }));
