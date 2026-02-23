import { Key, ChartLine, Lightning, Tag } from "@phosphor-icons/react";
import { useQuery } from "convex/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsCard } from "@/components/StatsCard";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useAuth } from "@/context/AuthContext";
import { api } from "../../convex/_generated/api";

function OverviewLoadingState() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index} className="gap-2">
            <CardHeader className="pb-0">
              <Skeleton className="h-3 w-24" />
            </CardHeader>
            <CardContent className="pt-0">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Events - Last 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[200px] w-full" />
            <div className="mt-3 flex items-center gap-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <Skeleton className="size-6 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { username } = useAuth();
  const data = useQuery(api.dashboard.dashboardData, {
    workspace: username ?? "anonymous",
  });
  if (data === undefined) {
    return <OverviewLoadingState />;
  }

  const chartData = data?.chart ?? [];
  const recentAudit =
    data?.recentAudit.map((event: (typeof data.recentAudit)[number]) => ({
      id: event.eventId,
      keyName: event.keyName,
      type: event.type,
      timestamp: event.createdAt,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatsCard
          title="Active Keys"
          value={data.activeKeys}
          description={`${data.totalKeys} total (incl. expired/revoked)`}
          icon={<Key size={14} />}
        />
        <StatsCard
          title="Prod Events Today"
          value={data.productionEventsToday}
          description="production namespace"
          icon={<Lightning size={14} />}
        />
        <StatsCard
          title="Test Events Today"
          value={data.testingEventsToday}
          description="testing namespace"
          icon={<ChartLine size={14} />}
        />
        <StatsCard
          title="Event Types"
          value={data.uniqueEventTypes}
          description="unique event names tracked"
          icon={<Tag size={14} />}
        />
      </div>

      {/* Chart + Activity */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* 7-day area chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Events — Last 7 days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradProd" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-primary)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                  <linearGradient id="gradTest" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="var(--color-muted-foreground)"
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="95%"
                      stopColor="var(--color-muted-foreground)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="var(--color-border)"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                  }}
                  labelStyle={{ color: "var(--color-foreground)" }}
                />
                <Area
                  type="monotone"
                  dataKey="production"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  fill="url(#gradProd)"
                  name="Production"
                />
                <Area
                  type="monotone"
                  dataKey="testing"
                  stroke="var(--color-muted-foreground)"
                  strokeWidth={1.5}
                  fill="url(#gradTest)"
                  strokeDasharray="4 2"
                  name="Testing"
                />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-5 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="size-2 bg-primary" />
                <span className="text-[11px] text-muted-foreground">
                  Production
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-2 bg-muted-foreground/50" />
                <span className="text-[11px] text-muted-foreground">
                  Testing
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed events={recentAudit} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
