# Source-only public cutover

This is a new, independent source-available repository, created from an audited
source snapshot. It is not a fork, mirror, visibility change or history rewrite
of the internal repository. Old Git history, Releases, Actions runs/logs/caches,
PR metadata, private configuration and raw audit reports are not imported.
The internal repository remains private and retains its historical evidence;
new development belongs to `Erlin0220/business-devspace`.

## License and disclosure boundary

Original code retains the unmodified PolyForm Shield 1.0.0 text, SHA-256
`67530f8e9adfcc5d2e9d72b804500cebb7472ff84c34a6729a80a2a9be901ee6`.
This is source-available, not OSI open source. Existing third-party licenses and
notices remain applicable. Tracked operator configuration is reserved examples;
commits use a GitHub noreply address. Publicity grants no production access.

## Public binary distribution gate

No old installers or GitHub Releases are migrated here. Building successfully
does not satisfy redistribution obligations. Git for Windows is no longer part
of Team DevSpace release bytes: Windows reuses an existing Git Bash or acquires
the exact pinned official asset directly from the upstream GitHub Release after
SHA-256 verification. The final public-binary gate therefore applies to the
components actually redistributed by Team DevSpace: Node, cloudflared, locked
npm dependencies, native/Rust payloads and their notices/source obligations. A
generic upstream link or SBOM is not evidence of a completed redistribution
review; final extracted bytes remain the authority.

The native workflow therefore uploads **only acceptance.json**, never installer
bytes, extracted applications, private audit reports or operator profiles.
Its candidates are unsigned sample editions and cannot replace employee builds.

## Isolated validation

Ordinary CI runs syntax/policy checks, tests, a non-deploying Worker bundle, and
Gitleaks over reachable Git history. Native validation manually builds and
installs Windows x64, Linux x64, macOS ARM64 and native Intel candidates from one
reviewed main commit. Historical immutable installers are hash-pinned, read-only
test inputs; the protected validation Environment supplies their origin without
embedding it in the candidate. Enrollment is a local/seeded fixture, never a
production employee account. No employee machine is an Actions runner.

Historical installers keep their original update origin. The disposable test
home explicitly disables automatic updates before running old desktop versions,
so a live rollout cannot replace the candidate behind a manual upgrade test.
This is a fixture preference, not a change to employee settings or production
policy, and does not claim to validate automatic-update rollout behavior.

Reports distinguish matching native architecture, actual installer execution,
cross-version upgrades, repair, failure recovery and cleanup from manual employee
UI / Gatekeeper / SmartScreen checks. A green build-only job is not acceptance.

## Repository process

Use Issues, branches, PRs and squash merges. Main requires `verify` and
`secret-scan` from GitHub Actions, up-to-date branches, resolved review threads,
linear history, and prohibits deletion and force-push with no bypass actors.
The solo-maintainer approval count is zero: this does not claim independent
human approval. Live API read-back and rejected-operation probes, not the policy
JSON alone, are the enforcement evidence.

Dependabot version PR limits are restored after Public cutover. Production
deployment/signing credentials are not copied to this repository. The production
Gateway, Cloudflare resources, Access Keys, update policy, download origin and
already running clients remain outside this cutover.

## Migration evidence

The initial complete replacement cohort is
[run 34988723116](https://github.com/Erlin0220/business-devspace/actions/runs/34988723116)
at commit `45f9efe297cd7aa43fbcb3c885864d983da5a202`. All four native jobs passed;
their downloaded receipts have the same commit and sample-profile digest,
`sourceDirty: false`, matching native architecture, actual final-entrypoint
transactions, cross-version upgrades and owned-residue cleanup. Windows ran
the immutable 0.2.3 and 0.2.4 installers rather than rebuilt substitutes.

Only after that evidence was checked were Codemagic's API/workflow/commands,
the external Intel handoff and the Rosetta publication waiver removed. Regression
tests reject the retired waiver even when an old caller still supplies it.
Local build/debug tools, employee opt-in checks, historical baseline hashes and
the existing operator delivery tooling remain; public CI does not replace the
separately authorized production distribution process. Old cloud/build history
is archival evidence, not an active public CI chain.

[Cutover Issue #1](https://github.com/Erlin0220/business-devspace/issues/1)
records subsequent reviewed changes, final CI/runs and enforcement evidence.
[Binary gate #2](https://github.com/Erlin0220/business-devspace/issues/2)
remains independent until the final redistributed-byte inventory and notices are
accepted. The previous PortableGit corresponding-source blocker is removed by
the distribution boundary rather than by weakening its license obligations.
Receipt-only artifacts do not authorize release.

## Primary references

- https://polyformproject.org/licenses/shield/1.0.0.txt
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://www.gnu.org/licenses/gpl-faq.en.html
- https://gitforwindows.org/technical-overview.html
