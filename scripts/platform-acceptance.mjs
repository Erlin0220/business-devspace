import { spawn } from 'node:child_process';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import release, { verifyProfileBinding } from './release-profile.mjs';
import { isNativeMacosHost, run, sha256File, sourceIdentity } from './build-utils.mjs';
import { UPGRADE_BASELINES } from './upgrade-baselines.mjs';

const { values } = parseArgs({ options: {
  'direct-windows-installer': { type: 'boolean' },
  'employee-windows-installer': { type: 'boolean' },
  'system-macos-installer': { type: 'boolean' },
  output: { type: 'string' },
} });
const target = `${process.platform}-${process.arch}`;
if (!release.distribution.targets.includes(target)) throw new Error(`Current platform is not an enabled release target: ${target}`);
const directWindowsInstaller = Boolean(values['direct-windows-installer']) || process.env.TEAM_DEVSPACE_FINAL_WINDOWS_INSTALLER === '1';
const employeeWindowsInstaller = Boolean(values['employee-windows-installer']);
if (employeeWindowsInstaller && (process.platform !== 'win32' || directWindowsInstaller)) {
  throw new Error('Employee installation acceptance requires Windows and cannot be combined with disposable-runner acceptance');
}
if (directWindowsInstaller && process.platform !== 'win32') throw new Error('Direct final-installer acceptance is Windows-only');
if (directWindowsInstaller && process.env.CI !== 'true') throw new Error('Direct final-installer acceptance is reserved for an isolated CI runner');
const systemMacosInstaller = Boolean(values['system-macos-installer']);
const disposableMacos = process.env.CI === 'true' && (process.env.CM_BUILD_ID ||
  (process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_OS === 'macOS'));
if (systemMacosInstaller && (process.platform !== 'darwin' || !disposableMacos)) {
  throw new Error('System macOS acceptance is reserved for a disposable Codemagic or GitHub macOS runner');
}
function runNode(script, args = []) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', windowsHide: true, env: process.env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal || code !== 0) reject(new Error(`${basename(script)} failed (${signal ?? code})`));
      else resolveRun();
    });
  });
}

const directory = resolve('release', 'offline', release.version, target);
const output = resolve(values.output ?? join(directory, 'acceptance.json'));
// A failed rerun must not leave a previous green report eligible for publishing.
await rm(output, { force: true });
const nativeArchitecture = process.platform !== 'darwin' || isNativeMacosHost();
await runNode('scripts/verify-release.mjs', ['--target', target]);
const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
const app = manifest.components.find(component => component.name === 'app');
if (!app || !/^objects\/sha256\/[a-f0-9]{64}\/app\.tar\.gz$/.test(app.path)) {
  throw new Error('Acceptance requires the canonical app component');
}
const tar = process.platform === 'win32' ? join(process.env.SystemRoot, 'System32', 'tar.exe') : '/usr/bin/tar';
const embedded = async name => JSON.parse((await run(tar, ['-xOf', join(directory, app.path), name], { capture: true })).stdout);
const profileSha256 = verifyProfileBinding(await embedded('release.config.json'),
  await embedded('release-provenance.json'), release);

const entrypoint = process.platform === 'win32'
  ? join(directory, `Team-DevSpace-${release.version}-windows-x64-setup.exe`)
  : process.platform === 'darwin'
    ? join(directory, `Team-DevSpace-${release.version}-macos-${process.arch}.pkg`)
    : join(directory, `Team-DevSpace-${release.version}-linux-${process.arch}-offline.tar.gz`);
await access(entrypoint);
// Bind evidence to the verified bytes before installer transactions. Those transactions
// may trigger platform self-cleanup/AV races, but publish verification re-hashes the
// downloaded artifact and refuses any byte drift from this identity.
const entrypointIdentity = { name: basename(entrypoint), sha256: await sha256File(entrypoint) };

const desktopTray = ['win32', 'darwin'].includes(process.platform);
if (desktopTray) {
  const packagedTray = process.platform === 'win32'
    ? resolve(`build/bundle-${target}/platform/windows/team-devspace-tray.exe`)
    : resolve(`build/bundle-${target}/platform/macos/Team DevSpace Tray.app/Contents/MacOS/TeamDevSpaceTray`);
  await runNode('scripts/tray-smoke.mjs', [packagedTray]);
}

const nativeStartup = ['win32-x64', 'linux-x64'].includes(target) || systemMacosInstaller;
if (nativeStartup && !systemMacosInstaller) await runNode('scripts/native-smoke.mjs');

if (process.platform === 'win32') {
  await runNode('scripts/installer-smoke.mjs', directWindowsInstaller ? ['--installer', entrypoint, '--direct'] : ['--installer', entrypoint]);
  if (employeeWindowsInstaller) await runNode('scripts/windows-installed-smoke.mjs', ['--live', '--installer', entrypoint]);
} else {
  await runNode('scripts/unix-installer-smoke.mjs');
  if (systemMacosInstaller) await runNode('scripts/macos-package-smoke.mjs');
}

let commit;
let windowsUpgradeReceipt;
if (directWindowsInstaller) {
  windowsUpgradeReceipt = JSON.parse(await readFile(resolve('build/windows-installer-smoke.json'), 'utf8'));
  if (windowsUpgradeReceipt.passed !== true || windowsUpgradeReceipt.sourceInstallerSha256 !== entrypointIdentity.sha256 ||
      Object.keys(UPGRADE_BASELINES).some(version => !windowsUpgradeReceipt.crossVersionUpgrades?.some(item =>
        item.from === version && item.to === release.version && item.baselineSha256 === UPGRADE_BASELINES[version][target]))) {
    throw new Error('Missing exact-byte Windows cross-version installation evidence');
  }
}
let sourceDirty = null;
try {
  ({ commit, sourceDirty } = sourceIdentity());
} catch { commit = 'unknown'; }
const evidence = {
  schema: 1,
  passed: true,
  release: release.version,
  releaseProfileSha256: profileSha256,
  target,
  commit,
  sourceDirty,
  entrypoint: entrypointIdentity,
  checks: {
    releaseLayout: true,
    installerTransaction: true,
    installedPayload: true,
    nativeArchitecture,
    existingInstallUpgrade: process.platform === 'win32' ? employeeWindowsInstaller || Boolean(windowsUpgradeReceipt)
      : process.platform === 'darwin' ? systemMacosInstaller : true,
    finalEntrypointTransaction: process.platform === 'win32' ? directWindowsInstaller || employeeWindowsInstaller
      : process.platform === 'darwin' ? systemMacosInstaller : true,
    trayProtocol: desktopTray,
    traySingleInstance: desktopTray,
    nativeStartup,
    zeroResidue: true,
  },
  limitations: process.platform === 'darwin'
    ? [systemMacosInstaller
      ? 'System PKG installation, first-run UI visibility, interrupted-setup recovery, installed runtime and LaunchAgent/menu-bar lifecycle were tested; Enrollment was seeded, not submitted through the first-run form. Real employee login, Gatekeeper approval and administrator dialogs remain manual.'
      : 'Only PKG extraction and internal bootstrap transactions were tested, not system PKG installation or a LaunchAgent login session.',
      ...(!nativeArchitecture ? ['This process is not verified on matching native CPU architecture; Rosetta is not Intel hardware acceptance.'] : [])]
    : process.platform === 'win32' && employeeWindowsInstaller
      ? ['The unmodified final EXE upgraded, uninstalled and restored the existing employee installation. Native menu tests are separate; transient GUI/console behavior was not exhaustively observed.']
      : process.platform === 'win32' && !directWindowsInstaller
        ? ['Local NSIS acceptance uses the final payload with isolated registry/Start Menu identities; the unmodified final EXE is not installed over an existing employee installation.']
        : process.platform === 'win32'
          ? ['Disposable-runner enrollment used a loopback fixture, not an employee account. The final unsigned sample EXE and immutable older installers were executed; employee desktop/UAC/SmartScreen interaction was not verified.']
          : ['Disposable-runner enrollment was seeded, not an employee production account.'],
};
if (process.env.GITHUB_ACTIONS === 'true') {
  const required = ['releaseLayout', 'installerTransaction', 'installedPayload', 'nativeArchitecture',
    'existingInstallUpgrade', 'finalEntrypointTransaction', 'nativeStartup', 'zeroResidue',
    ...(desktopTray ? ['trayProtocol', 'traySingleInstance'] : [])];
  if (sourceDirty !== false || commit !== process.env.GITHUB_SHA || required.some(check => evidence.checks[check] !== true)) {
    throw new Error('Hosted acceptance requires clean exact-commit source and every applicable native installation gate');
  }
}
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ acceptance: true, target, output, checks: evidence.checks }));
