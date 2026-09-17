---

description: "Implementation tasks for crash-safe updater ownership and upgrade UX"
---

# Tasks: Update Reliability and Upgrade UX

**Input**: Design documents from `/specs/001-update-reliability-ux/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/update-experience.md`, `quickstart.md`

**Tests**: Required. The feature comes from a real updater reliability incident and explicitly requires deterministic crash/concurrency/UI regressions before implementation is considered complete.

**Organization**: Tasks are grouped by user story so the reliability MVP can land independently from the UX refinements.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches a different file/surface and does not depend on an incomplete task in the same phase.
- **[Story]**: Maps directly to the user stories in `spec.md`.
- Every task names the concrete repository file or validation artifact it owns.

## Phase 1: Setup (Dependency Ownership)

**Purpose**: Make the native lock dependency explicit before project code imports it directly.

- [ ] T001 Add direct `better-sqlite3@12.11.1` dependency ownership in `package.json` and `package-lock.json` while temporarily retaining direct `proper-lockfile@4.1.2` until all Team DevSpace consumers migrate.

---

## Phase 2: Foundational (Crash-Safe Process Lock Primitive)

**Purpose**: Introduce and prove the one shared ownership primitive before migrating any lifecycle/update consumer.

**CRITICAL**: Do not change existing lock consumers until the new primitive has deterministic tests for live contention and process-death release.

- [ ] T002 [P] Add failing cross-process ownership tests in `test/process-lock.test.mjs` covering one live owner, deterministic busy error, idempotent release, forced child-process death, and reacquisition within the SC-001 five-second bound.
- [ ] T003 Implement `acquireProcessLock()` and `processLockHeld()` in `client/process-lock.mjs` using a held SQLite immediate transaction, zero busy timeout, bounded retry/backoff/abort support, idempotent release, and stable `process_lock_busy` error mapping required by `contracts/update-experience.md`.

**Checkpoint**: `test/process-lock.test.mjs` passes and the primitive contains no heartbeat/stale-lease logic.

---

## Phase 3: User Story 1 - 更新崩溃后可立即恢复 (Priority: P1) MVP

**Goal**: Replace Team DevSpace-owned heartbeat/stale locks with crash-safe process ownership while preserving durable installer-attempt protection and core fault isolation.

**Independent Test**: Kill a process holding lifecycle/update ownership and immediately reacquire it; keep a second live process contending and verify it fails closed with product-level busy state; confirm at most one installer handoff occurs and an unresolved `attempt.json` still wins over free process ownership.

### Tests for User Story 1

- [ ] T004 [P] [US1] Update `test/operation.test.mjs` so a killed lifecycle owner is immediately recoverable without editing lock timestamps, while a second live owner still receives `lifecycle_busy` and re-entrant same-operation execution remains supported.
- [ ] T005 [P] [US1] Extend `test/update-lifecycle.test.mjs` with `update_busy`, automatic `local_operation_active` short retry, legacy `.apply.lock` coexistence, unresolved `installer_pending` precedence, check-lock contention, and update-cache exclusion scenarios; ensure raw lock-library text is never asserted as product behavior.
- [ ] T006 [P] [US1] Extend `scripts/standalone-smoke.mjs` with a standalone keeper ownership/restart scenario proving a dead keeper no longer needs stale-lock aging while a live keeper remains protected from duplicate ownership.

### Implementation for User Story 1

- [ ] T007 [US1] Migrate lifecycle serialization in `client/operation.mjs` from `proper-lockfile` to `client/process-lock.mjs`, use a dedicated `.lifecycle-lock.sqlite` ownership path, preserve AsyncLocalStorage re-entrancy, and map live contention to the existing `lifecycle_busy` product contract.
- [ ] T008 [US1] Migrate update check/apply ownership in `client/updates.mjs` to `.check-lock.sqlite` / `.apply-lock.sqlite`, map manual apply contention to `update_busy`, map automatic local contention to persisted `local_operation_active` with the existing busy retry cadence, and keep unresolved `attempt.json` rejection before network/download/hash work.
- [ ] T009 [US1] Migrate apply-aware cache cleanup in `client/update-cache.mjs` to the shared `.apply-lock.sqlite` process ownership so GC skips a live apply without relying on stale lock directories and never recursively removes unknown legacy artifacts.
- [ ] T010 [US1] Migrate Linux standalone keeper ownership/probing in `client/standalone.mjs` to per-component `.lock.sqlite` process ownership, preserve process-identity/signal safety, and remove only the known SQLite sidecar files during explicit component removal.
- [ ] T011 [US1] Remove Team DevSpace's direct `proper-lockfile` dependency from `package.json` and `package-lock.json` only after `client/operation.mjs`, `client/updates.mjs`, `client/update-cache.mjs`, and `client/standalone.mjs` contain no project imports; retain any upstream transitive copy required internally by `@waishnav/devspace`.
- [ ] T012 [US1] Update reliability documentation in `docs/updates.md` to describe crash-safe ephemeral ownership versus durable installer attempts, product-level busy/deferred behavior, and the compatibility rule that legacy lock artifacts are no longer authoritative.

**Checkpoint**: US1 is independently shippable: process crash no longer strands local ownership, concurrent apply remains fail-closed, and signed update/identity/root/pause boundaries are unchanged.

---

## Phase 4: User Story 2 - “稍后”之后仍能自然继续更新 (Priority: P2)

**Goal**: Make the already-existing Later action self-explanatory without adding a snooze scheduler or hidden version-ignore state.

**Independent Test**: Manually discover an optional update, click Later, verify no install/handoff and no background re-popup, then reopen the same target from the existing update action or explicit manual check in no more than two actions.

### Tests for User Story 2

- [ ] T013 [P] [US2] Extend `scripts/control-browser-smoke.js` to assert that `稍后` closes without an update action, restores focus, shows a bounded “可在软件更新中继续” notice, leaves the update CTA visible, does not auto-reopen for the same background-discovered optional version, and can reopen the current target explicitly.

### Implementation for User Story 2

- [ ] T014 [US2] Refine `client/control.js` Later handling so it remains an ephemeral modal dismissal, emits the resume-path notice from `contracts/update-experience.md`, preserves existing version-bound release-note confirmation, and introduces no persisted ignored-version/snooze state.
- [ ] T015 [US2] Update the employee-experience section in `docs/updates.md` to state that Later defers only the current prompt, background checks do not nag, and the persistent Software Update action/manual check are the supported resume paths.

**Checkpoint**: US2 works independently of the process-lock migration and does not change automatic-update policy or server state.

---

## Phase 5: User Story 3 - 最低支持版本到期时明确引导升级 (Priority: P2)

**Goal**: Distinguish future minimum-version enforcement from an already-enforced unsupported client, keep the required state persistent, and preserve local recovery access.

**Independent Test**: Render the same client first with a future enforcement time and then with an already-effective minimum above the current version; verify distinct copy, direct update action and continued access to local settings/logs/diagnostics even after dismissing the update modal.

### Tests for User Story 3

- [ ] T016 [P] [US3] Extend `scripts/control-browser-smoke.js` with grace-period and enforced-required scenarios asserting minimum version, localized enforcement time, persistent unsupported-version copy, direct update CTA, and required-state persistence after closing the confirmation modal.
- [ ] T017 [P] [US3] Extend `test/desktop-ux.test.mjs` or the closest existing shared desktop-state test to prove an `updates.required` projection does not disable local settings/logs/diagnostics/update recovery and does not masquerade as an installed/healthy update result.

### Implementation for User Story 3

- [ ] T018 [US3] Add/reuse the minimal persistent required-upgrade callout structure and styling in `client/control.html` and `client/control.css`, keeping it visually distinct from optional availability without blocking navigation or diagnostics.
- [ ] T019 [US3] Update `client/control.js` rendering to distinguish future minimum enforcement from `updates.required`, show the policy deadline in local time before enforcement, show the enforced message equivalent to “当前客户端版本已停止支持，请升级后恢复新的远程工作。”, keep the update action available, and ensure closing the modal never clears the required projection.
- [ ] T020 [US3] Update `docs/updates.md` so the documented employee UX exactly matches the existing Gateway `426 client_upgrade_required` boundary: new remote work can be denied after enforcement, while local update/settings/diagnostics/recovery remain available.

**Checkpoint**: US3 clearly explains policy state without introducing a second enforcement mechanism or extra Gateway/D1 traffic.

---

## Phase 6: Polish & Cross-Cutting Validation

**Purpose**: Prove the three stories preserve release-critical update and installation boundaries before merge/release handoff.

- [ ] T021 [P] Run/update targeted updater regression coverage in `test/updates.test.mjs`, `test/update-review.test.mjs`, `test/update-report.test.mjs`, and `test/update-handoff.test.mjs` to confirm signed catalog/version binding, package verification, macOS authorization, persisted retry deadlines and handoff semantics remain unchanged.
- [ ] T022 [P] Audit dependency/license effects in `package.json`, `package-lock.json`, and `LICENSES/README.md`; confirm direct `better-sqlite3` ownership is correctly represented by existing generated notices/SBOM tooling and update tracked license inventory only if the current distribution audit requires it.
- [ ] T023 Execute the complete repository checks from `specs/001-update-reliability-ux/quickstart.md`: `npm run check`, full `npm test`, `npm run test:distribution`, package with reused dependencies, and the applicable local platform acceptance; fix only regressions attributable to this feature.
- [ ] T024 Validate Windows cross-version updater recovery with the existing baseline flow in `scripts/installer-smoke.mjs`, including preservation of Device identity, Access Key/binding, Current Project Root, automatic-update preference and pause intent after upgrade/crash recovery.
- [ ] T025 Validate Linux standalone ownership with `scripts/standalone-smoke.mjs` and ensure the new process-lock files do not create uninstall residue or signal an unrelated/reused process.
- [ ] T026 Run the exact-commit four-platform native candidate workflow defined in `.github/workflows/build-installers.yml` before any release promotion and require successful Windows x64, Linux x64, macOS arm64 and macOS x64 evidence; do not publish candidate bytes from this task.
- [ ] T027 Re-run the feature validation guide and record any necessary final design corrections in `specs/001-update-reliability-ux/quickstart.md` / `specs/001-update-reliability-ux/plan.md`, then verify `git diff --check` and that the implementation diff contains no unrelated release/deployment/policy changes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (T001)**: No dependency; makes the selected native dependency explicit.
- **Phase 2 (T002-T003)**: Depends on T001; blocks US1 lock migration. UI stories could technically be edited earlier, but the feature should keep the tested foundation first.
- **US1 (T004-T012)**: Depends on T003. Tests T004-T006 should be written/updated before their corresponding implementation tasks.
- **US2 (T013-T015)**: Depends only on the existing Control Center baseline and can run after Phase 2 independently of US1 implementation.
- **US3 (T016-T020)**: Depends only on the existing update-policy projection and can run after Phase 2 independently of US1/US2 implementation.
- **Phase 6 (T021-T027)**: Depends on every user story selected for the PR.

### User Story Dependencies

- **US1 (P1)**: Independent MVP. Delivers the original 0.2.7 P0/P1 reliability fix by itself.
- **US2 (P2)**: Independent UI refinement. Does not require the new process-lock module.
- **US3 (P2)**: Independent policy-presentation refinement. Does not require US1 or US2, and does not change Gateway enforcement.

### Within User Story 1

1. T004-T006 define failing/updated regressions.
2. T007-T010 migrate each ownership consumer after T003.
3. T011 removes the obsolete direct dependency only after all migrations are complete.
4. T012 documents the final ownership/recovery contract.

### Parallel Opportunities

- T004, T005 and T006 touch different test/smoke files and can be prepared in parallel after T003.
- T013 (US2 browser test) and T016/T017 (US3 tests) can proceed in parallel with US1 implementation because they touch separate UX/test surfaces.
- T021 and T022 are parallel review streams after implementation is stable.
- Native platform jobs inside T026 are intentionally the repository's existing parallel matrix rather than custom per-feature build logic.

## Parallel Example: User Story 1

```text
Task T004: update lifecycle-owner crash tests in test/operation.test.mjs
Task T005: update apply/check/cache regressions in test/update-lifecycle.test.mjs
Task T006: standalone keeper crash/restart scenario in scripts/standalone-smoke.mjs
```

## Implementation Strategy

### MVP First

1. Complete T001-T003.
2. Complete US1 T004-T012.
3. Run the US1 targeted tests and Windows/Linux ownership smoke.
4. At this point the high-priority former 0.2.7 reliability defect is independently fixed and reviewable.

### Incremental Delivery

1. Foundation + US1 -> crash-safe updater/lifecycle ownership.
2. Add US2 -> clear optional Later/resume UX with no new scheduler.
3. Add US3 -> clear grace/enforced minimum-version UX with no new enforcement path.
4. Complete Phase 6 -> full regression/native candidate evidence.

### Scope Guard

- Do not reimplement release-notes fetching/modal basics, automatic-update scheduler, PortableGit removal, source-available repository migration, update signing, installer architecture or Windows scheduled-task self-expiry; current public code already owns those capabilities.
- Do not bump a release version, publish binaries, deploy Cloudflare, alter production rollout policy or replace download aliases as part of these implementation tasks. Those are separate authorized release/deployment actions after merge and acceptance.

## Task Summary

- **Total tasks**: 27
- **Setup/Foundation**: 3
- **US1**: 9 tasks (T004-T012)
- **US2**: 3 tasks (T013-T015)
- **US3**: 5 tasks (T016-T020)
- **Cross-cutting validation**: 7 tasks (T021-T027)
- **Suggested MVP**: T001-T012 (foundation + US1)
