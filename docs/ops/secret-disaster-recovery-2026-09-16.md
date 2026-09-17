# Secret disaster recovery and 2026-09-16 update-key incident

This document is the durable operator record for production secrets whose loss can
affect update trust, encrypted enrollment state, platform identity, or deployment.
It intentionally records locations, roles and recovery procedures, never secret
values.

## Incident: update-signing key became unavailable

The Ed25519 private key corresponding to the client-embedded update public key was
successfully used to sign the 0.2.6 release metadata on the company Lecoo machine.
The genuine signed `0.2.6/update.json` still verifies with that public key. The
original implementation implicitly stored the private key under the administrator's
home directory and relied on a documentation requirement for an offline backup.

During the source-publication/private-state cleanup period the effective private-key
copy became unavailable. Searches of the expected user path, common local paths,
Git objects/stashes, WSL, Recycle Bin, NTFS metadata, page/hibernation files,
available shadow copy, Aliyun, GitHub assets/secrets inventories and release packages
did not recover the key. Available DevSpace/Codex and Windows audit records do not
retain enough command detail to attribute one deletion command with confidence.

The root cause we can prove is therefore architectural, not a guessed individual
command: a non-reconstructible production trust key was allowed to have one effective
local copy, while recovery was advisory instead of an enforced release prerequisite.

## Recovery classes

| Secret / identity | Normal primary store | Same identity reconstructible after total loss? | Safe recovery |
| --- | --- | --- | --- |
| Update Ed25519 release private key | GitHub `public-release` Environment | No | Use verified recovery copy, or execute an explicit client trust-root migration. Never replace it in place. |
| `MASTER_KEY_V2` | GitHub `production` Environment + Worker secret + protected recovery copy | No | Preserve exact value. Rotation requires compatibility with old ciphertext, full D1 re-encryption and verification before old key retirement. Without a usable key, reset/re-enroll affected devices. |
| Windows internal-signing PFX | Archived private recovery material only; identity retired from current public releases | No | Do not migrate it into the public repository merely for completeness. Restore it only if the historical internal Publisher identity is deliberately reintroduced; otherwise retire it with the private archive retention plan. |
| macOS signing/notary credentials | Protected CI Environment when enabled | Apple/provider replacement rules apply | Revoke/reissue through Apple and update CI. Current internal-free distribution is unsigned/unnotarized. |
| `ADMIN_TOKEN` | GitHub `production` Environment + Worker secret | No need to reconstruct | Generate a new token and deploy both administrator configuration and Worker consistently. |
| Cloudflare deploy/runtime API tokens | GitHub `production` Environment | No need to reconstruct | Revoke old token, issue a least-privilege replacement, update Environment, validate scopes. |
| Employee Access Key | Employee/admin protected storage; D1 stores hash only | No | Revoke/reset and issue a new Access Key. This one-way design is intentional. |
| Per-device `deviceSecret` | Device state; encrypted D1 recovery copy | Not from hash | Recover through `MASTER_KEY`-protected D1 copy or reset/re-enroll the device. |
| `tunnel.token` | Device state / Cloudflare-managed tunnel | No need to reconstruct | Existing repair/enrollment can retrieve/recreate the provider credential. |
| `ownerToken`, local OAuth, Control Center capability | Device-local protected state | No need to preserve globally | Recreate through trusted local setup/repair; these are not fleet trust roots. |
| Aliyun SSH credential | Operator SSH key/agent | No need to preserve exact key | Add a replacement key through server/provider access and revoke the old one. |

## Required storage boundaries

1. `public-release` owns update-signing material and only the final metadata-signing
   step receives it. Native build/acceptance jobs never receive the private key.
2. `production` owns Cloudflare deployment/runtime credentials, `ADMIN_TOKEN`, the
   active `MASTER_KEY_V2`, resource identity JSON and any platform-signing
   identity still intentionally used.
3. Release profiles contain only public client-visible endpoints/public keys.
4. Aliyun/Caddy holds immutable public release bytes and already-signed metadata;
   it never holds the update private key.
5. Developer `.runtime` and home directories may contain replaceable operator/device
   state, but must not be the only production copy of a non-reconstructible root.

The update-signing provisioning command is deliberately explicit and does not write
the generated private key to disk:

```sh
npm run update-key:provision -- --confirm CREATE-NEW-UPDATE-TRUST-ROOT
```

It writes the daily key to `business-devspace:public-release` and a recovery copy to
the archived private repository's `recovery` Environment, while printing only the
new public key. Creating this key is a trust-root change and must not be used for a
normal release or to overwrite an existing client trust root.

The D1 encryption-root recovery follows the same no-disk rule but is a data migration,
not an in-place replacement:

```sh
npm run master-key-v2:provision -- --confirm ROTATE-D1-MASTER-KEY
```

This creates `MASTER_KEY_V2` in the deployed Worker, `business-devspace:production`,
and the archived private repository's `recovery` Environment. Production code must
run in dual-key mode until every retained `device_secret_box` has been verified and
re-encrypted under V2. Only then may the legacy Worker `MASTER_KEY` be deleted.

For the 0.2.8 updater trust-root recovery, do not expose new-key root update metadata
to old-key clients before their one-time manual install. The final immutable GitHub
Release is re-imported to Aliyun under `/releases/0.2.8/` using its public release
evidence and signed catalog while the `stable` symlink remains on 0.2.6. This gives
employees a fixed trusted manual-install URL without silently changing what existing
0.2.6 clients see at `/catalog.json` and `/update.json`.

During the 2026-09-17 migration, the public-source Worker briefly lost the runtime
`DOWNLOAD_ORIGIN` / `UPDATE_PUBLIC_KEY` bindings because the old private bundle had
embedded production distribution values while the public repository deliberately
contains placeholder release defaults. The administrator update-policy endpoint then
failed closed with `service_unavailable`. Recovery restored explicit runtime bindings
for the still-active 0.2.6 feed and old update public key. Production health now also
requires these bindings so a future public-source/secret-only deployment cannot look
healthy while its update control plane silently falls back to source placeholders.

## Change checklist

Before changing or deleting any production secret:

- classify it as replaceable bearer credential, encryption root, or signing identity;
- identify the current primary store and an independent tested recovery path;
- prove whether historical ciphertext/signatures/installed clients depend on the
  exact identity;
- for key rotation, keep old and new trust/decryption paths available until migration
  evidence covers all retained state;
- verify the new secret in the actual protected workflow/provider before deleting
  the old copy;
- never use source cleanup, repository visibility changes, workstation cleanup or
  release publishing as implicit authorization to rotate a root key.

The archived private repository remains a recovery source until every production
secret required by the public repository has been migrated and verified. Removing
that archive or its protected Environment is a separate operator action.
