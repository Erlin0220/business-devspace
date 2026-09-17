import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assertSecretAbsent, runSecretCommand } from './secret-provisioning.mjs';

export function provisionMasterKeyV2(values, { run = runSecretCommand,
  createSecret = () => randomBytes(32).toString('base64url') } = {}) {
  if (values.confirm !== 'ROTATE-D1-MASTER-KEY') {
    throw new Error('Refusing to create a new D1 encryption root without --confirm ROTATE-D1-MASTER-KEY');
  }
  for (const repository of [values['primary-repo'], values['recovery-repo']]) {
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? '')) throw new Error('Invalid GitHub repository');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(values['worker-name'] ?? '')) throw new Error('Invalid Worker name');
  const wrangler = 'node_modules/wrangler/bin/wrangler.js';
  assertSecretAbsent(run(process.execPath, [wrangler, 'secret', 'list', '--format', 'json',
    '--name', values['worker-name']]), 'MASTER_KEY_V2', `Worker ${values['worker-name']}`);
  for (const [repo, environment] of [[values['primary-repo'], 'production'], [values['recovery-repo'], 'recovery']]) {
    assertSecretAbsent(run('gh', ['secret', 'list', '--repo', repo, '--env', environment, '--json', 'name']),
      'MASTER_KEY_V2', `${repo}:${environment}`);
  }
  const secret = createSecret();
  // Back up first; the deployed Worker may already consume V2 immediately.
  // Partial failure retains every successful copy for recovery. Never delete a
  // possibly activated encryption root or automatically regenerate on retry.
  run('gh', ['secret', 'set', 'MASTER_KEY_V2', '--repo', values['recovery-repo'], '--env', 'recovery'], secret);
  run('gh', ['secret', 'set', 'MASTER_KEY_V2', '--repo', values['primary-repo'], '--env', 'production'], secret);
  run(process.execPath, [wrangler, 'secret', 'put', 'MASTER_KEY_V2',
    '--name', values['worker-name']], `${secret}\n`);
  return { provisioned: true, secretName: 'MASTER_KEY_V2', privateValueWrittenToDisk: false,
    worker: values['worker-name'], primary: `${values['primary-repo']}:production`,
    recovery: `${values['recovery-repo']}:recovery` };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const { values } = parseArgs({ options: {
    confirm: { type: 'string' },
    'worker-name': { type: 'string', default: 'team-devspace' },
    'primary-repo': { type: 'string', default: 'Erlin0220/business-devspace' },
    'recovery-repo': { type: 'string', default: 'Erlin0220/team-devspace' },
  } });
  console.log(JSON.stringify(provisionMasterKeyV2(values)));
}
