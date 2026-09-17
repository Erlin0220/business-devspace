import { spawnSync } from 'node:child_process';

export function runSecretCommand(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', windowsHide: true,
    timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
  // Provider diagnostics may contain supplied data. Never echo a secret-bearing
  // command's input/output into an audit log or a chat transcript.
  if (result.status !== 0) throw new Error(`Secret-store command failed (${command}, exit ${result.status ?? 'unavailable'}); inspect the provider without exposing credential values.`);
  return result.stdout;
}

export function assertSecretAbsent(output, name, location) {
  let entries;
  try { entries = JSON.parse(output); } catch { throw new Error(`Cannot verify existing secret names in ${location}`); }
  if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry.name !== 'string')) {
    throw new Error(`Cannot verify existing secret names in ${location}`);
  }
  if (entries.some(entry => entry.name === name)) {
    throw new Error(`${name} already exists in ${location}; restore the existing root or use an explicit compatible migration, never overwrite it through provisioning.`);
  }
}
