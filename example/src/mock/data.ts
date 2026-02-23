export type Permission = "events:write" | "reports:read" | "admin";
export type Namespace = "production" | "testing";
export type KeyStatus = "active" | "revoked" | "expired";
export type AuditEventType = "created" | "revoked" | "rotated";

export type MockApiKey = {
  id: string;
  name: string;
  prefix: string;
  start: string;
  namespace: Namespace;
  permissions: Permission[];
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  status: KeyStatus;
};

export type MockEvent = {
  id: string;
  namespace: Namespace;
  event: string;
  keyId: string;
  keyName: string;
  props: Record<string, unknown>;
  timestamp: Date;
};

export type MockAuditEvent = {
  id: string;
  keyId: string;
  keyName: string;
  type: AuditEventType;
  timestamp: Date;
};

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const hoursAgo = (n: number) => new Date(now.getTime() - n * 3600000);
const minsAgo = (n: number) => new Date(now.getTime() - n * 60000);

export const MOCK_KEYS: MockApiKey[] = [
  // Production keys
  {
    id: "key_prod_1",
    name: "Backend Server",
    prefix: "bkn_live_",
    start: "bkn_live_Kx",
    namespace: "production",
    permissions: ["events:write"],
    createdAt: daysAgo(45),
    lastUsedAt: minsAgo(2),
    expiresAt: null,
    status: "active",
  },
  {
    id: "key_prod_2",
    name: "Dashboard",
    prefix: "bkn_live_",
    start: "bkn_live_Rp",
    namespace: "production",
    permissions: ["reports:read"],
    createdAt: daysAgo(30),
    lastUsedAt: hoursAgo(1),
    expiresAt: new Date(now.getTime() + 20 * 86400000),
    status: "active",
  },
  {
    id: "key_prod_3",
    name: "Legacy Ingest",
    prefix: "bkn_live_",
    start: "bkn_live_Wd",
    namespace: "production",
    permissions: ["events:write", "reports:read"],
    createdAt: daysAgo(120),
    lastUsedAt: daysAgo(3),
    expiresAt: daysAgo(1),
    status: "expired",
  },
  // Testing keys
  {
    id: "key_test_1",
    name: "Local Dev",
    prefix: "bkn_test_",
    start: "bkn_test_Mn",
    namespace: "testing",
    permissions: ["events:write", "reports:read", "admin"],
    createdAt: daysAgo(10),
    lastUsedAt: minsAgo(15),
    expiresAt: null,
    status: "active",
  },
  {
    id: "key_test_2",
    name: "CI Pipeline",
    prefix: "bkn_test_",
    start: "bkn_test_Lz",
    namespace: "testing",
    permissions: ["events:write"],
    createdAt: daysAgo(7),
    lastUsedAt: hoursAgo(3),
    expiresAt: new Date(now.getTime() + 7 * 86400000),
    status: "active",
  },
  {
    id: "key_test_3",
    name: "Staging (revoked)",
    prefix: "bkn_test_",
    start: "bkn_test_Qv",
    namespace: "testing",
    permissions: ["events:write"],
    createdAt: daysAgo(20),
    lastUsedAt: daysAgo(5),
    expiresAt: null,
    status: "revoked",
  },
];

export const MOCK_EVENTS: MockEvent[] = [
  {
    id: "evt_1",
    namespace: "production",
    event: "page_view",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { url: "/dashboard", referrer: "https://google.com", user_id: "usr_abc123" },
    timestamp: minsAgo(2),
  },
  {
    id: "evt_2",
    namespace: "production",
    event: "button_click",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { element_id: "cta-upgrade", page: "/pricing" },
    timestamp: minsAgo(5),
  },
  {
    id: "evt_3",
    namespace: "production",
    event: "signup",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { plan: "pro", source: "organic" },
    timestamp: minsAgo(18),
  },
  {
    id: "evt_4",
    namespace: "production",
    event: "page_view",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { url: "/pricing", user_id: "usr_def456" },
    timestamp: minsAgo(32),
  },
  {
    id: "evt_5",
    namespace: "production",
    event: "payment_completed",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { amount: 4900, currency: "usd", plan: "pro" },
    timestamp: hoursAgo(1),
  },
  {
    id: "evt_6",
    namespace: "production",
    event: "api_call",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { endpoint: "/v1/track", method: "POST", status: 200 },
    timestamp: hoursAgo(2),
  },
  {
    id: "evt_7",
    namespace: "production",
    event: "logout",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { user_id: "usr_abc123", session_duration: 1843 },
    timestamp: hoursAgo(3),
  },
  {
    id: "evt_8",
    namespace: "production",
    event: "feature_used",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { feature: "export_csv", user_id: "usr_ghi789" },
    timestamp: hoursAgo(5),
  },
  {
    id: "evt_9",
    namespace: "production",
    event: "page_view",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { url: "/", user_id: "usr_jkl012" },
    timestamp: hoursAgo(8),
  },
  {
    id: "evt_10",
    namespace: "production",
    event: "error",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { code: "NETWORK_ERROR", component: "checkout" },
    timestamp: hoursAgo(12),
  },
  {
    id: "evt_11",
    namespace: "testing",
    event: "page_view",
    keyId: "key_test_1",
    keyName: "Local Dev",
    props: { url: "/test", debug: true },
    timestamp: minsAgo(15),
  },
  {
    id: "evt_12",
    namespace: "testing",
    event: "signup",
    keyId: "key_test_1",
    keyName: "Local Dev",
    props: { plan: "free", source: "test_harness", test: true },
    timestamp: minsAgo(28),
  },
  {
    id: "evt_13",
    namespace: "testing",
    event: "button_click",
    keyId: "key_test_2",
    keyName: "CI Pipeline",
    props: { element_id: "submit", form: "onboarding_step_2" },
    timestamp: hoursAgo(3),
  },
  {
    id: "evt_14",
    namespace: "testing",
    event: "api_call",
    keyId: "key_test_2",
    keyName: "CI Pipeline",
    props: { endpoint: "/v1/events", status: 200, test_run: "run_4512" },
    timestamp: hoursAgo(3),
  },
  {
    id: "evt_15",
    namespace: "testing",
    event: "payment_completed",
    keyId: "key_test_1",
    keyName: "Local Dev",
    props: { amount: 0, currency: "usd", plan: "test", test: true },
    timestamp: hoursAgo(6),
  },
  {
    id: "evt_16",
    namespace: "testing",
    event: "error",
    keyId: "key_test_1",
    keyName: "Local Dev",
    props: { code: "VALIDATION_ERROR", field: "email", test: true },
    timestamp: hoursAgo(8),
  },
  {
    id: "evt_17",
    namespace: "testing",
    event: "feature_used",
    keyId: "key_test_2",
    keyName: "CI Pipeline",
    props: { feature: "bulk_import", records: 50, test_run: "run_4511" },
    timestamp: daysAgo(1),
  },
  {
    id: "evt_18",
    namespace: "testing",
    event: "logout",
    keyId: "key_test_1",
    keyName: "Local Dev",
    props: { user_id: "test_user_1", test: true },
    timestamp: daysAgo(1),
  },
  {
    id: "evt_19",
    namespace: "production",
    event: "page_view",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { url: "/blog", user_id: "usr_mno345" },
    timestamp: daysAgo(1),
  },
  {
    id: "evt_20",
    namespace: "production",
    event: "signup",
    keyId: "key_prod_1",
    keyName: "Backend Server",
    props: { plan: "free", source: "twitter" },
    timestamp: daysAgo(2),
  },
];

export const MOCK_AUDIT_EVENTS: MockAuditEvent[] = [
  { id: "audit_1", keyId: "key_test_1", keyName: "Local Dev", type: "created", timestamp: daysAgo(10) },
  { id: "audit_2", keyId: "key_prod_2", keyName: "Dashboard", type: "created", timestamp: daysAgo(30) },
  { id: "audit_3", keyId: "key_test_2", keyName: "CI Pipeline", type: "created", timestamp: daysAgo(7) },
  { id: "audit_4", keyId: "key_test_3", keyName: "Staging (revoked)", type: "created", timestamp: daysAgo(20) },
  { id: "audit_5", keyId: "key_prod_1", keyName: "Backend Server", type: "rotated", timestamp: daysAgo(15) },
  { id: "audit_6", keyId: "key_test_3", keyName: "Staging (revoked)", type: "revoked", timestamp: daysAgo(5) },
  { id: "audit_7", keyId: "key_prod_2", keyName: "Dashboard", type: "rotated", timestamp: daysAgo(4) },
  { id: "audit_8", keyId: "key_test_1", keyName: "Local Dev", type: "rotated", timestamp: daysAgo(2) },
  { id: "audit_9", keyId: "key_prod_1", keyName: "Backend Server", type: "rotated", timestamp: daysAgo(1) },
  { id: "audit_10", keyId: "key_test_2", keyName: "CI Pipeline", type: "rotated", timestamp: hoursAgo(6) },
  { id: "audit_11", keyId: "key_prod_3", keyName: "Legacy Ingest", type: "created", timestamp: daysAgo(120) },
  { id: "audit_12", keyId: "key_prod_1", keyName: "Backend Server", type: "created", timestamp: daysAgo(45) },
];

// Per-key audit events (used in AuditLogSheet)
export function getKeyAuditEvents(keyId: string): MockAuditEvent[] {
  return MOCK_AUDIT_EVENTS.filter((e) => e.keyId === keyId).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
  );
}

// Chart data: events per day for last 7 days
export function getWeeklyChartData(): { date: string; production: number; testing: number }[] {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = daysAgo(i);
    const label = day.toLocaleDateString("en-US", { weekday: "short" });
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);

    const prod = MOCK_EVENTS.filter(
      (e) =>
        e.namespace === "production" &&
        e.timestamp >= dayStart &&
        e.timestamp <= dayEnd,
    ).length;
    const test = MOCK_EVENTS.filter(
      (e) =>
        e.namespace === "testing" &&
        e.timestamp >= dayStart &&
        e.timestamp <= dayEnd,
    ).length;

    days.push({ date: label, production: prod || Math.floor(Math.random() * 12) + 1, testing: test || Math.floor(Math.random() * 8) + 1 });
  }
  return days;
}
