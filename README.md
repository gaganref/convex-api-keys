# Convex API Keys

[![npm version](https://badge.fury.io/js/@gaganref%2Fconvex-api-keys.svg)](https://badge.fury.io/js/@gaganref%2Fconvex-api-keys)

<!-- START: Include on https://convex.dev/components -->

A [Convex](https://convex.dev) component for API key management. Create,
validate, rotate, and revoke API keys with built-in expiry, idle timeout,
permissions, metadata, and audit logging.

```ts
const result = await apiKeys.create(ctx, {
  name: "Backend Server",
  permissions: { scope: ["read", "write"] },
});
// result.token → "ak_7Kf9..."

const check = await apiKeys.validate(ctx, { token: "ak_7Kf9..." });
if (check.ok) {
  // check.keyId, check.permissions, check.metadata
}
```

Found a bug? Feature request?
[File it here](https://github.com/gaganref/convex-api-keys/issues).

## Pre-requisite: Convex

You'll need an existing Convex project to use this component. Convex is a hosted
backend platform, including a database, serverless functions, and a ton more
you'd need to build a production app. If you haven't used Convex before, the
[Convex tutorial](https://docs.convex.dev/get-started) is a great place to
start.

## Installation

```sh
npm install @gaganref/convex-api-keys
```

Create a `convex.config.ts` file in your app's `convex/` folder and install the
component by calling `use`:

```ts
// convex/convex.config.ts
import { defineApp } from "convex/server";
import apiKeys from "@gaganref/convex-api-keys/convex.config.js";

const app = defineApp();
app.use(apiKeys);

export default app;
```

## Quick Start

Instantiate the client in a shared file:

```ts
// convex/apiKeys.ts
import { ApiKeys } from "@gaganref/convex-api-keys";
import { components } from "./_generated/api.js";

export const apiKeys = new ApiKeys(components.apiKeys);
```

Use it in your mutations and queries:

```ts
// convex/myFunctions.ts
import { mutation, query } from "./_generated/server.js";
import { v } from "convex/values";
import { apiKeys } from "./apiKeys.js";

export const createKey = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await apiKeys.create(ctx, { name: args.name });
  },
});

export const validateKey = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    return await apiKeys.validate(ctx, { token: args.token });
  },
});
```

## Typed Options

The `ApiKeys` class accepts a generic parameter for type-safe namespaces,
permissions, metadata, and required fields:

```ts
export const apiKeys = new ApiKeys<{
  namespace: `${string}:${"production" | "testing"}`;
  requireName: true;
  metadata: { source: string };
  permissions: { scope: Array<"read" | "write" | "admin"> };
}>(components.apiKeys, {
  permissionDefaults: {
    scope: ["read"],
  },
  keyDefaults: {
    prefix: "sk_",
    keyLengthBytes: 32, // token entropy bytes
    ttlMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    idleTimeoutMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
  logLevel: "debug",
});
```

Type options:

- `namespace` — any `string` subtype. When set, `namespace` becomes required in
  `create` args.
- `requireName` — set to `true` to require `name` in `create` args.
- `metadata` — shape of the metadata object stored with each key.
- `permissions` — shape of the permissions object. Values must be `string[]`
  subtypes.

> **Note:** These are **compile-time type constraints only**, not runtime
> validators. The underlying database stores flexible types:
>
> - `namespace` → `v.optional(v.string())`
> - `permissions` → `v.optional(v.record(v.string(), v.array(v.string())))`
> - `metadata` → `v.optional(v.record(v.string(), v.any()))`
>
> If you change your type options after keys have been created, existing data is
> not automatically migrated — ensure your new types are backwards-compatible
> with stored data.

## Usage

### Create

```ts
const key = await apiKeys.create(ctx, {
  name: "My API Key",
  namespace: "acme:production",
  permissions: { scope: ["read", "write"] },
  metadata: { source: "dashboard" },
  ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  idleTimeoutMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  prefix: "sk_live_", // override default prefix
});
// key.keyId    — unique identifier
// key.token    — plaintext token (only available at creation time)
// key.tokenPrefix — e.g. "sk_live_"
// key.tokenLast4  — last 4 chars for display
// key.createdAt   — timestamp
// key.expiresAt   — timestamp or undefined
```

### Validate

```ts
const result = await apiKeys.validate(ctx, { token: "sk_live_7Kf9..." });
if (result.ok) {
  // result.keyId, result.namespace, result.permissions, result.metadata
} else {
  // result.reason: "not_found" | "revoked" | "expired" | "idle_timeout"
}
```

Validation is a **read-only query** by design — it does not update the key's
`lastUsedAt` timestamp. This keeps validation fast and side-effect-free. Call
`touch` separately after you have fully authorized the request (e.g. after
checking permissions) to keep idle timeout tracking accurate.

### Touch

Update the `lastUsedAt` timestamp to keep idle timeout tracking accurate. Call
this after you have fully authorized the request — not immediately after
`validate`, but after any additional permission checks or business logic:

```ts
const result = await apiKeys.validate(ctx, { token });
if (!result.ok) {
  throw new Error(`Invalid key: ${result.reason}`);
}

// Check application-level permissions, enforce business rules, etc.

// Only touch after the request is fully authorized
await apiKeys.touch(ctx, { keyId: result.keyId });
```

### Get Key

Retrieve full details for a single key by ID:

```ts
const result = await apiKeys.getKey(ctx, { keyId: "..." });
if (result.ok) {
  // result.keyId, result.name, result.namespace, result.permissions
  // result.metadata, result.effectiveStatus, result.expiresAt, etc.
} else {
  // result.reason: "not_found"
}
```

### List Keys

Paginated listing with optional namespace and status filters:

```ts
const page = await apiKeys.listKeys(ctx, {
  namespace: "acme:production",
  effectiveStatus: "expired", // or "active" | "idle_timeout" | "revoked"
  order: "desc",
  paginationOpts: { numItems: 20, cursor: null },
});
// page.page — array of key summaries
// page.isDone, page.continueCursor — pagination controls
```

`status` filters by stored database state (`"active"` or `"revoked"`). Use
`effectiveStatus` to filter by current computed state. These options are
mutually exclusive.

### Update

Update a key's name, metadata, expiry, or idle timeout:

```ts
const result = await apiKeys.update(ctx, {
  keyId: "...",
  name: "Renamed Key",
  metadata: { source: "updated" },
  expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  maxIdleMs: 24 * 60 * 60 * 1000,
});
// result.ok — true on success
// result.reason — "not_found" or "already_revoked" on failure
```

Pass `null` to `expiresAt` or `maxIdleMs` to remove them entirely.

### Invalidate (Revoke)

Revoke a single key:

```ts
const result = await apiKeys.invalidate(ctx, {
  keyId: "...",
  reason: "compromised",
  metadata: { revokedBy: "admin" },
});
```

### Invalidate All (Bulk Revoke)

Revoke all active keys, optionally scoped by namespace and creation time:

```ts
const result = await apiKeys.invalidateAll(ctx, {
  namespace: "acme:production",
  before: Date.now(), // only keys created before this timestamp
  reason: "security rotation",
});
// result.processed, result.revoked, result.pages
```

### Refresh (Rotate)

Atomically revoke an existing key and create a new one that preserves the
existing namespace, metadata, permissions, idle timeout, and current absolute
`expiresAt` timestamp:

```ts
const result = await apiKeys.refresh(ctx, {
  keyId: "...",
  prefix: "sk_live_",
  reason: "scheduled rotation",
});
if (result.ok) {
  // result.token — new plaintext token
  // result.keyId — new key ID
  // result.replacedKeyId — old key ID
}
```

If the old key was created with a TTL, refresh preserves the current
`expiresAt` deadline. It does not renew the TTL from the time of rotation.

### List Events (Audit Log)

Paginated event log scoped by namespace or by individual key:

```ts
// All events in a namespace
const events = await apiKeys.listEvents(ctx, {
  namespace: "acme:production",
  paginationOpts: { numItems: 50, cursor: null },
});

// Events for a specific key
const keyEvents = await apiKeys.listKeyEvents(ctx, {
  keyId: "...",
  paginationOpts: { numItems: 50, cursor: null },
});
```

### Cleanup

Use separate cleanup jobs for revoked keys and audit events. It is recommended
to schedule both as cron jobs with independent retention windows:

```ts
// convex/cleanup.ts
import { internalMutation } from "./_generated/server.js";
import { apiKeys } from "./apiKeys.js";

const KEY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EVENT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

export const cleanupKeys = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await apiKeys.cleanupKeys(ctx, { retentionMs: KEY_RETENTION_MS });
  },
});

export const cleanupEvents = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await apiKeys.cleanupEvents(ctx, { retentionMs: EVENT_RETENTION_MS });
  },
});
```

```ts
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

const crons = cronJobs();
crons.interval(
  "cleanup revoked api keys",
  { hours: 24 },
  internal.cleanup.cleanupKeys,
);
crons.interval(
  "cleanup api key events",
  { hours: 24 },
  internal.cleanup.cleanupEvents,
);
export default crons;
```

`cleanupKeys` deletes revoked keys only. `cleanupEvents` deletes audit events
independently, so events can outlive deleted keys.

## Automatic Expiry (Sweep)

The component includes built-in cron jobs that run every hour to:

- **Sweep expired keys** — revokes active keys past their `expiresAt` timestamp.
- **Sweep idle keys** — revokes active keys that haven't been touched within
  their `maxIdleMs` window.

Both sweeps use cursor-based pagination so they handle any number of keys
without stalling. No additional setup is required — the crons are registered
automatically when the component is installed.

## Configuration Options

Pass options when instantiating `ApiKeys`:

```ts
new ApiKeys(components.apiKeys, {
  permissionDefaults: { scope: ["read"] },
  keyDefaults: {
    prefix: "ak_", // token prefix (default: "ak_")
    keyLengthBytes: 32, // token entropy bytes, integer >= 16 (default: 32)
    ttlMs: null, // absolute expiry in ms (default: null)
    idleTimeoutMs: null, // idle timeout in ms (default: null)
  },
  logLevel: "warn", // "debug" | "warn" | "error" | "none"
});
```

### onInvalidate Hook

Register a hook that fires whenever a key is invalidated, refreshed, or bulk
invalidated. The hook is called inline via `ctx.runMutation` and failures are
swallowed so they don't affect the main operation:

```ts
// convex/apiKeys.ts
import { ApiKeys } from "@gaganref/convex-api-keys";
import { components, internal } from "./_generated/api.js";

export const apiKeys = new ApiKeys(components.apiKeys).withHooks({
  onInvalidate: internal.hooks.onInvalidate,
});
```

```ts
// convex/hooks.ts
import { internalMutation } from "./_generated/server.js";
import { onInvalidateHookPayloadValidator } from "@gaganref/convex-api-keys";

export const onInvalidate = internalMutation({
  args: { event: onInvalidateHookPayloadValidator },
  handler: async (ctx, { event }) => {
    // event.trigger: "invalidate" | "refresh" | "invalidateAll"
    // event.keyId, event.reason, etc.
    console.log("Key invalidated:", event);
  },
});
```

## Security Model

- **Hash-only storage** — Plaintext tokens are never stored. Only a SHA-256 hash
  is persisted; the plaintext is returned once at creation/rotation time.
- **256-bit entropy** — Tokens are generated with 32 bytes of cryptographically
  random data via the Web Crypto API.
- **Prefix-based identification** — Token prefixes (e.g. `sk_live_`) allow
  identifying key type without exposing the secret.
- **Last-4 display** — Only the last 4 characters are stored for display in
  dashboards and logs.

## Example App

See the [example/](./example) directory for a full API keys dashboard built with
React, Tailwind CSS, and shadcn/ui that demonstrates all features of this
component.

> **Security note:** The Quick Start examples above export public mutations and
> queries for simplicity. In production, you should gate key management
> operations behind an authentication layer (e.g. Convex Auth, Clerk, Workos)
> and verify the caller has appropriate permissions before creating, revoking,
> or listing keys.

```sh
npm i
npm run dev
```

<!-- END: Include on https://convex.dev/components -->
