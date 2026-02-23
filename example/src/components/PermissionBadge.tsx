import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Permission } from "@/mock/types";

const CONFIG: Record<Permission, { label: string; className: string }> = {
  "events:write": {
    label: "events:write",
    className:
      "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/10",
  },
  "reports:read": {
    label: "reports:read",
    className:
      "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20 hover:bg-green-500/10",
  },
  admin: {
    label: "admin",
    className:
      "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 hover:bg-orange-500/10",
  },
};

export function PermissionBadge({
  permission,
  className,
}: {
  permission: Permission;
  className?: string;
}) {
  const config = CONFIG[permission];
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-mono px-1.5 py-0", config.className, className)}
    >
      {config.label}
    </Badge>
  );
}
