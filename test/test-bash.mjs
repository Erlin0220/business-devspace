import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

export function testBash(env = process.env, platform = process.platform) {
  if (env.TEAM_DEVSPACE_TEST_BASH) return env.TEAM_DEVSPACE_TEST_BASH;
  if (platform !== 'win32') return 'bash';
  const roots = [
    ...(env.ProgramFiles ? [join(env.ProgramFiles, 'Git')] : []),
    ...(env['ProgramFiles(x86)'] ? [join(env['ProgramFiles(x86)'], 'Git')] : []),
  ];
  for (const directory of String(env.PATH ?? '').split(delimiter)) {
    const clean = directory.replace(/^"(.*)"$/, '$1');
    if (!clean) continue;
    if (existsSync(join(clean, 'git.exe')) && existsSync(join(clean, 'bash.exe'))) return join(clean, 'bash.exe');
    if (existsSync(join(clean, 'git.exe'))) roots.push(dirname(clean));
  }
  for (const root of roots) {
    const bash = join(root, 'bin', 'bash.exe');
    if (existsSync(join(root, 'cmd', 'git.exe')) && existsSync(bash)) return bash;
  }
  throw new Error('Windows tests require Git for Windows Bash; WSL bash.exe is not a compatible test host');
}
