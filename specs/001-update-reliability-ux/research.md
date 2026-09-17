# Research: Update Reliability and Upgrade UX

## Scope Evidence

### Former private 0.2.7 track

- Old private Issue `Erlin0220/team-devspace#10` recorded a real Windows updater failure: a stale/contended apply lock surfaced `Lock file is already being held`, while `proper-lockfile@4.1.2` threw an `updateTimeout` error and the Tray restarted into the same blocked update path.
- The issue's 0.2.7 acceptance criteria required crash recovery, fail-closed concurrent apply, product-level busy states, preservation of the installer-attempt/signature/binding/root/pause boundaries, and a real Windows cross-version upgrade test.
- Private commit `9bff71e` (merged there as `ef40006`) proved one viable fix: native SQLite transaction locks for lifecycle/update/cache/standalone ownership, plus targeted crash/concurrency tests. This is prior art only; the public repository must receive a fresh implementation/review rather than imported private history.

### Current public repository

- Current public `client/operation.mjs`, `client/updates.mjs`, `client/update-cache.mjs` and `client/standalone.mjs` still use `proper-lockfile`; `package.json` still declares `proper-lockfile@4.1.2` directly.
- `better-sqlite3@12.11.1` is already present through pinned `@waishnav/devspace@1.0.8`, and its install script is already allowed. If Team DevSpace code imports it directly, it should become a direct dependency rather than relying on transitive hoisting.
- Current public update UX already includes versioned release notes, a confirmation dialog, “稍后”, a manual check action, signed metadata, background automatic apply, persisted retry deadlines, and a `required` projection for minimum-supported policy.
- Current “稍后” only closes the modal. The visible update action can reopen it, but the UI does not explicitly explain that resume path.
- Current required state says “需要升级/当前版本需要升级” and shows minimum/stable versions. A future minimum deadline is shown before enforcement, but the enforced state does not explicitly explain that new remote work is being rejected by policy or that local recovery remains available.
- The Windows scheduled update handoff already creates a self-expiring Task Scheduler registration in the public repository. That old concern is already solved and is only a regression boundary for this feature.
- PortableGit redistribution removal and the source-available/public-repository migration are already complete in the public repository and are explicitly outside this feature.

## Decision 1: Use Native SQLite Transaction Ownership

**Decision**: Implement a small local process-lock adapter using `better-sqlite3` and a held `BEGIN IMMEDIATE` transaction. The kernel/SQLite releases the underlying file lock when the owner process exits or crashes. Use one lock database per ownership domain and expose acquisition/release plus a read-only held probe.

**Rationale**:

- Directly solves the observed failure mode: there is no heartbeat timer and no stale lease that must age out after process death.
- Reuses a mature native dependency already shipped by the pinned runtime instead of creating a custom PID/lease protocol.
- Preserves strong cross-process exclusion while making crash release an operating-system property.
- The former 0.2.7 private implementation and tests already demonstrated feasibility on this codebase.

**Alternatives considered**:

- Keep `proper-lockfile` and tune stale/update/retry timing: rejected because it retains the heartbeat/release mechanism implicated in the production failure and still makes crash recovery lease-based.
- Custom PID file plus process probing: rejected because PID reuse, boot/session identity and cross-platform semantics would add a new bespoke ownership protocol.
- Platform-specific mutex/file-lock implementations: rejected because they would split business ownership logic by OS and add native maintenance surface.

## Decision 2: Separate Ephemeral Ownership from Durable Installer Attempts

**Decision**: Process locks answer only “who may mutate now.” Existing `attempt.json`/result/install-request facts continue to answer “did an installer handoff already occur and is it unresolved?” A process crash may release ownership immediately, but an unresolved recent attempt still returns `installer_pending` before network/download work.

**Rationale**: This preserves the current strongest duplicate-install guard. A crash can occur after Task Scheduler/systemd/macOS Installer already owns activation; automatically treating lock release as safe retry would be incorrect.

**Alternatives considered**:

- Delete the attempt when a process dies: rejected because the OS installer may already be running.
- Keep a long-lived process lock across installer lifetime: rejected because handoff intentionally transfers ownership to OS-native installers and the client process may legitimately exit.

## Decision 3: Migrate All Team-Owned Local Lock Sites Together

**Decision**: Use the same process-lock primitive for lifecycle operations, update check/apply, update cache GC, and Linux standalone keeper ownership. Give the new locks distinct `.sqlite` filenames and stop consulting old proper-lockfile artifacts as current ownership facts.

**Rationale**: Partial migration would preserve the same heartbeat failure path in another subsystem or allow cache/lifecycle logic to disagree about ownership. Distinct filenames make old `.apply.lock`/`.check.lock`/`.lifecycle.lock` artifacts inert without destructive cleanup.

**Alternatives considered**:

- Fix only update apply: rejected because lifecycle and cache operations share the same safety boundary and `proper-lockfile` remains a potential optional-failure escalator.
- Delete every old lock artifact during upgrade: rejected because recursive cleanup of unknown paths violates the repository's ownership/safety rules and is unnecessary.

## Decision 4: “Later” Is a Dismissal, Not a Scheduler

**Decision**: Keep “稍后” local and ephemeral. Closing the confirmation must not install or change policy. Show a short notice explaining that the update remains available; the persistent update card/action and explicit manual check are the resume paths. Background discovery does not re-open the same optional modal automatically.

**Rationale**: The existing product already has a low-frequency scheduler for discovery/automatic policy. Adding a second “remind me later” timer or persisted ignored-version state would create more state than the user need requires.

**Alternatives considered**:

- Persist a snooze deadline and auto-pop the modal later: rejected as unnecessary nag/state machinery for an internal product with a visible update section and automatic-update policy.
- Treat Later as “skip this version”: rejected because it would conflict with administrator stable/auto/minimum-supported policy and requires a new durable preference contract.

## Decision 5: Required-Upgrade UX Projects Existing Policy

**Decision**: Drive the strong required-upgrade presentation from the existing local `updates.required`, `minimumSupported`, `enforceAfter` and stable values. Before deadline, show the deadline as warning context; after deadline, keep a persistent callout explaining that the current version no longer supports new remote work and provide the existing update action. Do not add another Gateway block or server state.

**Rationale**: The Gateway already owns enforcement and returns `426 client_upgrade_required` for new MCP work after the grace period. Local UI already has the signed policy projection needed to explain the state without extra network traffic.

**Alternatives considered**:

- Infer required state only from a received 426: rejected because the Control Center can explain policy before a remote call fails and 426 is not a new local authorization channel.
- Disable all local controls when required: rejected because project policy explicitly preserves update/diagnostic/recovery surfaces.

## Decision 6: Dependency Ownership

**Decision**: Add `better-sqlite3@12.11.1` as a direct dependency when `client/process-lock.mjs` is introduced. Remove Team DevSpace's direct `proper-lockfile` declaration only after all project imports migrate; do not try to remove an upstream transitive copy used internally by `@waishnav/devspace`.

**Rationale**: Direct imports require direct dependency ownership. Pinning the already-resolved version avoids runtime drift and matches the project's package-integrity policy.

## Resolved Unknowns

- No new D1 schema is required.
- No new Gateway endpoint is required.
- No new native helper/daemon is required.
- No persistent snooze entity is required.
- Windows scheduled-task cleanup is already present and should be tested/preserved, not reimplemented.
- The feature should not carry a version number in its design artifacts; the next immutable release version is chosen by the separate release workflow.
