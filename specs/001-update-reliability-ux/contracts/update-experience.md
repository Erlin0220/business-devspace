# Contract: Local Update Ownership and User Experience

This feature changes no public Gateway API. The contract below defines observable local behavior shared by CLI/controller/Control Center and automatic update scheduling.

## 1. Local ownership contract

### Acquisition

- Each mutation domain has at most one live process owner.
- A live owner causes a deterministic busy result.
- Owner process exit/crash releases ownership without waiting for a heartbeat/stale interval.
- Existence of a lock database file is not proof that an owner exists.

### Product error mapping

- Lifecycle contention: `code = lifecycle_busy` with a bounded user-facing message that another install/repair/connection operation is active.
- Manual/update-apply contention: `code = update_busy` with a bounded user-facing message that another update is active.
- Automatic update receiving either local busy condition: persist/project `code = local_operation_active` and retry on the existing short busy cadence.
- Raw SQLite/native-lock messages MUST NOT be used as normal end-user feedback.

### Durable handoff precedence

An unresolved recent installer attempt remains `installer_pending` even if no local process owner remains. This check happens before network/download/hash work for a duplicate apply request.

## 2. Optional update confirmation contract

### Explicit discovery

When an explicit manual check finds a newer stable version:

1. Show the existing version-bound confirmation dialog.
2. Load a bounded release-note summary when available.
3. Keep installation possible when notes fail, provided signed update verification succeeds later.

### Later

When the user selects `稍后`:

- close the dialog;
- do not start/update an installer attempt;
- do not change automatic-update preference or administrator policy;
- restore focus to the invoking control;
- show a short local notice such as `已稍后处理，可在“软件更新”中随时继续。`;
- keep the update card/action visibly available.

Background discovery of the same optional version MUST NOT auto-open the dialog. A user can resume through `更新并重新连接` or an explicit manual check. A newly published higher target is shown as the current target and is not suppressed by the previous dismissal.

## 3. Minimum-supported UX contract

### Before enforcement

If the client is below `minimumSupported` but `enforceAfter` is still in the future:

- display the minimum supported version;
- display the enforcement time in the user's local timezone;
- make clear that this is a future requirement, not a claim that current remote work is already blocked;
- continue showing the normal update action.

### After enforcement

If `updates.required` is true:

- keep a persistent visible required-upgrade indicator/callout independent of the modal;
- use direct explanatory copy equivalent to `当前客户端版本已停止支持，请升级后恢复新的远程工作。`;
- provide the existing update action directly;
- do not let `稍后` clear the persistent required state;
- keep local settings, logs, diagnostics and update recovery accessible.

The Gateway remains the only authority that rejects new remote MCP work. The local UI is a projection of policy, not an additional authorization mechanism.

## 4. Automatic update deferral contract

- Remote work busy -> `remote_work_active`, existing short busy retry cadence.
- Local operation/update owner busy -> `local_operation_active`, same short retry class.
- Unresolved installer handoff -> `installer_pending`, no duplicate installer.
- Restart keeps the persisted target/retry deadline when still applicable.
- Deferred is never rendered as installed.

## 5. Non-regression contract

The feature MUST NOT change:

- Ed25519 update metadata verification;
- immutable version binding;
- package size/SHA-256 verification;
- Device identity/Access Key/binding preservation;
- Current Project Root preservation;
- desired remote-access pause preservation;
- macOS native authorization requirement;
- existing Windows self-expiring update Task Scheduler handoff;
- stable/auto/minimumSupported governance semantics.
