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
