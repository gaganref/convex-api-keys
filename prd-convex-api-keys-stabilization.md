# PRD: Convex API Keys Stabilization and Release Plan

**Date:** 2026-03-07

---

## Problem Statement

### What problem are we solving?
The package is already useful, but its public contract is not fully aligned across runtime behavior, typing, documentation, and packaging. That creates three concrete risks:

- consumers may trust type guarantees that only apply to part of the API
- published package entrypoints may work in this repo but be fragile for external consumers
- runtime semantics such as refresh/rotation behavior may be interpreted differently than the implementation

At the same time, the package is approaching a republish/rename decision, which raises the quality bar for public API stability, docs, and release verification.

### Why now?
The package is close enough to useful that incremental fixes should be organized into a clear release plan instead of being handled ad hoc. The rename from `@gaganref/convex-api-keys` to `convex-api-keys` also makes this the right point to tighten the API surface before broader adoption.

### Who is affected?
- **Primary users:** Convex developers integrating the component into production apps
- **Secondary users:** Maintainers of the package, example app users, and future contributors

---

## Proposed Solution

### Overview
Create a single stabilization plan for the package covering correctness fixes, public API tightening, documentation alignment, release hardening, and a narrow set of justified feature additions. Work will be selected from this document one item at a time.

### User Experience
When this work is complete, package consumers should be able to install the package, configure the component, use the client API with consistent typing, understand rotation and cleanup behavior from the docs, and rely on a stable published package surface without repo-specific tooling assumptions.

#### User Flow: Adopt Package
1. User installs the package from npm.
2. User adds the Convex component to `convex.config.ts`.
3. User instantiates `ApiKeys<TOptions>` with typed metadata, permissions, and namespace constraints.
4. User uses `create`, `validate`, `getKey`, `listKeys`, `update`, `refresh`, and cleanup helpers with consistent type behavior.
5. User can verify expected behavior from docs and examples without reading package internals.

#### User Flow: Upgrade to New Package Name
1. Existing user sees the new unscoped package name in docs.
2. Existing scoped package remains available temporarily.
3. User can migrate imports with minimal ambiguity.
4. Deprecation messaging points users to the new package name.

---

## End State

When this PRD is complete, the following will be true:

- [ ] The typed contract is consistent across all major client methods
- [ ] Package exports are safe for external consumers
- [ ] Rotation semantics are explicitly defined and documented
- [ ] Release verification covers real consumer import paths
- [ ] The package rename plan is documented and executable
- [ ] New init options are intentionally scoped rather than added ad hoc
- [ ] Documentation and examples match the actual published package surface

---

## Success Metrics

### Quantitative

| Metric | Current | Target | Measurement Method |
|--------|---------|--------|-------------------|
| Public API mismatches identified in review | Multiple | 0 critical mismatches | Code review against doc and type contract |
| Broken/fragile published entrypoints | At least 1 known risk | 0 | Pack/install smoke test |
| Untyped major client read/update methods | Several | 0 | Type contract tests |
| Release validation steps | Informal | Repeatable checklist or script | Release docs / CI step |

### Qualitative

- Consumers can understand package behavior from the README alone
- Maintainer can decide release scope item by item without reopening discovery work
- New options feel justified and minimal rather than configurability for its own sake

---

## Acceptance Criteria

### Feature: Public API Hardening
- [ ] `getKey`, `listKeys`, and related result types preserve `TOptions` narrowing where appropriate
- [ ] Update/input types align with the declared metadata model where appropriate
- [ ] No exported entrypoint depends on raw source consumption unless explicitly documented as such
- [ ] Published package exports resolve cleanly in a consumer smoke test

### Feature: Runtime and Documentation Alignment
- [ ] Refresh/rotation expiry behavior is explicitly defined
- [ ] README examples and API docs match implementation behavior
- [ ] Cleanup and sweep behavior are documented in a way that matches actual lifecycle handling

### Feature: Release Readiness
- [ ] A rename/release plan exists for `convex-api-keys`
- [ ] Scoped package migration guidance is documented
- [ ] Release flow does not rely on hidden local-machine assumptions

### Feature: New Option Evaluation
- [ ] `keyDefaults.keyLengthBytes` or equivalent entropy configuration is evaluated and decided
- [ ] Only options with clear consumer value and long-term support justification are added
- [ ] Rejected option ideas are documented to avoid repeated re-litigation

---

## Technical Context

### Existing Patterns
- `src/client/options.ts` - Current init options model; already contains an internal `keyLengthBytes` default but does not expose it publicly
- `src/client/types.ts` - Type contract surface for generic client behavior
- `src/client/operations.ts` - Main client behavior and JSDoc contract
- `src/component/lib.ts` - Source of truth for runtime key lifecycle behavior
- `README.md` - Current user-facing contract and release narrative
- `package.json` - Current publish surface and export map

### Key Files
- `src/client/options.ts` - Candidate location for new init options
- `src/client/types.ts` - Needs typed result/input hardening
- `src/client/operations.ts` - Needs docs and behavior alignment
- `src/component/lib.ts` - Rotation semantics and lifecycle logic
- `src/test.ts` - Current published test helper surface
- `README.md` - Installation, examples, migration messaging
- `package.json` - Rename, exports, files, release scripts

### System Dependencies
- `convex`
- `convex-helpers`
- `convex-test`
- TypeScript/Vitest-based test setup

### Data Model Changes
- No schema change is required for the current stabilization work
- Feature additions should avoid schema changes unless they unlock clear value

---

## Scope Buckets

### Must Fix Before Rename/Re-Release

#### 1. Generic type consistency
- Ensure typed `namespace`, `permissions`, and `metadata` propagate through read/list/update paths, not just create/validate
- Add or expand type contract tests to lock this down

#### 2. Publish surface cleanup
- Remove or rework fragile source-based exports
- Decide whether `./test` is a supported package API
- Ensure exported paths point to built artifacts where possible

#### 3. Refresh semantics
- Decide whether refresh should:
  - preserve the existing absolute expiry timestamp, or
  - preserve relative TTL semantics from the time of rotation
- Make code, types, and docs unambiguous

#### 4. Release verification
- Add a repeatable smoke test for packed artifact consumption
- Validate `main` client import, `convex.config`, `_generated/component`, and any supported test helper exports

#### 5. Rename and migration plan
- Publish `convex-api-keys`
- Keep `@gaganref/convex-api-keys` temporarily
- Add deprecation messaging and migration notes

### Should Enhance

#### 6. Effective status ergonomics
- Consider `effectiveStatus` filtering in `listKeys`
- Consider status helper methods if they materially simplify common app code

#### 7. Observability improvements
- Improve debug output for sweep/cleanup runs
- Consider structured counts by reason and pages processed

#### 8. Release workflow hygiene
- Reduce dependence on interactive local tooling in release scripts
- Make changelog/versioning flow less editor-specific

#### 9. Consumer confidence tests
- Add tests around package exports, docs examples, and consumer import paths

### Candidate New Features

#### 10. Configurable key entropy length

Recommended direction:

- expose this via init options under `keyDefaults`
- prefer the name `keyLengthBytes` because it already exists internally and maps directly to implementation behavior
- document it as "entropy length in random bytes"

Proposed API:

```ts
new ApiKeys(components.apiKeys, {
  keyDefaults: {
    prefix: "ak_",
    keyLengthBytes: 32,
  },
});
```

Acceptance criteria:

- [ ] Option is publicly typed
- [ ] Option is validated at init time
- [ ] README explains security and token length implications
- [ ] Tests cover non-default lengths

Suggested validation:

- integer only
- minimum supported value documented explicitly
- reject unreasonably low values

#### 11. Runtime schema validation mode

Potential value:

- gives users an opt-in strict mode for metadata/permissions validation
- reduces mismatch between TS-only generics and stored runtime data

Reason to defer unless strongly needed:

- increases API surface and maintenance cost
- requires a clean validator story that fits Convex ergonomics

#### 12. Additional lifecycle hooks

Potential hooks:

- `onCreate`
- `onRefresh`
- possibly `onValidateFailure` only if there is a strong real use case

Reason to keep narrow:

- hooks increase coupling and support burden
- invalidate-related hook is currently the clearest operational extension point

#### 13. Higher-level authorization helper

Potential value:

- wraps validate + permission checks + optional touch flow
- reduces repeated application boilerplate

Reason to defer for now:

- app-specific authorization rules vary widely
- there is risk of creating a leaky abstraction too early

---

## Recommended Option Additions

These are the option additions currently worth serious consideration:

### Add
- `keyDefaults.keyLengthBytes`
  - clear use case
  - already aligns with internal implementation
  - low conceptual cost

### Consider Later
- `refreshDefaults`
  - only if refresh semantics become configurable
- `cleanupDefaults.retentionMs`
  - useful if cleanup becomes a bigger supported surface

### Avoid For Now
- custom token alphabet
- custom hash algorithm
- automatic `touch` during `validate`
- many overlapping aliases such as both `entropyBytes` and `keyLengthBytes`
- highly dynamic hook configuration beyond current lifecycle needs

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Adding too many options makes the library harder to reason about | Medium | High | Keep a narrow options policy and document rejected ideas |
| Rename happens before API hardening is complete | Medium | High | Treat hardening items as release gates |
| Refresh semantics change in a way that breaks user expectations | Medium | High | Make the behavior explicit and document migration impact |
| Fixing types exposes latent inconsistencies in tests/examples | High | Medium | Add contract tests before release |
| `./test` consumers rely on current behavior | Low | Medium | Either keep a supported built test surface or document removal as a breaking change |

---

## Alternatives Considered

### Alternative 1: Ship fixes ad hoc without a planning document
- **Description:** Continue patching issues one by one as they are discovered
- **Pros:** Fastest path to isolated fixes
- **Cons:** Easy to mix release blockers with optional enhancements and lose scope control
- **Decision:** Rejected for this phase

### Alternative 2: Freeze features and only fix bugs
- **Description:** Do not consider any new API additions until after rename/re-release
- **Pros:** Minimizes scope risk
- **Cons:** Misses low-cost improvements such as exposed key entropy configuration that fit naturally into current cleanup work
- **Decision:** Rejected in strict form; use a narrow allowlist for additions

---

## Non-Goals (v1)

Explicitly out of scope for this stabilization plan:

- building a full auth framework on top of API keys
- supporting arbitrary pluggable token encodings/hashing schemes
- adding broad policy engines or permission DSLs
- large schema changes unrelated to release hardening
- UI work in the example app beyond keeping examples accurate

---

## Interface Specifications

### Candidate Init Options

```ts
type ApiKeysOptions = {
  permissionDefaults?: Record<string, string[]>;
  keyDefaults?: {
    prefix?: string;
    keyLengthBytes?: number;
    ttlMs?: number | null;
    idleTimeoutMs?: number | null;
  };
  logLevel?: "debug" | "warn" | "error" | "none";
};
```

### Candidate Refresh Policy Decision

One of the following must be chosen and documented:

1. `preserveAbsoluteExpiry`
   The replacement key keeps the previous `expiresAt` timestamp.

2. `renewRelativeTtl`
   The replacement key gets a new `expiresAt` derived from a preserved TTL policy.

If configurability is introduced later, the default must still be explicit and documented.

---

## Documentation Requirements

- [ ] Update README installation/import examples for the final package name
- [ ] Document the supported init options including key entropy length if added
- [ ] Document refresh expiry semantics clearly
- [ ] Document any breaking change to `./test`
- [ ] Add migration notes for the scoped to unscoped package transition
