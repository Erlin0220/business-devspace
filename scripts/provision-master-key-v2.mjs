import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  confirm: { type: 'string' },
  'worker-name': { type: 'string', default: 'team-devspace' },
  'primary-repo': { type: 'string', default: 'Erlin0220/business-devspace' },
  'recovery-repo': { type: 'string', default: 'Erlin0220/team-devspace' },
} });

if (values.confirm !== 'ROTATE-D1-MASTER-KEY') {
  throw new Error('Refusing to create a new D1 encryption root without --confirm ROTATE-D1-MASTER-KEY');
}

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) throw new Error(`${command} failed: ${String(result.stderr || result.stdout).trim()}`);
}

const secret = randomBytes(32).toString('base64url');
let cloudflareWritten = false;
try {
  // Current production code ignores MASTER_KEY_V2 until the reviewed dual-key
  // rotation code is deployed. Writing Cloudflare first lets a partial GitHub
  // failure be rolled back without losing the only copy of an active key.
  run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'put', 'MASTER_KEY_V2',
    '--name', values['worker-name']], `${secret}\n`);
  cloudflareWritten = true;
  run('gh', ['secret', 'set', 'MASTER_KEY_V2', '--repo', values['primary-repo'], '--env', 'production'], secret);
  run('gh', ['secret', 'set', 'MASTER_KEY_V2', '--repo', values['recovery-repo'], '--env', 'recovery'], secret);
} catch (error) {
  if (cloudflareWritten) {
    try { run(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'delete', 'MASTER_KEY_V2',
      '--name', values['worker-name']], 'y\n'); } catch {}
  }
  throw error;
}

console.log(JSON.stringify({ provisioned: true, secretName: 'MASTER_KEY_V2', privateValueWrittenToDisk: false,
  worker: values['worker-name'], primary: `${values['primary-repo']}:production`,
  recovery: `${values['recovery-repo']}:recovery` }));
