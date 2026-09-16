# Third-party software

The root PolyForm Shield license covers Team DevSpace original code only.
Dependencies are separate components; their original licenses and copyright
notices are not replaced by it.

| Component | License and where the exact notice is retained |
| --- | --- |
| `@waishnav/devspace` | MIT; `DevSpace-MIT.txt` and installed `node_modules/@waishnav/devspace/LICENSE` |
| Pico CSS | MIT; `assets/admin/PICO-LICENSE.md` (Gateway distribution) |
| cloudflared | Apache-2.0; `cloudflared-LICENSE.txt`; pinned upstream source in release provenance |
| Node.js | Node's own license and bundled notices in `runtime/LICENSE` |
| Git for Windows / PortableGit | External Windows prerequisite only. When Git Bash is absent, the installer acquires the pinned official Git for Windows release directly from GitHub and verifies its SHA-256. It is not included in Team DevSpace release bytes. |
| npm dependencies | Original license files retained in runtime packages; exact versions/licenses recorded by the generated CycloneDX SBOM |
| Rust tray dependencies | Original resolved Cargo package license/NOTICE files copied into packaged `LICENSES/rust/`, with a path-redacted index; exact dependency graph in Cargo.lock and the SBOM |

The packaging allow-list includes LICENSE, NOTICE and this directory. It must
not strip upstream license, COPYING or NOTICE files when pruning dependencies.
Rust notice collection fails packaging when a resolved external crate has no
original notice files. This does not certify the license compatibility of every
dependency, compiler runtime or Go dependency embedded in cloudflared. Those
remain part of final binary redistribution review.

Git for Windows is an independent external prerequisite, not linked into Team
DevSpace and not redistributed inside Team DevSpace installers. Its own GPL and
bundled component licenses remain applicable to the copy acquired from the
official Git for Windows release. Team DevSpace records the exact upstream URL,
version and SHA-256 solely to make that prerequisite deterministic; it does not
relabel Git for Windows as PolyForm-licensed.

Upstream sources:
- https://github.com/Waishnav/devspace
- https://github.com/picocss/pico
- https://github.com/cloudflare/cloudflared
- https://nodejs.org/
- https://github.com/git-for-windows/git
- https://github.com/git-for-windows/build-extra

The maintainer must confirm rights to publish original code and artwork,
including any employer-owned contributions. Automated scanning is not legal
clearance and does not verify every transitive dependency's license obligations.
