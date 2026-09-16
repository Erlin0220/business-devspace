import { appendFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compareDottedVersions, isNativeMacosHost, machOMinimumMacOS, run } from './build-utils.mjs';
import { prepareCloudflaredSource } from './cloudflared-source.mjs';
import release from './release-profile.mjs';

if (process.platform !== 'darwin') throw new Error('Build cloudflared on a native macOS runner');
if (!isNativeMacosHost()) throw new Error('Translated macOS builds are not native acceptance');
const actualGo = (await run('go', ['version'], { capture: true })).stdout;
if (!actualGo.includes(`go${release.cloudflaredGoVersion} `)) throw new Error('Go version differs from the release pin');
const source = await prepareCloudflaredSource();
const output = resolve('build/native/cloudflared');
await mkdir(resolve('build/native'), { recursive: true });
await run('go', ['build', '-mod=vendor', '-trimpath', '-ldflags', `-X main.Version=${release.cloudflaredVersion}`,
  '-o', output, 'github.com/cloudflare/cloudflared/cmd/cloudflared'], {
  cwd: source, timeout: 600000, env: { CGO_ENABLED: '0', GOOS: 'darwin', GOARCH: process.arch === 'arm64' ? 'arm64' : 'amd64',
    MACOSX_DEPLOYMENT_TARGET: release.distribution.macosMinimumVersion },
});
if (!(await run(output, ['--version'], { capture: true })).stdout.includes(release.cloudflaredVersion)) throw new Error('cloudflared version mismatch');
const minimumMacOS = await machOMinimumMacOS(output);
if (compareDottedVersions(minimumMacOS, release.distribution.macosMinimumVersion) > 0) {
  throw new Error(`cloudflared requires macOS ${minimumMacOS}, above the release baseline ${release.distribution.macosMinimumVersion}`);
}
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `TEAM_DEVSPACE_CLOUDFLARED_BINARY=${output}\n`);
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `TEAM_DEVSPACE_CLOUDFLARED_MINIMUM_MACOS=${minimumMacOS}\n`);
console.log(`Pinned cloudflared built on matching native hardware (minimum macOS ${minimumMacOS}).`);
