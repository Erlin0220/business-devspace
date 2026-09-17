# Operator deployment

The tracked release declaration contains versions and a non-production sample
edition. Production configuration is separate from source. Endpoints and the
update public key are not secrets, but choosing the correct operator profile
is necessary to preserve employee connectivity and update trust.

## Configuration

| Setting | Local file / environment | Contents |
| --- | --- | --- |
| Employee release profile | `.runtime/release-profile.json` selected with `TEAM_DEVSPACE_RELEASE_PROFILE`, or `TEAM_DEVSPACE_RELEASE_PROFILE_JSON` | `gateway`, `downloadOrigin`, existing `updatePublicKey` only |
| Provisioned resource identities | `.runtime/deployment.json` or `TEAM_DEVSPACE_DEPLOYMENT_JSON` | `zoneId`, `databaseId`, `accessApplicationId` |
| Deployment credentials | `.runtime/cloudflare.json` / scoped CI Secrets | deployment token, runtime token, Access administrator emails |
| Runtime administration | `.runtime/admin.json` / scoped CI Secrets | local `gateway`, `adminToken`, `masterKeyV2`; CI `ADMIN_TOKEN`, canonical `MASTER_KEY_V2` |
| Legacy static publication | `.runtime/downloads.json` | SSH host alias and owned remote root |

Copy templates from `config/` into the ignored private directory and fill them
locally. Do not commit the filled files. Select exactly one release-profile
input. Builds without a profile are sample builds, not employee builds.
Sample origins, a placeholder public key and unprovisioned CI identities cause
production operations to fail closed.

```powershell
$env:TEAM_DEVSPACE_RELEASE_PROFILE = '.runtime/release-profile.json'
# Populate private deployment.json from its template before configuring tokens.
npm run configure
# Explicit operator action only; this is not part of review or source cleanup.
npm run deploy
```

`configure` requires an interactive local terminal and masked token entry.
For an existing installation, reuse the backed-up profile and identities; do
not generate replacement trust or encryption keys. Provisioning a new D1 or
Access application is an explicit local operation, not part of CI deploy.
Deployment rejects missing or legacy-only administrator credentials before remote
changes; it never creates an encryption root or promotes `masterKey` to
`masterKeyV2`. Restore the canonical V2 credential from the protected primary or
recovery store. A new installation must also explicitly provision and independently
back up its root before the first Worker deployment; `configure` only collects
Cloudflare API credentials and does not create that root.

## GitHub production Environment

Configure Variable `TEAM_DEVSPACE_RELEASE_PROFILE` (the public client profile
JSON above). Configure Secrets `TEAM_DEVSPACE_DEPLOYMENT` (resource identity
JSON), `ADMIN_ACCESS_EMAILS`, `CLOUDFLARE_DEPLOY_API_TOKEN`, `CF_RUNTIME_API_TOKEN`, `ADMIN_TOKEN`, `MASTER_KEY_V2`
and any existing platform-signing credentials in the `production` Environment.
The update metadata private key belongs only to the separate `public-release`
Environment as `TEAM_DEVSPACE_UPDATE_SIGNING_KEY_PEM`; never put it in a profile,
deployment Environment, download server or workstation-only default path.

The original `MASTER_KEY` was not replaceable configuration because existing D1
enrollment ciphertexts depended on its exact value. The 2026-09 recovery therefore
uses an explicit dual-key migration to `MASTER_KEY_V2`: the Worker accepts old
ciphertext long enough to re-encrypt it under V2, verifies every plaintext against
the retained device-secret hash, then retires the legacy key. `MASTER_KEY_V2` is the
canonical production data-encryption root after that migration. Future rotation must
repeat the same explicit compatibility procedure rather than overwrite it in place.
Update-signing and platform-signing private keys
also cannot be reconstructed from their public identity. Before deleting an old
secret store or repository Environment, verify the primary copy and the independent
recovery path described in `docs/ops/secret-disaster-recovery-2026-09-16.md`.

The historical `WINDOWS_INTERNAL_SIGNING_PFX_*` secrets are not part of the
current public release contract and are intentionally not migrated into the public
repository's `production` Environment. Current Windows public releases are accepted
and published without that internal Publisher identity. Keep the old PFX only with
the archived private recovery material until its retention period ends;
reintroducing Windows code signing is a separate trust decision with a separately
managed identity.

During an updater trust-root migration, immutable accepted bytes can be copied to
the versioned Aliyun namespace without changing `/stable`, `/catalog.json`,
`/update.json` or the public homepage. Download the final GitHub Release assets and
use:

```sh
npm run downloads:publish -- --publish --versioned-only --public-release-directory <release-directory>
```

The importer revalidates `PUBLIC-RELEASE-EVIDENCE.json`, package sizes/hashes,
`SHA256SUMS`, the exact catalog commit/profile and signed `update.json`, then verifies
the server and HTTPS delivery paths. Existing clients continue to see the old stable
feed until the operator explicitly performs the later activation.

After the versioned release exists, publish the temporary employee-facing migration
homepage separately:

```sh
npm run downloads:publish -- --site-only --migration-homepage 0.2.8
```

That homepage links directly to `/releases/0.2.8/` and explains the one-time
in-place overwrite install. The publisher snapshots the existing root `catalog.json`
and `update.json` before changing the homepage and refuses success if either stable
feed changes during the operation.

Restrict the Environment to the reviewed `main` branch. Use an available
reviewer policy only when it can actually be satisfied; a solo maintainer must
not be required to approve their own deployment as a separate reviewer. Check
GitHub's actual enforcement response and account availability, not just YAML.
Variables are not a secret store. Resource identities are not authentication
secrets, but this project keeps them and personal email lists in Environment
Secrets to avoid unnecessary disclosure. Remove the legacy email Variable only
after the workflow migration; do not break a still-active old deployment path.

The workflow installs dependencies and runs tests without deployment secrets;
only its final deployment step receives them. It has `contents: read` and
never writes infrastructure identifiers back to Git. Source cleanup does not
automatically run it. Existing production has not been migrated merely because
these files were changed.

## Cloudflare permissions and order

The deployment token needs scoped Workers Scripts/D1/Access Apps and Policies
write, Access organization read, and scoped Zone Workers Routes/DNS/Zone read
plus WAF write. The separate Worker runtime token needs only the selected
account's Tunnel and Zone DNS operations. Neither token belongs in an installer.

Deployment verifies owned resources and administrator Access policy, records
rollback/Time Travel evidence, applies backward-compatible migrations, uploads
the Worker, and proves release/Admin/D1/assets readiness before synchronizing
the one project-owned `http_request_firewall_custom` rule
`team-devspace-gateway-surface`. Edge changes are intentionally last so a
stricter rule cannot cut off running old clients before the replacement Worker
is accepted. WAF is scoped to the exact Gateway hostname, retires
`/v1/device/status` and denies unknown namespaces; it never takes over unrelated
zone rules or device Tunnel hosts. After synchronization, deployment proves
blocked paths terminate at the Edge while `/health`, `/mcp`, and `/admin` keep
their expected Worker/Access behavior. Access JWT issuer/audience/signature are
also checked in Worker.

Migrations precede Worker rollout. A failed rollout may restore the prior
Worker, but must not automatically reverse a D1 migration or overwrite device
identity. CI refuses automatic infrastructure provisioning.

```sh
# Local validation only: no provider calls or production migrations.
npm run deploy -- --dry-run
```

Monitor unauthenticated traffic, D1 rows, provider mutations and actual edge
block events separately. Worker-side limits are defense in depth, not a hard
spend cap. See SECURITY.md and the release readiness checklist.
