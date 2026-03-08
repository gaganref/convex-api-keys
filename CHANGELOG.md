# Changelog

## 0.2.0

- Rename the package to `convex-api-keys`.
- Add typed `effectiveStatus` filtering with cursor-safe pagination.
- Add `keyDefaults.keyLengthBytes` for configurable token entropy length.
- Split cleanup into `cleanupKeys` and `cleanupEvents` so audit events can outlive deleted keys.
- Enrich audit events with immutable key snapshots and rotation linkage fields.
- Tighten client typing across `getKey`, `listKeys`, and `update`.

## 0.1.1

- Fix sweep pagination to work inside components.

## 0.1.0

- Initial public release.
- API key creation, validation, invalidation, and rotation.
- Cursor-based sweep for expired and idle keys.
- Configurable TTL, idle timeout, permissions, and metadata.
- Audit event log with pagination.
- onInvalidate hook support.
