# Team DevSpace 0.2.9

- Replaces Team DevSpace-owned heartbeat/stale-file update and lifecycle locks with crash-safe native SQLite process ownership. If an updater, tray or local lifecycle process exits unexpectedly, a later operation can recover immediately instead of remaining blocked behind an abandoned lock; durable installer-attempt records still prevent duplicate OS installer launches.
- Improves software-update feedback. Choosing “Later” now explicitly keeps the update available from Software Update, automatic retries distinguish local-operation contention from installation failure, and minimum-supported-version UX clearly separates a future grace deadline from an already-enforced upgrade requirement while keeping local settings, logs, diagnostics and update recovery available.
- Improves Windows project-folder selection by allowing a new project directory to be created directly from the native folder picker.
- Hardens release and repository operations, including resumable pinned build-tool downloads, stricter release/secret-provisioning failure handling, complete master-key rotation pagination, and static `/robots.txt` delivery so routine crawler traffic does not consume Worker execution.

Clients already on 0.2.8 keep the same update trust root and can use the normal signed update path. Older clients that never completed the trust-root migration still require a manual covering installation from the official employee download site. Upgrades continue to preserve Device identity, Access Key/binding, Current Project Root and explicit pause intent.
