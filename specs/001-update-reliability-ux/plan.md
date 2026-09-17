# Implementation Plan: Update Reliability and Upgrade UX

**Branch**: `feature/001-update-reliability-ux` | **Date**: 2026-09-17 | **Spec**: [spec.md](spec.md)

**Issue**: [#27](https://github.com/Erlin0220/business-devspace/issues/27)

**Input**: Feature specification from `/specs/001-update-reliability-ux/spec.md`

## Summary

Migrate the still-relevant part of the former private repository's planned 0.2.7 update work into the public repository without replaying old history or redoing capabilities that already landed. The implementation will replace project-owned heartbeat/stale-file local operation locks with a crash-safe process lock backed by the already-shipped SQLite native binding, preserve the existing durable installer-attempt guard, convert local contention into product-level busy/deferred states, and keep update/cache/standalone ownership on the same primitive. The Control Center will clarify the existing optional-update “稍后” flow and make an enforced minimum-supported-version state persistent and actionable without adding a second updater, server-side snooze state, or new Gateway API.

## Technical Context

**Language/Version**: JavaScript ES modules on Node.js `^22.22.2 || ^24.15.0 || >=26.0.0`; existing Windows PowerShell handoff and HTML/CSS/vanilla-JS Control Center

**Primary Dependencies**: `@waishnav/devspace@1.0.8`; promote the already-resolved `better-sqlite3@12.11.1` native dependency to an explicit direct dependency for project-owned process locks; remove the project's direct `proper-lockfile@4.1.2` dependency after all Team DevSpace lock consumers migrate (the upstream DevSpace dependency may continue to resolve it internally)

**Storage**: Existing private local JSON files under the Team DevSpace state/update directory plus ephemeral SQLite lock database files; no D1 migration and no new server-side user state

**Testing**: Node `node:test`; existing Control Center browser smoke; existing installer/distribution tests; native platform acceptance for Windows x64, Linux x64, macOS arm64 and macOS x64

**Target Platform**: Windows x64, Linux x64, macOS arm64, macOS x64/Intel

**Project Type**: Cross-platform desktop/client distribution with Cloudflare Gateway control plane

**Performance Goals**: Uncontended local lock acquisition/release should be effectively immediate; a killed owner must be recoverable within 5 seconds in tests; no new network request, D1 write, polling loop or background heartbeat is introduced by the feature

**Constraints**: Preserve signed update catalog verification, exact package size/hash checks, `attemptId`/`installer_pending`, Device identity/binding, Current Project Root and pause intent; keep one existing installer path per platform; optional UI/update failures must not stop healthy Runtime/Bridge/Tunnel; no routine direct commit to `main`

**Scale/Scope**: One local operation owner per installed Team DevSpace home; small enterprise fleet using the existing stable/auto/minimumSupported policy; changes are local-client/UI focused with no new public API surface

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Pre-design result | Design evidence |
|-----------|-------------------|-----------------|
| I. Reuse First, Keep the System Thin | PASS | Reuses the SQLite native binding already shipped through the pinned runtime dependency and the existing updater/installers. No daemon, push channel, new scheduler or parallel update state machine. |
| II. Security Boundaries and Secret Durability | PASS | Local ownership changes do not alter update signing, hash/size verification, Device binding or credentials. Concurrent apply remains fail-closed and durable installer attempts remain authoritative. |
| III. Isolate Optional Failures from Core Lifecycle | PASS | Lock/update/UI failures become bounded update/lifecycle results; healthy Runtime/Bridge/Tunnel ownership is not delegated to update presentation. |
| IV. Evolve Compatibly and Publish Immutable Evidence | PASS | New lock filenames avoid treating legacy lock artifacts as active ownership; existing persisted update attempts remain compatible. No published artifact is mutated. |
| V. Deliver from Evidence, Not Assumptions | PASS | Scope is based on former private Issue #10/commit evidence plus the current public source. Deterministic crash/concurrency/UI tests and native candidate acceptance are part of the tasks. |

**Post-design re-check**: PASS. `research.md`, `data-model.md` and `contracts/update-experience.md` keep the durable attempt guard distinct from ephemeral process ownership, introduce no new public API, and retain the current release acceptance boundary.

## Phase 0: Research Decisions

The detailed evidence and alternatives are captured in [research.md](research.md). The key decisions are:

1. Reuse the old 0.2.7 proof of a SQLite `BEGIN IMMEDIATE` process lock, but reimplement/review it against current public code rather than cherry-picking the private commit.
2. Make `better-sqlite3@12.11.1` a direct Team DevSpace dependency because project code will import it; do not rely on accidental npm hoisting from `@waishnav/devspace`.
3. Keep `attempt.json`/result facts as the durable cross-restart installer guard. Releasing a process lock never authorizes a duplicate installer.
4. Treat optional “稍后” as a UI-only dismissal of the current confirmation. Do not persist a server/client “ignored version” and do not add timer-based nagging. The existing update CTA/manual check is the resume path.
5. Reuse current `updates.required` plus the existing minimum-supported policy projection for required-upgrade UX; do not infer enforcement from generic Gateway failures or add another enforcement channel.
6. Preserve the already-present self-expiring Windows update task handoff; it is a non-regression requirement, not new implementation work.

## Phase 1: Design

### Ownership and Update Flow

- Add one small `client/process-lock.mjs` wrapper around a native SQLite transaction. It exposes acquisition/release and a read-only “held” probe for standalone ownership checks.
- Migrate Team DevSpace-owned lock sites together so no two project subsystems use incompatible ownership facts:
  - global lifecycle mutation owner in `client/operation.mjs`;
  - update check and update apply in `client/updates.mjs`;
  - update-cache GC in `client/update-cache.mjs`;
  - Linux standalone keeper ownership in `client/standalone.mjs`.
- Map a busy process lock at product boundaries to existing/explicit codes (`lifecycle_busy`, `update_busy`, and `local_operation_active` for automatic deferral). Do not surface SQLite messages.
- Use new `.sqlite` lock filenames so old `.apply.lock`, `.check.lock`, `.lifecycle.lock` or standalone lock artifacts are no longer authoritative. Do not recursively delete unknown legacy artifacts during normal acquisition.
- Retain the current apply ordering: acquire apply owner -> reject unresolved `attempt.json` before network/hash work -> re-read policy -> verify signed catalog/package -> enter lifecycle owner -> drain remote work -> persist `attemptId` -> hand off existing installer -> project phase/result -> release ephemeral owners.

### Update UX

- Keep the current release-notes modal, version-bound confirmation, failure fallback and explicit manual check behavior.
- On “稍后”, close only the modal, restore focus and emit a short local notice telling the user that the version remains available from Software Update. Do not persist dismissal state; background discovery already does not auto-open the modal.
- Keep the update action visible while a version is available. Explicit “更新并重新连接” and explicit manual check continue to reopen the version-bound modal.
- Expand the `required` projection into clear copy that distinguishes:
  - grace period: minimum version + exact local enforcement time, remote work still available;
  - enforced: current version stopped supporting new remote work + direct update action.
- Required status remains visible independently of the modal. Closing the modal cannot clear the required indicator/callout. Diagnostics, logs and local settings remain available.

### No New External Contract

No new Gateway endpoint, D1 field, release metadata field or employee credential is required. Existing local Control Center responses continue to carry the `updates` projection. The behavior contract for codes/UI is documented in [contracts/update-experience.md](contracts/update-experience.md).

## Project Structure

### Documentation (this feature)

```text
specs/001-update-reliability-ux/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── update-experience.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
client/
├── process-lock.mjs          # new crash-safe local process ownership primitive
├── operation.mjs             # lifecycle owner
├── updates.mjs               # check/apply ownership, automatic deferral, UI update facts
├── update-cache.mjs          # apply-owner-aware cache cleanup
├── standalone.mjs            # Linux standalone keeper ownership
├── control.js                # Later + required update presentation
├── control.html              # persistent required update callout if needed by final layout
└── control.css               # required update visual state if needed by final layout

test/
├── process-lock.test.mjs     # native ownership/crash tests
├── operation.test.mjs        # lifecycle crash recovery
├── update-lifecycle.test.mjs # apply/check/cache concurrency/restart tests
├── updates.test.mjs          # update contract regressions
└── desktop-ux.test.mjs       # shared desktop state regressions where applicable

scripts/
├── control-browser-smoke.js  # Later/required browser UX scenarios
├── installer-smoke.mjs       # existing Windows cross-version preservation evidence
└── standalone-smoke.mjs      # existing Linux standalone ownership evidence

package.json
package-lock.json
docs/updates.md
```

**Structure Decision**: Keep the feature entirely inside the existing client/update/control surfaces and existing test/acceptance harnesses. The only new runtime module is the narrowly scoped process-lock wrapper; no new package, service, database schema or frontend project is introduced.

## Compatibility, Rollout and Recovery

- **Installed-state compatibility**: existing `state.json`, update settings, check cache, `attempt.json`, result files and installer request files retain their schema. Only ephemeral lock filenames/ownership change.
- **Legacy lock compatibility**: old proper-lockfile artifacts are ignored as authority by the new mechanism; no destructive migration is required. Tests cover a retained legacy `.apply.lock` artifact.
- **Installer recovery**: unresolved durable attempts continue to yield `installer_pending` even after process ownership is gone. This is the guard against duplicate OS installers after crash/restart.
- **Automatic rollout**: no change to stable/auto/minimumSupported semantics. The feature may ship in a new immutable version only after the usual candidate/native acceptance; publication and policy promotion are separate operations.
- **Rollback**: a rollback target must still understand the persisted update files it already understands today. New ephemeral SQLite lock files are not required to interpret application state and must not become a downgrade blocker.
- **Native platforms**: Windows cross-version acceptance specifically exercises old-updater recovery; Linux standalone tests cover keeper ownership; both macOS targets run the normal package/upgrade candidate gates even though their user authorization model is unchanged.

## Validation Strategy

1. Test the new process lock in isolation with separate processes, active contention and forced process termination.
2. Update lifecycle tests to prove `update_busy`/`lifecycle_busy`, automatic `local_operation_active`, legacy lock compatibility, cache GC exclusion and durable `installer_pending` precedence.
3. Run UI/browser smoke for optional Later/resume, release-notes fallback, grace-period copy and enforced-required copy while preserving local troubleshooting access.
4. Run `npm run check`, the complete `npm test`, distribution tests and relevant standalone/native smoke locally.
5. Before publishing a release containing the implementation, use the existing exact-commit four-platform native candidate workflow; require the Windows cross-version upgrade evidence and normal Linux/macOS native acceptance.

## Complexity Tracking

No constitution violations require exceptions. The new module replaces several uses of a heartbeat lock dependency with one smaller project-level adapter around an already-shipped mature native database lock; it reduces rather than adds lifecycle state.
