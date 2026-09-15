# Contributing

Team DevSpace original code is source-available under PolyForm Shield 1.0.0.
Read LICENSE before contributing. Contribute only material you have the right
to license under these terms; keep third-party code and notices under their
own licenses. Do not paste employer-owned or confidential material into a PR.

## Change flow

Open an Issue with the outcome and acceptance criteria. Branch from current
`main` (`fix/`, `feat/`, or `chore/`), implement the smallest useful change, then
open a PR referencing the Issue. Prefer reusing upstream/OS/provider features
to introducing new services, dependencies or duplicate state machines.

Run `npm run check`, `npm test` and any affected build/installer checks. Windows
shell tests use Git for Windows Bash; put its `bin` directory before the WSL
launcher in PATH. Record actual results and untested platforms in the PR.
Mocked APIs, extracted packages and emulation are not native installation proof.

`main` is the integration branch, not a daily development workspace. The
active ruleset is represented by `config/main-ruleset.json`: PR required, `verify` and
`secret-scan` checks required, resolved review threads, linear squash history,
no force push or deletion. A solo maintainer may merge their own PR after
reviewing the diff; required approvals are deliberately zero. Enforcement was
verified with rejected direct/force pushes, branch deletion and a pending-check
merge. Future policy edits still require live API verification, not just JSON.
Evidence is tracked in `docs/public-readiness.md` and the cutover Issue.

Preserve a noreply author and committer address. Where GitHub's merge API cannot
use the maintainer's noreply identity, a checked, single-commit PR can be integrated
by a protected fast-forward after all required checks and review threads pass.
Never disable rules or use admin bypass; a PR's `MERGED` label alone is not proof
that its required checks ran. Account-level web-merge email privacy is separate
from local Git configuration and must be checked before using that route.

## CI and release boundaries

PR CI has read-only repository permission and no production Environment.
Never run untrusted PR code with production credentials, `pull_request_target`,
a privileged `workflow_run`, or an employee/self-hosted runner. Pin Actions to
full commit SHAs. A contributor PR modifying CI still requires human inspection
before running it. Approve external-contributor workflow runs deliberately.

Public native candidates are manual, reviewed-main-only and sample-only. The
validation Environment is also restricted to main remotely; an `if:` expression
is not a substitute. It has only a masked, read-only historical-baseline origin,
not production deployment/signing credentials. Public CI uploads acceptance
receipts only, never installers. The production deployment workflow remains
disabled here; independently authorized operator builds and delivery are separate.

A merge does not publish. Preserve the exact accepted bytes, source commit,
release profile digest, signatures and receipt limitations. Do not overwrite
an existing version, force a rollout, or remove recovery baselines merely to
make a failing gate pass. Cross-platform install and upgrade acceptance is a
release gate, not a required expensive build for every small PR.

## Privacy

Do not commit `.runtime`, `.env`, credentials, signing private keys, employee
logs, screenshots of private UI, production resource IDs or binary backups.
Use `config/*.example.json` and reserved example domains. Do not use `git push
--mirror`; local Codex checkpoints are not release refs. Never upload raw
secret-scanner reports as public CI artifacts. Use a noreply Git commit email.

Security reports follow SECURITY.md rather than ordinary public Issues.
