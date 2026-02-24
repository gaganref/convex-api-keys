import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type StatsCardProps = {
  title: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  trend?: { value: number; label: string };
  progress?: number;
  className?: string;
};

export function StatsCard({
  title,
  value,
  description,
  icon,
  trend,
  progress,
  className,
}: StatsCardProps) {
  return (
    <Card className={cn("gap-2", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
        <CardTitle className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest">
          {title}
        </CardTitle>
        {icon && (
          <div className="flex size-7 items-center justify-center bg-primary/10 text-primary">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-2xl font-bold tracking-tight tabular-nums">
          {value}
        </div>
        {description && (
          <p className="text-[11px] text-muted-foreground mt-1">
            {description}
          </p>
        )}
        {progress !== undefined && (
          <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        )}
        {trend && (
          <div className="flex items-center gap-1 mt-1.5">
            <span
              className={cn(
                "text-[11px] font-medium",
                trend.value >= 0 ? "text-green-500" : "text-destructive",
              )}
            >
              {trend.value >= 0 ? "↑" : "↓"} {Math.abs(trend.value)}%
            </span>
            <span className="text-[11px] text-muted-foreground">
              {trend.label}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
