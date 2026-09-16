# Team DevSpace 0.2.8

- Restores the updater trust root after the previous Ed25519 update-signing private key became unavailable. This release embeds the new update public key and is the one-time manual trust-root migration baseline for existing 0.2.6/0.2.7 installations.
- Production update signing no longer has a workstation-only key fallback. Exact accepted release bytes are signed only in the protected GitHub `public-release` Environment, and the Aliyun publisher consumes already-signed metadata instead of owning the signing private key.
- The D1 device-credential encryption root has been migrated through an explicit dual-key procedure to `MASTER_KEY_V2`; retained ciphertext was verified against the stored device-secret hash before re-encryption, and the legacy Worker `MASTER_KEY` has been retired.
- Windows one-shot updater tasks now use Task Scheduler expiration for registration cleanup instead of relying on a limited task to unregister itself, which Windows can reject with Access Denied.

Existing Team DevSpace installations that still trust the previous update key must install 0.2.8 once from the official employee download site. The installer is an in-place upgrade: Access Key, Device Binding, Current Project Root and explicit pause intent remain outside the immutable application slot and are preserved by the existing upgrade/rollback contract. After 0.2.8 is installed, normal signed automatic updates can resume using the new trust root.
