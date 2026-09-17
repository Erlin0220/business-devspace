import { generateKeyPairSync } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assertSecretAbsent, runSecretCommand } from './secret-provisioning.mjs';

export function provisionUpdateSigningKey(values, { run = runSecretCommand,
  createKeyPair = () => generateKeyPairSync('ed25519') } = {}) {
  if (values.confirm !== 'CREATE-NEW-UPDATE-TRUST-ROOT') {
    throw new Error('Refusing to create a new update trust root without --confirm CREATE-NEW-UPDATE-TRUST-ROOT');
  }
  for (const value of [values['primary-repo'], values['recovery-repo']]) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value ?? '')) throw new Error('Invalid GitHub repository');
  }
  for (const value of [values['primary-environment'], values['recovery-environment']]) {
    if (!/^[A-Za-z0-9_.-]+$/.test(value ?? '')) throw new Error('Invalid GitHub Environment');
  }
  const locations = [
    [values['recovery-repo'], values['recovery-environment']],
    [values['primary-repo'], values['primary-environment']],
  ];
  if (locations[0].join(':') === locations[1].join(':')) throw new Error('Primary and recovery stores must be distinct');
  for (const [repo, environment] of locations) {
    // Environments must already be protected by the operator. Provisioning must
    // neither replace a retained private key nor reconfigure their protections.
    assertSecretAbsent(run('gh', ['secret', 'list', '--repo', repo, '--env', environment, '--json', 'name']),
      'TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM', `${repo}:${environment}`);
  }
  const { privateKey, publicKey } = createKeyPair();
  const privatePem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const publicJwkX = publicKey.export({ format: 'jwk' }).x;
  for (const [repo, environment] of locations) {
    run('gh', ['secret', 'set', 'TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM', '--repo', repo, '--env', environment], privatePem);
    run('gh', ['variable', 'set', 'TEAM_DEVSPACE_NEXT_UPDATE_PUBLIC_KEY', '--repo', repo, '--env', environment, '--body', publicJwkX]);
  }
  return { provisioned: true, algorithm: 'Ed25519', publicKey: publicJwkX,
    privateKeyWrittenToDisk: false,
    primary: `${values['primary-repo']}:${values['primary-environment']}`,
    recovery: `${values['recovery-repo']}:${values['recovery-environment']}` };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: {
    confirm: { type: 'string' },
    'primary-repo': { type: 'string', default: 'Erlin0220/business-devspace' },
    'primary-environment': { type: 'string', default: 'public-release' },
    'recovery-repo': { type: 'string', default: 'Erlin0220/team-devspace' },
    'recovery-environment': { type: 'string', default: 'recovery' },
  } });
  console.log(JSON.stringify(provisionUpdateSigningKey(values)));
}
