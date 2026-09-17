# Data Model: Update Reliability and Upgrade UX

This feature does not add a central database schema. It clarifies ownership of existing local update facts and adds one ephemeral local lock artifact type.

## 1. Process Lock Ownership

**Purpose**: Cross-process exclusion for one local mutation domain.

**Persistence**: A small SQLite file may remain on disk, but ownership exists only while one process holds the native write transaction. The file's existence, modification time or contents are not an ownership lease.

**Attributes**:

- `path`: canonical lock database path scoped to one installation/ownership domain.
- `held`: derived at runtime by whether another process owns the immediate transaction.
- `owner lifetime`: implicit OS process/file-handle lifetime; not persisted as application identity.

**Validation / invariants**:

- At most one process holds a given ownership domain.
- Process exit/crash releases ownership without application cleanup or stale timeout.
- Busy acquisition becomes a bounded product error, not a raw SQLite error.
- Lock files contain no credentials, project paths beyond the already-private home path, or user data.

**Planned domains**:

- lifecycle: one per Team DevSpace home.
- update check: one per Team DevSpace update directory.
- update apply/cache GC: one shared apply ownership domain.
- Linux standalone keeper: one per component owner in its existing private `/tmp` namespace.

## 2. Installer Attempt *(existing)*

**Purpose**: Durable cross-process and cross-restart guard that records that a concrete installer handoff has started.

**Existing attributes used by this feature**:

- `version`: target immutable Team DevSpace version.
- `sourceVersion`: version running when the attempt started.
- `repair`: whether the explicit action is same-version software repair.
- `startedAt`: attempt start timestamp.
- `attemptId`: unique identity that binds attempt/result/handoff facts.
- `phase`: `starting`, `awaiting-authorization`, or `installing` in the current flow.

**Relationships**:

- A Process Lock Ownership may protect creation/update of an Installer Attempt, but it does not replace it.
- A matching installer result can complete/fail the attempt projection.
- A recent unresolved attempt blocks duplicate preparation even when no process lock remains held.

**State transitions**:

```text
none
  -> starting                 (durable guard written before OS handoff)
  -> awaiting-authorization  (macOS handoff returned and needs user authorization)
  -> installing              (OS handoff accepted)
  -> installed/failed/waiting-restart projection via matching result/current version

starting/awaiting/installing
  -> installer_pending       (new apply request sees an unresolved recent attempt)
```

## 3. Automatic Update Outcome *(existing)*

**Purpose**: Persist the last meaningful automatic-update result so a restart does not erase retry intent or misreport success.

**Attributes used by this feature**:

- `version`: actual auto target.
- `checkedAt`: observation time.
- `deferred`: whether activation is postponed.
- `code`: bounded reason such as `remote_work_active`, `local_operation_active`, `installer_pending`, or `update_failed`.
- `nextAttemptAt`: persisted retry deadline where applicable.
- `message`: bounded user-facing explanation.
- `ready` / `requiresAuthorization`: prepared macOS state where applicable.

**Invariants**:

- A local ownership conflict projects to `local_operation_active`, not a raw lock error.
- Restart reuses `nextAttemptAt`; it does not add a fresh full background-check interval.
- Outcome target must match the policy target before it is treated as current.

## 4. Update Policy Projection *(existing)*

**Purpose**: Client-visible policy facts used to render optional and required update UX.

**Attributes used by this feature**:

- `stable`: newest accepted manual target.
- `auto`: administrator-approved automatic target or null.
- `minimumSupported`: oldest version allowed for new remote work after enforcement or null.
- `enforceAfter`: explicit UTC enforcement time paired with a minimum version.
- `available`: current client is below stable.
- `required`: current client is below `minimumSupported` and the enforcement deadline has passed.

**UI states**:

```text
current
  current >= stable and not required

available-optional
  current < stable and not required

grace-warning
  minimumSupported exists, deadline is future, current < minimumSupported

required
  deadline passed and current < minimumSupported
```

The existing implementation may project `available` and policy fields rather than materializing `grace-warning`; the UI derives it without new persisted state.

## 5. Optional Update Prompt State *(ephemeral presentation)*

**Purpose**: Version-bound confirmation dialog for a user-explicit update action.

**Attributes**:

- target version currently being confirmed.
- return-focus element.
- release-notes load generation/cache.

**Invariants**:

- “Later” discards this presentation state only.
- No persisted `ignoredVersion` or snooze deadline is introduced.
- The target must still equal current stable at confirmation time.
- Required policy presentation is independent of whether this modal is open.
