import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { formatDistanceToNow, format } from "date-fns";
import { Lightning, ChartBar, Tag } from "@phosphor-icons/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/context/AuthContext";
import { environments, type Environment } from "@/lib/namespace";
import { api } from "../../convex/_generated/api";

type TrackedEvent = {
  id: string;
  event: string;
  userId: string;
  keyId: string;
  keyName: string;
  props: Record<string, unknown> | undefined;
  receivedAt: number;
};

function EventsLoadingState() {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="flex items-center gap-6 px-4 py-3 border-b bg-muted/20">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="p-3 space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="grid grid-cols-4 gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsBar({ events }: { events: Array<TrackedEvent> }) {
  const cutoff = useMemo(() => Date.now() - 86400000, []);
  const today = events.filter((e) => e.receivedAt > cutoff);
  const uniqueTypes = new Set(events.map((e) => e.event)).size;

  return (
    <div className="flex items-center gap-6 px-4 py-3 border-b bg-muted/20">
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <ChartBar size={12} />
        </div>
        <div className="flex flex-col gap-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
            Total
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {events.length}
          </span>
        </div>
      </div>
      <div className="w-px h-8 bg-border" />
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Lightning size={12} />
        </div>
        <div className="flex flex-col gap-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
            Today
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {today.length}
          </span>
        </div>
      </div>
      <div className="w-px h-8 bg-border" />
      <div className="flex items-center gap-2">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
          <Tag size={12} />
        </div>
        <div className="flex flex-col gap-0">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground leading-none">
            Event Types
          </span>
          <span className="text-sm font-semibold tabular-nums">
            {uniqueTypes}
          </span>
        </div>
      </div>
    </div>
  );
}

function EventsTable({ events }: { events: Array<TrackedEvent> }) {
  const ordered = [...events].sort((a, b) => b.receivedAt - a.receivedAt);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="text-xs">Event</TableHead>
          <TableHead className="text-xs">Properties</TableHead>
          <TableHead className="text-xs">Key Used</TableHead>
          <TableHead className="text-xs">Time</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((event) => {
          const propsStr = JSON.stringify(event.props ?? {});
          const truncated =
            propsStr.length > 40 ? propsStr.slice(0, 40) + "…" : propsStr;

          return (
            <TableRow key={event.id} className="text-xs">
              <TableCell>
                <code className="font-mono font-medium text-xs bg-muted px-1.5 py-0.5 rounded">
                  {event.event}
                </code>
              </TableCell>
              <TableCell>
                <Popover>
                  <PopoverTrigger className="font-mono text-[11px] text-muted-foreground hover:text-foreground max-w-[200px] truncate text-left inline-block cursor-pointer transition-colors">
                    {truncated}
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                      {JSON.stringify(event.props ?? {}, null, 2)}
                    </pre>
                  </PopoverContent>
                </Popover>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono px-1.5 py-0"
                >
                  {event.keyName}
                </Badge>
              </TableCell>
              <TableCell
                className="text-muted-foreground"
                title={format(event.receivedAt, "PPpp")}
              >
                {formatDistanceToNow(event.receivedAt, { addSuffix: true })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function EventsPage() {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const [activeTab, setActiveTab] = useState<Environment>("production");
  const production = useQuery(api.events.trackedEventsByNamespace, {
    workspace,
    environment: environments[0],
    limit: 100,
  });
  const testing = useQuery(api.events.trackedEventsByNamespace, {
    workspace,
    environment: environments[1],
    limit: 100,
  });
  const eventsByNamespace: Record<
    Environment,
    Array<TrackedEvent> | undefined
  > = {
    production: production as Array<TrackedEvent> | undefined,
    testing: testing as Array<TrackedEvent> | undefined,
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Events</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tracking events received by your Beacon endpoints.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Environment)}
      >
        <TabsList className="h-8">
          <TabsTrigger value={environments[0]} className="text-xs h-7">
            Production
          </TabsTrigger>
          <TabsTrigger value={environments[1]} className="text-xs h-7">
            Testing
          </TabsTrigger>
        </TabsList>

        {environments.map((ns) => (
          <TabsContent key={ns} value={ns} className="mt-3">
            {eventsByNamespace[ns] === undefined ? (
              <EventsLoadingState />
            ) : (
              <div className="rounded-md border overflow-hidden">
                <StatsBar events={eventsByNamespace[ns]} />
                <EventsTable events={eventsByNamespace[ns]} />
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
