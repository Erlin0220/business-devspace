import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { downloadPinned, run } from './build-utils.mjs';

// Build-time inspection only. Syft and its configuration never enter an
// employee payload; no registry credentials or remote license search is used.
export async function scanInventory(directory, output) {
  const pins = JSON.parse(await readFile('scripts/binaries.json', 'utf8'));
  const pin = pins.syft[`${process.platform}-${process.arch}`];
  if (!pin) throw new Error('Unsupported native inventory platform');
  const archive = await downloadPinned(pin, 'build/cache');
  const toolDirectory = resolve('build/audit-tools/syft');
  await rm(toolDirectory, { recursive: true, force: true });
  await mkdir(toolDirectory, { recursive: true });
  await run('tar', ['-xf', resolve(archive), '-C', toolDirectory]);
  const syft = join(toolDirectory, process.platform === 'win32' ? 'syft.exe' : 'syft');
  await mkdir(dirname(resolve(output)), { recursive: true });
  // A directory scan defaults to dependency declarations (including omitted
  // optional packages and .github workflows). Select installed-package and
  // executable catalogers explicitly: a lockfile is not proof of shipped bytes.
  const catalogers = ['javascript-package-cataloger', 'go-module-binary-cataloger',
    'binary-classifier-cataloger', 'elf-binary-package-cataloger', 'pe-binary-package-cataloger',
    'cargo-auditable-binary-cataloger'];
  await run(syft, ['scan', `dir:${resolve(directory)}`, '--quiet', '--override-default-catalogers', catalogers.join(','),
    '-o', `syft-json=${resolve(output)}`, '-o', `cyclonedx-json=${resolve(output)}.cdx.json`], {
    timeout: 300000, env: { SYFT_CHECK_FOR_APP_UPDATE: 'false', SYFT_GOLANG_SEARCH_REMOTE_LICENSES: 'false' },
  });
  const report = JSON.parse(await readFile(output, 'utf8'));
  // Raw scan remains a local build artifact. The review summary deliberately
  // omits host paths, Syft configuration, environment and package descriptions.
  const summary = { schema: 1, tool: 'syft', toolVersion: report.descriptor?.version,
    packages: report.artifacts.map(item => ({ name: item.name, version: item.version, type: item.type, purl: item.purl,
      licenses: (item.licenses ?? []).map(license => license.spdxExpression || license.value).filter(Boolean),
      foundBy: item.foundBy, locations: item.locations.map(location => inventoryPath(location.path)) })) };
  await writeFile(`${output}.summary.json`, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify({ inventory: true, toolVersion: summary.toolVersion, packages: summary.packages.length,
    byType: Object.fromEntries([...new Set(summary.packages.map(item => item.type))].sort().map(type =>
      [type, summary.packages.filter(item => item.type === type).length])) }));
  return summary;
}

export function inventoryPath(value) {
  const path = value.replaceAll('\\', '/');
  if (!path.startsWith('/') || path.startsWith('//') || path.includes(':') || path.split('/').includes('..')) {
    throw new Error('Inventory location is not a payload-relative path');
  }
  return path;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { directory: { type: 'string' }, output: { type: 'string', default: 'build/redistribution/syft.json' } } });
  if (!values.directory) throw new Error('Supply an extracted payload directory, not a source checkout');
  await scanInventory(values.directory, values.output);
}
