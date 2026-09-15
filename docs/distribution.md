# Client distribution

`release.config.json` declares versions/platforms and a sample edition. The
explicit operator release profile supplies the Gateway, download origin and
existing update verification key. The resolved configuration is embedded in
the client; environment variables cannot replace an installed client's trust
anchor. Never stage production inputs by modifying tracked files.

## Components

Every enabled target has `app`, `devspace-runtime`, `node` and `cloudflared`
content-addressed components. Windows also has the conditional, unmodified
official PortableGit self-extractor. Component hashes/sizes are embedded in
the final EXE, PKG or Linux archive through the installer manifest. Employees
do not fetch runtime dependencies or build native modules during installation.

The app component includes LICENSE, NOTICE and LICENSES. Upstream npm/runtime
licenses remain in their packages. Source maps and TypeScript declarations
are not employee runtime inputs; deleting them must not strip notices.
See LICENSES/README.md for outstanding public-binary redistribution duties.

Build input versions, binary SHA-256 pins, source commit, SBOM and release
profile digest are recorded independently. An acceptance receipt must match
the actual packaged profile and final entrypoint bytes, not merely the
environment used to run acceptance.

## Native candidates

The manual GitHub Actions matrix uses `windows-2022`, `ubuntu-24.04`,
`macos-15` ARM64 and `macos-15-intel`. Each runner builds its own native
dependencies and final installer. Do not cross-copy PTY/SQLite modules or
rebuild a different package after acceptance. macOS cloudflared uses the
existing pinned upstream source/Go inputs on matching hardware.

Sample candidates are labeled `SAMPLE-NOT-FOR-EMPLOYEES`. Public native CI uses
only this edition and retains acceptance receipts, never installer bytes or a
production profile. The validation Environment is main-restricted. Authorized
operator builds remain separate; no workflow changes stable/auto/minimum support.

The complete GitHub native replacement passed one exact-commit cohort before
Codemagic and external Intel handoff were removed; see [evidence](public-readiness.md#migration-evidence).
Historical M2/Rosetta receipts remain historical limitations, not native Intel
acceptance and not an exception available to new publication. Each new candidate
still needs its own final-byte, cross-version, native lifecycle and recovery proof.

Local validation can keep outputs away from previously accepted artifacts:

```sh
npm run package -- --reuse-dependencies --output build/candidate-release
node scripts/verify-release.mjs --root build/candidate-release/offline/0.2.6 --target win32-x64
```

Use the actual declaration version/host target, not these example values.
`build/bundle-<target>` remains a replaceable development workspace. Never run
live employee-upgrade acceptance on a working employee installation without
separate authorization. Windows Git Bash, Linux user systemd and disposable
macOS Installer sessions have different native requirements.

## Publication

The current publisher still uses the existing owned static HTTPS server and
SSH. Its configuration lives in private `.runtime/downloads.json`; the public
source contains only `config/downloads.example.json`. No R2 or download proxy
is introduced. Software downloads do not need an employee Key or GitHub login.

Before publishing, require one clean source commit, one operator profile,
exact accepted final hashes, independent update signatures and all platform
gates. Existing versions are immutable. The publisher retains the configured
rollout/recovery versions and refuses unsafe pruning; it does not equate a
new stable pointer with all devices having upgraded.

GitHub Releases migration is pending compatibility and license verification;
see [public readiness](public-readiness.md). Old clients reject HTTP redirects,
so replacing the existing static files with 302 redirects is not compatible.
