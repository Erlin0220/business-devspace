# Source-only public cutover

This is a new, independent source-available repository, created from an audited
source snapshot. It is not a fork, mirror, visibility change or history rewrite
of the internal repository. Old Git history, Releases, Actions runs/logs/caches,
PR metadata, private configuration and raw audit reports are not imported.
The internal repository remains private and retains its historical evidence.

## License and disclosure boundary

Original code retains the unmodified PolyForm Shield 1.0.0 text, SHA-256
`67530f8e9adfcc5d2e9d72b804500cebb7472ff84c34a6729a80a2a9be901ee6`.
This is source-available, not OSI open source. Existing third-party licenses and
notices remain applicable. Tracked operator configuration is reserved examples;
commits use a GitHub noreply address. Publicity grants no production access.

## Public binary distribution remains blocked

No old installers or GitHub Releases are migrated here. Building successfully
does not satisfy redistribution obligations. Before any public installer
delivery, including Actions artifacts, close the exact-version Git for Windows
and applicable MSYS/MinGW complete-corresponding-source delivery obligations,
and the remaining Go/compiler/runtime notice inventory. A generic upstream link
or SBOM is not evidence of a fulfilled source delivery arrangement.

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

Public enforcement, ordinary CI and the four native jobs must be recorded from
actual executions. Until all replacements pass, Codemagic and the old Intel
handoff remain recoverable fallback paths; do not claim migration from workflow
configuration alone. The cutover tracking Issue records run and PR evidence.

## Primary references

- https://polyformproject.org/licenses/shield/1.0.0.txt
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- https://www.gnu.org/licenses/gpl-faq.en.html
- https://gitforwindows.org/technical-overview.html
