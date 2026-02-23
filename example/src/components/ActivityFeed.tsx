import { formatDistanceToNow } from "date-fns";
import { Key, ArrowsClockwise, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type ActivityEventType = "created" | "revoked" | "rotated";

export type ActivityEvent = {
  id: string;
  keyName: string;
  type: ActivityEventType;
  timestamp: number | Date;
};

const EVENT_CONFIG: Record<
  ActivityEventType,
  { label: string; icon: typeof Key; iconClass: string; bgClass: string }
> = {
  created: {
    label: "Key created",
    icon: Key,
    iconClass: "text-green-600 dark:text-green-400",
    bgClass: "bg-green-500/10",
  },
  rotated: {
    label: "Key rotated",
    icon: ArrowsClockwise,
    iconClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10",
  },
  revoked: {
    label: "Key revoked",
    icon: X,
    iconClass: "text-red-600 dark:text-red-400",
    bgClass: "bg-red-500/10",
  },
};

type ActivityFeedProps = {
  events: ActivityEvent[];
  className?: string;
};

export function ActivityFeed({ events, className }: ActivityFeedProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No activity yet.
      </p>
    );
  }

  return (
    <ol className={cn("flex flex-col", className)}>
      {events.map((event, i) => {
        const config = EVENT_CONFIG[event.type];
        const Icon = config.icon;
        const isLast = i === events.length - 1;

        return (
          <li key={event.id} className="flex gap-3">
            {/* Timeline line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full",
                  config.bgClass,
                  config.iconClass,
                )}
              >
                <Icon size={12} weight="bold" />
              </div>
              {!isLast && (
                <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[16px]" />
              )}
            </div>

            {/* Content */}
            <div className={cn("pb-4 min-w-0 flex-1", isLast && "pb-0")}>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium truncate">
                  {event.keyName}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {config.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(event.timestamp), {
                  addSuffix: true,
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
