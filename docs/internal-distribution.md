# Internal-free software trust

The source repository is Public; operator configuration and employee state remain private, and device access remains authenticated. Existing employee installer files are intentionally available without download authentication. `internal-free` describes code-signing limitations, not an access-control promise. The original public-binary compliance gate is closed; GitHub installer publication is allowed only through the accepted-byte release workflow described in [public-readiness.md](public-readiness.md). Existing employee delivery is documented in [one-command-distribution.md](one-command-distribution.md).

## Windows

The normal handoff is the Team DevSpace EXE, not a credential-bearing ZIP. Its application runtime is embedded, but Windows Git Bash is an external prerequisite: an existing installation is reused, otherwise the bootstrap obtains the pinned official Git for Windows asset and verifies its SHA-256. Local builds do not promise public Authenticode trust or SmartScreen reputation. Existing administrator tooling may apply the fixed `CN=Team DevSpace Internal Publisher` signature before final acceptance, but an internal self-signed identity is not a publicly trusted publisher.

The stable installation script validates the complete EXE hash and size before execution. It never imports a certificate, changes the global PowerShell policy, supplies an Access Key, or bypasses a system warning. Administrators who deliberately manage an internal publisher certificate can retain their separate current-user trust procedure; it is not required or silently invoked by the public download flow. A PFX, password or private key must never enter the download directory or release asset.

## macOS

The two PKGs remain unsigned/unnotarized unless an independently authorized Developer ID signing/notarization path is configured. The GitHub native matrix builds each sample target and runs actual system PKG installation, installed-payload and LaunchAgent checks on matching ARM64 or Intel runners. Rosetta is not accepted as Intel publication evidence.

Normal Gatekeeper and administrator confirmations remain. Where macOS permits it, a user who has verified the source may approve that specific downloaded package in System Settings → Privacy & Security. Never disable Gatekeeper globally or advertise zero-confirmation installation. CI installation does not prove employee-machine Gatekeeper approval or real employee Enrollment.

## Linux

The x64 offline archive requires glibc 2.34+ and runs as the employee's ordinary user, never through sudo. It reuses existing systemd user or no-systemd lifecycle support. Software installation does not bind a device. Run `~/.local/bin/team-devspace setup` afterward to enter the Access Key privately and select a project; `access-key change` replaces it without reinstalling.

The stable CLI resolves `active-path`. Upgrades retain identity and pause intent; uninstall removes owned application/startup files but retains employee state and projects. A user-service linger setting remains an explicit administrator decision, never an automatic installer action.

## Release policy

One clean source commit and exact final-byte acceptance are required for every platform. Signing, where used, must precede that acceptance. The manual GitHub matrix validates all four native sample targets; local tools remain available for debugging and separately authorized operator builds. Authorized employee publication still uses the existing delivery tool, verifies exact bytes and HTTPS reads, then switches a stable pointer deliberately. Historical versions cannot be overwritten, and sample CI does not authorize such publication.

Old private GitHub Releases remain historical archive storage and are not imported into the Public repository; employees never need a GitHub token. New public installers require fresh exact-byte acceptance and the protected publication workflow even though the original redistribution gate is closed. Public Windows signing and Apple Developer ID/notarization remain future trust improvements, not reasons to add R2 authentication or administrator-generated download tickets.
