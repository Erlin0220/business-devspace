# Quickstart Validation: Update Reliability and Upgrade UX

Use this guide after implementation. It is a validation sequence, not an authorization to deploy production or publish a release.

## Prerequisites

- Work from the feature branch based on current public `main`.
- Install the repository's pinned npm dependencies.
- Do not change production Cloudflare, stable/auto/minimumSupported, or public release aliases while running local validation.

## 1. Static and dependency checks

```powershell
npm run check
npm ls better-sqlite3 proper-lockfile --depth=2
```

Expected:

- repository checks pass;
- Team DevSpace owns `better-sqlite3` directly for `client/process-lock.mjs`;
- no Team DevSpace source imports `proper-lockfile`; an upstream transitive copy may remain under `@waishnav/devspace`.

## 2. Process crash and contention tests

```powershell
node --test --test-concurrency=1 test/process-lock.test.mjs test/operation.test.mjs test/update-lifecycle.test.mjs
```

Expected:

- one live process owns each local lock domain;
- a killed owner can be reacquired immediately without aging/deleting a stale lock;
- a second apply returns product-level busy/deferred state and never creates another handoff;
- a retained legacy `.apply.lock` artifact does not permanently block the new updater;
- unresolved `attempt.json` still produces `installer_pending` even after process ownership is free;
- update cache cleanup cannot race an active apply.

## 3. Control Center update UX

Run the existing browser smoke harness used by the repository:

```powershell
node scripts/control-browser-smoke.js
```

Validate these states:

1. Optional update: manual check opens release-note confirmation.
2. `稍后`: no install is started; modal closes; focus returns; a notice explains how to continue; update CTA remains.
3. Resume: update CTA or explicit manual check reopens the same current target.
4. Background discovery: same optional version does not pop the modal by itself.
5. Grace period: minimum supported version and exact local enforcement time are visible without claiming remote work is already blocked.
6. Required: persistent message explains that the current client is unsupported for new remote work and provides the update action.
7. Required + dismiss modal: required indicator remains; diagnostics/logs/settings remain reachable.

## 4. Full local regression suite

```powershell
npm test
npm run test:distribution
npm run package -- --reuse-dependencies
npm run acceptance:platform
```

Use the repository's existing platform-specific skips/requirements. Any failure must be classified rather than hidden by changing unrelated tests.

## 5. Native release-candidate evidence

Before a version containing this feature is promoted to `stable`, run the existing exact-commit GitHub native candidate workflow and require all configured targets:

- Windows x64: success, including cross-version upgrade preservation and updater recovery path.
- Linux x64: success, including standalone owner lifecycle.
- macOS arm64: success.
- macOS x64/Intel: success.

Confirm candidate evidence is bound to the exact source commit. A build-only result is not publication acceptance, and this feature workflow does not itself publish bytes or advance rollout policy.
