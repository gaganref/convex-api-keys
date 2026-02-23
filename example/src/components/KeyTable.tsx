import { useState } from "react";
import { usePaginatedQuery } from "convex-helpers/react";
import { formatDistanceToNow, format } from "date-fns";
import {
  DotsThree,
  ClockCounterClockwise,
  Key,
  PencilSimple,
} from "@phosphor-icons/react";
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { PermissionBadge } from "@/components/PermissionBadge";
import { AuditLogSheet } from "@/components/AuditLogSheet";
import { RenameKeyDialog } from "@/components/RenameKeyDialog";
import { RotateKeyDialog } from "@/components/RotateKeyDialog";
import { RevokeKeyDialog } from "@/components/RevokeKeyDialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";
import type { Environment } from "@/lib/namespace";
import type { MockApiKey, KeyStatus, Permission } from "@/mock/data";
import { api } from "../../convex/_generated/api";

const PAGE_SIZE = 20;

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
    <div className="flex items-center gap-1.5" role="status" aria-label={`Status: ${config.label}`}>
      <div
        className={cn(
          "size-1.5 rounded-full",
          config.dotClass,
          status === "active" && "shadow-[0_0_4px_1px] shadow-green-500/60",
        )}
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
    { initialNumItems: PAGE_SIZE },
  );
  const [auditKey, setAuditKey] = useState<MockApiKey | null>(null);
  const [rotateCandidate, setRotateCandidate] = useState<MockApiKey | null>(null);
  const [revokeCandidate, setRevokeCandidate] = useState<MockApiKey | null>(null);
  const [renameCandidate, setRenameCandidate] = useState<MockApiKey | null>(null);

  const keys: Array<MockApiKey> = results.map((row) => ({
    id: row.keyId,
    name: row.name ?? "Unnamed key",
    prefix: row.tokenPreview.split("...")[0] ?? "sk_",
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
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs hidden sm:table-cell">Key</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Permissions</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Created</TableHead>
              <TableHead className="text-xs hidden lg:table-cell">Last Used</TableHead>
              <TableHead className="text-xs hidden md:table-cell">Expires</TableHead>
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
                <TableCell className="hidden sm:table-cell">
                  <span className="font-mono text-muted-foreground">
                    {key.start}
                  </span>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {key.permissions.map((p) => (
                      <PermissionBadge key={p} permission={p} />
                    ))}
                  </div>
                </TableCell>
                <TableCell
                  className="text-muted-foreground hidden lg:table-cell"
                  title={format(key.createdAt, "PPpp")}
                >
                  {formatDistanceToNow(key.createdAt, { addSuffix: true })}
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {key.lastUsedAt
                    ? formatDistanceToNow(key.lastUsedAt, { addSuffix: true })
                    : "Never"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
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
                    <DropdownMenuTrigger
                      aria-label="Key actions"
                      className="inline-flex items-center justify-center size-7 rounded-none hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none"
                    >
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
                        onClick={() => setRenameCandidate(key)}
                      >
                        <PencilSimple size={12} />
                        Rename key
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-xs gap-2"
                        disabled={key.status !== "active"}
                        onClick={() => setRotateCandidate(key)}
                      >
                        Rotate key
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-xs gap-2"
                        disabled={key.status !== "active"}
                        onClick={() => setRevokeCandidate(key)}
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
      </div>

      {status === "CanLoadMore" && (
        <div className="p-3 border-t flex justify-center">
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => loadMore(PAGE_SIZE)}
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

      <RenameKeyDialog
        apiKey={renameCandidate}
        namespace={namespace}
        onOpenChange={(open) => !open && setRenameCandidate(null)}
      />

      <AuditLogSheet
        apiKey={auditKey}
        open={!!auditKey}
        onOpenChange={(open) => !open && setAuditKey(null)}
      />

      <RotateKeyDialog
        apiKey={rotateCandidate}
        namespace={namespace}
        onOpenChange={(open) => !open && setRotateCandidate(null)}
      />

      <RevokeKeyDialog
        apiKey={revokeCandidate}
        namespace={namespace}
        onOpenChange={(open) => !open && setRevokeCandidate(null)}
      />
    </>
  );
}
