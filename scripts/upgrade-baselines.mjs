import { resolve } from 'node:path';
import { downloadPinned } from './build-utils.mjs';
import { packageName } from '../client/release-catalog.mjs';
import release from './release-profile.mjs';

// Previously published immutable bytes, not rebuilt approximations of an old
// client. Pins were checked against the retained release catalogs on 2026-09-15.
// These are native acceptance inputs, never a runtime downgrade/update policy.
export const UPGRADE_BASELINES = {
  '0.2.3': {
    'win32-x64': 'c3b26318d3c511efd3f7df05be84946883ba8b71da59596c2f7e2b308de0b7e3',
    'darwin-arm64': 'fe1981b345e8b99307e07d0dbc7b2b7b297025bc87fa795702306bb7bf3fbdd2',
    'darwin-x64': '0c2492e22b220a76c79256e4a25dfe56ed651434928e841b1fb0755f586ec7d9',
    'linux-x64': 'c21e4281b074bcf5f347e368d96902315b5b1674310f4ae80f3d56644dca1c42',
  },
  '0.2.4': {
    'win32-x64': '7298fd8b5a4eee0645ceb32974aa5181dedd257093f719aeaf114427227c801a',
    'darwin-arm64': '55b1eceff618b7a7d11e17692d2205b3cab92c9d622f73288b0eda6fb4962914',
    'darwin-x64': '76a867a761de5028d391f6b0ab32d453f5d9ee0dd7b955c23345f52306457a29',
    'linux-x64': '0db409c7123812841452b574c084dfa949504420011cec24558552f172d664c1',
  },
  // Exact production catalog bytes published for the current employee release.
  // Read back from the immutable 0.2.6 catalog on 2026-09-16; never rebuild an
  // approximation of this baseline when validating the 0.2.7 upgrade path.
  '0.2.6': {
    'win32-x64': '97cd7c44dab3401aa82e8f9ad72888fc547dd79aea664364c904a53051234652',
    'darwin-arm64': '0e8c4acb7e396edb19957c5e7964c4acf66298aa72ad13d24c449be115fc2516',
    'darwin-x64': '63cb392be269a7877f538cab3e670f351bcad010cdcc63040c6308448edf87a2',
    'linux-x64': '47bb9b990c14a39b39a579cac1547e11ed6ed80bd5a0683ad157884298d403cb',
  },
};

export async function downloadUpgradeBaseline(version, target) {
  const sha256 = UPGRADE_BASELINES[version]?.[target];
  if (!sha256) throw new Error('Unknown immutable upgrade baseline');
  // Public CI builds the sample edition. Baseline retrieval is a separate,
  // read-only input, never an operator profile embedded into the candidate.
  const origin = new URL(process.env.TEAM_DEVSPACE_UPGRADE_BASELINE_ORIGIN || release.distribution.origin);
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash || origin.hostname.endsWith('.example.com')) {
    throw new Error('Immutable upgrade acceptance requires an explicit credential-free HTTPS baseline origin');
  }
  return downloadPinned({ sha256,
    url: `${origin.origin}/releases/${version}/${packageName(version, target)}`,
  }, resolve('build/cache/upgrade-baselines'));
}
