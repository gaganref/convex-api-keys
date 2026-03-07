export type Permission = "events:write" | "reports:read" | "admin";
export type Namespace = "production" | "testing";
export type KeyStatus = "active" | "revoked" | "expired" | "idle_timeout";
export type AuditEventType = "created" | "revoked" | "rotated";

export type ApiKey = {
  id: string;
  name: string;
  prefix: string;
  start: string;
  namespace: Namespace;
  permissions: Permission[];
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date | null;
  status: KeyStatus;
};
