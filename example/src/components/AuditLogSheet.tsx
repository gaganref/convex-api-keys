import { usePaginatedQuery } from "convex-helpers/react";
import { formatDistanceToNow, format } from "date-fns";
import { Key, ArrowsClockwise, X } from "@phosphor-icons/react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { MockApiKey, AuditEventType, KeyStatus } from "@/mock/types";
import { PermissionBadge } from "@/components/PermissionBadge";
import { useAuth } from "@/context/AuthContext";
import { api } from "../../convex/_generated/api";

const EVENT_CONFIG: Record<
  AuditEventType,
  {
    label: string;
    icon: typeof Key;
    iconClass: string;
    bgClass: string;
    badgeClass: string;
  }
> = {
  created: {
    label: "Created",
    icon: Key,
    iconClass: "text-green-600 dark:text-green-400",
    bgClass: "bg-green-500/10",
    badgeClass:
      "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  rotated: {
    label: "Rotated",
    icon: ArrowsClockwise,
    iconClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10",
    badgeClass:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  },
  revoked: {
    label: "Revoked",
    icon: X,
    iconClass: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-500/10",
    badgeClass:
      "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

const STATUS_BADGE: Record<KeyStatus, { label: string; className: string }> = {
  active: {
    label: "Active",
    className:
      "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  },
  expired: {
    label: "Expired",
    className:
      "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
  },
  revoked: {
    label: "Revoked",
    className: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  },
};

const PAGE_SIZE = 20;

type AuditLogSheetProps = {
  apiKey: MockApiKey | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function AuditLogSheet({
  apiKey,
  open,
  onOpenChange,
}: AuditLogSheetProps) {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const { results, status, loadMore } = usePaginatedQuery(
    api.keys.listKeyEvents,
    apiKey
      ? {
          workspace,
          environment: apiKey.namespace,
          keyId: apiKey.id,
        }
      : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const events: Array<{
    id: string;
    type: AuditEventType;
    timestamp: Date;
  }> = results.map((event) => ({
    id: event.eventId,
    type: event.type as AuditEventType,
    timestamp: new Date(event.createdAt),
  }));
  const statusConfig = apiKey ? STATUS_BADGE[apiKey.status] : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="font-mono text-sm">
            {apiKey?.name ?? "Audit Log"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            History of all events for this key.
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-4">
          {/* Key metadata */}
          {apiKey && statusConfig && (
            <div className="mt-4 border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    "h-5 text-[10px] px-1.5 py-0",
                    statusConfig.className,
                  )}
                >
                  {statusConfig.label}
                </Badge>
                <Badge
                  variant="outline"
                  className="h-5 text-[10px] px-1.5 py-0 font-mono"
                >
                  {apiKey.namespace}
                </Badge>
                {apiKey.permissions.map((p) => (
                  <PermissionBadge key={p} permission={p} />
                ))}
              </div>
              <div className="mt-2 border-t pt-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Key Preview
                </p>
                <p className="text-xs font-mono text-muted-foreground mt-0.5">
                  {apiKey.start}...
                </p>
              </div>
            </div>
          )}

          <ScrollArea className="mt-4 max-h-[60vh]">
            <div className="flex flex-col gap-0 pr-4">
              {events.length === 0 ? (
                <div className="py-6 text-center">
                  {status === "LoadingFirstPage" ? (
                    <Spinner className="size-4 mx-auto text-muted-foreground" />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No events recorded.
                    </p>
                  )}
                </div>
              ) : (
                events.map((event, i) => {
                  const config = EVENT_CONFIG[event.type];
                  const Icon = config.icon;
                  const isLast = i === events.length - 1;

                  return (
                    <div key={event.id} className="flex gap-3 py-2">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "flex size-6 shrink-0 items-center justify-center rounded-full",
                            config.bgClass,
                            config.iconClass,
                          )}
                        >
                          <Icon size={11} weight="bold" />
                        </div>
                        {!isLast && (
                          <div className="w-px flex-1 bg-border my-1 min-h-[12px]" />
                        )}
                      </div>
                      <div
                        className={cn("pb-3 flex-1 min-w-0", isLast && "pb-0")}
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 text-[10px] px-1.5 py-0",
                              config.badgeClass,
                            )}
                          >
                            {config.label}
                          </Badge>
                        </div>
                        <p
                          className="text-xs text-muted-foreground mt-1"
                          title={format(event.timestamp, "PPpp")}
                        >
                          {formatDistanceToNow(event.timestamp, {
                            addSuffix: true,
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}

              {status === "CanLoadMore" && (
                <div className="pt-3 pb-1">
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
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
