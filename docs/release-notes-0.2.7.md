# Team DevSpace 0.2.7

- Windows no longer redistributes PortableGit inside Team DevSpace. Existing Git Bash is reused when available; otherwise the installer acquires the exact pinned Git for Windows prerequisite from the official GitHub Release over HTTPS and verifies SHA-256 before placing it outside the immutable application slot.
- macOS keeps cloudflared on the same pinned current source version as Windows/Linux while preserving the macOS 12 baseline. Both native architectures are built from the pinned source commit and Go toolchain; release verification checks the actual Mach-O minimum system version instead of trusting the build environment alone.
- Release compliance evidence now inventories the actual final bundle bytes with pinned Syft, verifies the packaged npm/Rust SBOM, and retains the exact cloudflared root/vendored license and notice files from the pinned source commit. Review evidence contains metadata and license text only until public installer distribution is separately authorized.
- Windows test execution now selects Git for Windows Bash explicitly instead of depending on PATH order that can accidentally invoke the WSL launcher.
- Native release acceptance includes the exact immutable four-platform 0.2.6 employee packages as upgrade baselines, in addition to older retained recovery fixtures, so the 0.2.7 gate exercises the real current-version upgrade path rather than a rebuilt approximation.

The existing updater, per-device identity, Current Project Root, pause intent, Gateway authorization and installer rollback boundaries are unchanged. Public Release publication remains separate from source publication and must use the exact bytes accepted by the native release gate; accepted installers must not be rebuilt for publication.
