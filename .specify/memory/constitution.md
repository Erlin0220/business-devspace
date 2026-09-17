<!--
Sync Impact Report
- Version change: template -> 1.0.0
- Added principles: reuse-first architecture; security durability; fault isolation;
  compatible evolution; evidence-based delivery
- Added sections: Product and Technical Constraints; Development Workflow and Quality Gates
- Removed sections: none
- Follow-up TODOs: none
-->

# Business DevSpace Constitution

## Core Principles

### I. Reuse First, Keep the System Thin
Every change MUST prefer direct reuse of the existing DevSpace runtime, operating-system
facilities, Cloudflare, Caddy, current installers, and mature upstream tools over new custom
infrastructure. Composition and small adapters are preferred to parallel state machines,
duplicate control planes, or platform-specific business logic. New dependencies or abstractions
MUST solve a demonstrated gap and MUST keep long-term maintenance cost lower than the capability
they replace or add.

### II. Security Boundaries and Secret Durability Are Non-Negotiable
Authorization, identity, update-signing integrity, installer ownership, and encryption roots MUST
fail closed. Production secrets and resource identities MUST remain outside tracked source unless
they are explicitly public trust material. Non-recoverable identity or encryption keys MUST have a
tested independent recovery path or a documented migration/rotation procedure before becoming a
production dependency. Convenience features MUST NOT weaken device binding, revocation, update
verification, or MCP session isolation.

### III. Isolate Optional Failures from Core Lifecycle
Optional presentation, browser opening, diagnostics, history, cache cleanup, inventory reporting,
and similar auxiliary capabilities MUST degrade independently and remain retryable. A failure in an
auxiliary surface MUST NOT stop, roll back, or corrupt an otherwise healthy Runtime, Bridge, Tunnel,
or required controller path. Core lifecycle transitions MUST preserve ownership boundaries and user
intent, including the selected project root and desired remote-access pause state.

### IV. Evolve Compatibly and Publish Immutable Evidence
Schema, API, installer, and updater changes MUST use compatible migration boundaries when existing
clients or persisted data are involved. Expand/migrate/contract changes MUST be staged rather than
assuming every installed client moves atomically. Published versioned artifacts are immutable, and
the bytes promoted to users MUST be the same bytes that passed acceptance. Upgrade, repair, and
rollback paths MUST preserve healthy device identity, binding, project root, and user intent.

### V. Deliver from Evidence, Not Assumptions
Specifications, plans, implementation, and review MUST be grounded in the current repository,
tests, runtime behavior, and authoritative upstream documentation where external behavior matters.
Each change MUST receive the smallest effective validation for its risk: targeted tests for local
logic, integration tests for contracts and cross-component behavior, and native installer/runtime
acceptance for release-critical platform behavior. Build success alone MUST NOT be treated as
release acceptance.

## Product and Technical Constraints

- `Erlin0220/business-devspace` is the active public source repository. The former private
  repository is an internal history/recovery archive and MUST NOT be merged back into public Git
  history or used as the integration target.
- The project remains source-available under the unmodified PolyForm Shield 1.0.0 text, with
  third-party licenses and notices preserved.
- Software distribution and employee authorization remain separate: shared immutable installers
  are distributed independently of Access Key enrollment.
- The Gateway remains the authorization/control plane, not a second package-distribution service.
  Frequent local UI refreshes MUST NOT imply frequent Cloudflare/D1 traffic.
- Platform-specific shells may present state differently, but shared runtime/controller code owns
  business state, lifecycle operations, settings behavior, progress, and recovery.
- Production profiles, credentials, signing keys, encryption roots, and operator-only resource
  identities MUST NOT be introduced into tracked source as part of a feature specification.
- Detailed durable decisions in `AGENTS.md` and the referenced operational documents remain
  mandatory implementation constraints for work in their scope.

## Development Workflow and Quality Gates

1. GitHub Issues remain the durable request and tracking surface. Each non-trivial change SHOULD
   start from or link to an issue before implementation.
2. Spec Kit artifacts under `specs/<feature>/` are the repository-local design record for a
   feature. They supplement the linked GitHub Issue rather than replacing the issue tracker.
3. Use the Spec Kit flow as needed: `$speckit-specify` -> optional `$speckit-clarify` ->
   `$speckit-plan` -> `$speckit-tasks` -> optional `$speckit-analyze` / `$speckit-checklist` ->
   `$speckit-implement`. Keep artifacts concise and traceable to the user-visible requirement.
4. Development follows Issue -> branch -> PR -> CI/review -> merge. Direct routine commits to
   `main` are prohibited by project policy.
5. Plans MUST identify compatibility, security/trust-boundary, rollout, recovery, and native
   platform implications when those dimensions are affected. Unaffected dimensions need not be
   expanded merely to satisfy a template.
6. Implementation MUST use minimal necessary changes and MUST NOT mix unrelated cleanup into the
   feature branch. Verification failures must be classified as introduced regressions or existing
   baseline failures rather than hidden by unrelated fixes.
7. Source changes do not by themselves authorize production deployment, repository visibility or
   history changes, binary publication, secret rotation, or version-policy changes. Those actions
   require their own applicable authorization and acceptance evidence.

## Governance

This constitution defines the stable engineering principles used by Spec Kit for Business DevSpace.
`AGENTS.md`, domain documentation, issue-tracker conventions, release documentation, and current
tests provide more specific operational rules and MUST be consulted when relevant. Current code and
runtime evidence describe what is implemented; they do not silently override an explicit principle.

Constitution amendments MUST be intentional, reviewed with the change that requires them, and
versioned semantically: MAJOR for incompatible principle removals or redefinitions, MINOR for new or
materially expanded governance, and PATCH for non-semantic clarification. Every plan and review MUST
check the principles that materially apply to its scope; complexity or an exception MUST be justified
in the spec or plan rather than being introduced implicitly.

**Version**: 1.0.0 | **Ratified**: 2026-09-17 | **Last Amended**: 2026-09-17
