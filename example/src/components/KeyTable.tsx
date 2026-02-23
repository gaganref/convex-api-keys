import { useState } from "react";
import { usePaginatedQuery } from "convex-helpers/react";
import { useMutation } from "convex/react";
import { formatDistanceToNow, format } from "date-fns";
import { DotsThree, ClockCounterClockwise, Key, PencilSimple } from "@phosphor-icons/react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { PermissionBadge } from "@/components/PermissionBadge";
import { AuditLogSheet } from "@/components/AuditLogSheet";
import { KeyTokenReveal } from "@/components/KeyTokenReveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import type { Environment } from "@/lib/namespace";
import type { MockApiKey, KeyStatus, Permission } from "@/mock/data";
import { api } from "../../convex/_generated/api";

const STATUS_CONFIG: Record<
  KeyStatus,
  { label: string; dotClass: string; labelClass: string }
> = {
  active: {
    label: "Active",
    dotClass: "bg-green-500",
    labelClass: "text-green-600 dark:text-green-400",
  },
  expired: {
    label: "Expired",
    dotClass: "bg-yellow-500",
    labelClass: "text-yellow-600 dark:text-yellow-400",
  },
  revoked: {
    label: "Revoked",
    dotClass: "bg-red-500",
    labelClass: "text-red-600 dark:text-red-400",
  },
};

function StatusDot({ status }: { status: KeyStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn("size-1.5 rounded-full", config.dotClass)}
        style={
          status === "active"
            ? { boxShadow: "0 0 4px 1px oklch(0.6 0.2 142 / 60%)" }
            : undefined
        }
      />
      <span className={cn("text-xs", config.labelClass)}>{config.label}</span>
    </div>
  );
}

type KeyTableProps = {
  namespace: Environment;
};

export function KeyTable({ namespace }: KeyTableProps) {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const { results, status, loadMore } = usePaginatedQuery(
    api.keys.listKeys,
    { workspace, environment: namespace },
    { initialNumItems: 20 },
  );
  const revokeKey = useMutation(api.keys.revokeKey);
  const rotateKey = useMutation(api.keys.rotateKey);
  const updateKey = useMutation(api.keys.updateKey);
  const [auditKey, setAuditKey] = useState<MockApiKey | null>(null);
  const [rotateCandidate, setRotateCandidate] = useState<MockApiKey | null>(
    null,
  );
  const [rotating, setRotating] = useState(false);
  const [rotateError, setRotateError] = useState<string | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{
    token: string;
    keyName: string;
  } | null>(null);
  const [revokeCandidate, setRevokeCandidate] = useState<MockApiKey | null>(
    null,
  );
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<MockApiKey | null>(
    null,
  );
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const keys: Array<MockApiKey> = results.map((row) => ({
    id: row.keyId,
    name: row.name ?? "Unnamed key",
    prefix: row.tokenPreview.split("...")[0] ?? "ak_",
    start: row.tokenPreview,
    namespace,
    permissions: (row.permissions as Array<Permission>).filter(
      (permission) =>
        permission === "events:write" ||
        permission === "reports:read" ||
        permission === "admin",
    ),
    createdAt: new Date(row.createdAt),
    lastUsedAt: row.lastUsedAt === undefined ? null : new Date(row.lastUsedAt),
    expiresAt: row.expiresAt === undefined ? null : new Date(row.expiresAt),
    status: row.status,
  }));

  if (status === "LoadingFirstPage") {
    return (
      <div className="py-12 flex items-center justify-center text-muted-foreground">
        <Spinner className="size-4" />
      </div>
    );
  }

  async function handleRevokeConfirm() {
    if (!revokeCandidate) {
      return;
    }
    setRevoking(true);
    setRevokeError(null);
    try {
      const result = await revokeKey({
        workspace,
        environment: namespace,
        keyId: revokeCandidate.id,
        reason: "revoked_from_ui",
      });
      if (!result.ok) {
        setRevokeError(
          result.reason === "revoked"
            ? "This key is already revoked."
            : "Key not found.",
        );
        return;
      }
      setRevokeCandidate(null);
    } catch (error) {
      setRevokeError(
        error instanceof Error ? error.message : "Failed to revoke key.",
      );
    } finally {
      setRevoking(false);
    }
  }

  async function handleRotateConfirm() {
    if (!rotateCandidate) {
      return;
    }
    setRotating(true);
    setRotateError(null);
    try {
      const result = await rotateKey({
        workspace,
        environment: namespace,
        keyId: rotateCandidate.id,
        reason: "rotated_from_ui",
      });
      if (!result.ok) {
        setRotateError(
          result.reason === "revoked"
            ? "This key is already revoked."
            : result.reason === "expired" || result.reason === "idle_timeout"
              ? "This key is no longer active and cannot be rotated."
              : "Key not found.",
        );
        return;
      }
      setRotateCandidate(null);
      setRotatedToken({ token: result.token, keyName: rotateCandidate.name });
    } catch (error) {
      setRotateError(
        error instanceof Error ? error.message : "Failed to rotate key.",
      );
    } finally {
      setRotating(false);
    }
  }

  async function handleRenameConfirm() {
    if (!renameCandidate || !renameValue.trim()) {
      return;
    }
    setRenaming(true);
    setRenameError(null);
    try {
      const result = await updateKey({
        workspace,
        environment: namespace,
        keyId: renameCandidate.id,
        name: renameValue.trim(),
      });
      if (!result.ok) {
        setRenameError("Key not found.");
        return;
      }
      setRenameCandidate(null);
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Failed to rename key.",
      );
    } finally {
      setRenaming(false);
    }
  }

  if (keys.length === 0) {
    return (
      <Empty className="py-12 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Key />
          </EmptyMedia>
          <EmptyTitle>No keys yet</EmptyTitle>
          <EmptyDescription>
            Create your first {namespace} key to get started.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Name</TableHead>
            <TableHead className="text-xs">Key</TableHead>
            <TableHead className="text-xs">Permissions</TableHead>
            <TableHead className="text-xs">Created</TableHead>
            <TableHead className="text-xs">Last Used</TableHead>
            <TableHead className="text-xs">Expires</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow
              key={key.id}
              className={cn("text-xs", key.status !== "active" && "opacity-60")}
            >
              <TableCell className="font-medium">{key.name}</TableCell>
              <TableCell>
                <span className="font-mono text-muted-foreground">
                  {key.start}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {key.permissions.map((p) => (
                    <PermissionBadge key={p} permission={p} />
                  ))}
                </div>
              </TableCell>
              <TableCell
                className="text-muted-foreground"
                title={format(key.createdAt, "PPpp")}
              >
                {formatDistanceToNow(key.createdAt, { addSuffix: true })}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {key.lastUsedAt
                  ? formatDistanceToNow(key.lastUsedAt, { addSuffix: true })
                  : "Never"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {key.expiresAt ? (
                  <span
                    className={cn(
                      key.expiresAt < new Date() && "text-yellow-500",
                    )}
                  >
                    {formatDistanceToNow(key.expiresAt, { addSuffix: true })}
                  </span>
                ) : (
                  "Never"
                )}
              </TableCell>
              <TableCell>
                <StatusDot status={key.status} />
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center size-7 rounded-none hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none">
                    <DotsThree size={14} weight="bold" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs">
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={() => setAuditKey(key)}
                    >
                      <ClockCounterClockwise size={12} />
                      View audit log
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      onClick={() => {
                        setRenameValue(key.name);
                        setRenameError(null);
                        setRenameCandidate(key);
                      }}
                    >
                      <PencilSimple size={12} />
                      Rename key
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      disabled={key.status !== "active"}
                      onClick={() => {
                        setRotateError(null);
                        setRotateCandidate(key);
                      }}
                    >
                      Rotate key
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-xs gap-2"
                      disabled={key.status !== "active"}
                      onClick={() => {
                        setRevokeError(null);
                        setRevokeCandidate(key);
                      }}
                    >
                      Revoke key
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {status === "CanLoadMore" && (
        <div className="p-3 border-t flex justify-center">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => loadMore(20)}
          >
            Load more
          </Button>
        </div>
      )}

      {status === "LoadingMore" && (
        <div className="p-3 border-t flex justify-center text-muted-foreground">
          <Spinner className="size-4" />
        </div>
      )}

      {/* Rename dialog */}
      <Dialog
        open={!!renameCandidate}
        onOpenChange={(open) => {
          if (!open && !renaming) {
            setRenameCandidate(null);
            setRenameError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Rename key</DialogTitle>
            <DialogDescription className="text-xs">
              Update the display name for this key.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={renameValue}
              onChange={(e) => {
                setRenameValue(e.target.value);
                setRenameError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleRenameConfirm();
                if (e.key === "Escape") setRenameCandidate(null);
              }}
              className="font-mono text-sm"
              placeholder="Key name"
              disabled={renaming}
            />
            {renameError && (
              <p className="text-xs text-destructive">{renameError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={() => setRenameCandidate(null)}
                disabled={renaming}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="text-xs h-8"
                onClick={() => void handleRenameConfirm()}
                disabled={renaming || !renameValue.trim()}
              >
                {renaming ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit log sheet */}
      <AuditLogSheet
        apiKey={auditKey}
        open={!!auditKey}
        onOpenChange={(open) => !open && setAuditKey(null)}
      />

      <AlertDialog
        open={!!rotateCandidate}
        onOpenChange={(open) => {
          if (!open && !rotating) {
            setRotateCandidate(null);
            setRotateError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Rotate "{rotateCandidate?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              A new key will be generated and the old key will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {rotateError && (
            <p className="text-xs text-destructive">{rotateError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8" disabled={rotating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8"
              onClick={(event) => {
                event.preventDefault();
                void handleRotateConfirm();
              }}
              disabled={rotating}
            >
              {rotating ? "Rotating..." : "Rotate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!revokeCandidate}
        onOpenChange={(open) => {
          if (!open && !revoking) {
            setRevokeCandidate(null);
            setRevokeError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Revoke "{revokeCandidate?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This key will immediately stop working. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {revokeError && (
            <p className="text-xs text-destructive">{revokeError}</p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8" disabled={revoking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleRevokeConfirm();
              }}
              disabled={revoking}
            >
              {revoking ? "Revoking..." : "Revoke key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rotatedToken !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRotatedToken(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Key Rotated</DialogTitle>
            <DialogDescription className="text-xs">
              Save the new key now. The previous key has already been revoked.
            </DialogDescription>
          </DialogHeader>
          {rotatedToken && (
            <KeyTokenReveal
              token={rotatedToken.token}
              keyName={rotatedToken.keyName}
              onDone={() => setRotatedToken(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
