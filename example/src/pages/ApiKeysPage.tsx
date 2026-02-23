import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Plus } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { KeyTable } from "@/components/KeyTable";
import { CreateKeyDialog } from "@/components/CreateKeyDialog";
import { useAuth } from "@/context/AuthContext";
import { environments, type Environment } from "@/lib/namespace";
import { api } from "../../convex/_generated/api";

export function ApiKeysPage() {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const [activeTab, setActiveTab] = useState<Environment>("production");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRevoking, setBulkRevoking] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkInfo, setBulkInfo] = useState<string | null>(null);
  const revokeAllKeys = useMutation(api.keys.revokeAllKeys);
  const counts = useQuery(api.keys.keyCounts, { workspace });
  const hookSummary = useQuery(api.dashboard.invalidateHookSummary);
  const prodActive = counts?.productionActive;
  const testActive = counts?.testingActive;

  async function handleBulkRevoke() {
    setBulkRevoking(true);
    setBulkError(null);
    try {
      const result = await revokeAllKeys({
        workspace,
        environment: activeTab,
        reason: "bulk_revoked_from_ui",
      });
      setBulkInfo(`Revoked ${result.revoked} keys in ${result.pages} page(s).`);
      setBulkOpen(false);
    } catch (error) {
      setBulkError(
        error instanceof Error ? error.message : "Failed to revoke keys.",
      );
    } finally {
      setBulkRevoking(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">API Keys</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage keys for your production and testing environments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            Revoke Active ({activeTab})
          </Button>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={13} weight="bold" />
            New Key
          </Button>
        </div>
      </div>

      {bulkInfo && <p className="text-xs text-muted-foreground">{bulkInfo}</p>}
      {hookSummary && (
        <p className="text-xs text-muted-foreground">
          Invalidation hook events: {hookSummary.total}
          {hookSummary.lastTrigger && hookSummary.lastAt
            ? ` (last ${hookSummary.lastTrigger} ${formatDistanceToNow(hookSummary.lastAt, { addSuffix: true })})`
            : ""}
        </p>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Environment)}
      >
        <TabsList className="h-8">
          <TabsTrigger value={environments[0]} className="text-xs gap-1.5 h-7">
            Production
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {prodActive ?? "-"}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value={environments[1]} className="text-xs gap-1.5 h-7">
            Testing
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
              {testActive ?? "-"}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={environments[0]} className="mt-3">
          <p className="text-[11px] text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-green-500 shrink-0 inline-block" />
            Production keys in this workspace use the{" "}
            <code className="font-mono bg-muted px-1 text-[10px]">
              sk_
            </code>{" "}
            prefix and authenticate real API traffic.
          </p>
          <div className="border">
            <KeyTable namespace={environments[0]} />
          </div>
        </TabsContent>

        <TabsContent value={environments[1]} className="mt-3">
          <p className="text-[11px] text-muted-foreground mb-2.5 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-400 shrink-0 inline-block" />
            Testing keys in this workspace also use{" "}
            <code className="font-mono bg-muted px-1 text-[10px]">
              sk_
            </code>{" "}
            prefix and are safe to use in development and CI.
          </p>
          <div className="border">
            <KeyTable namespace={environments[1]} />
          </div>
        </TabsContent>
      </Tabs>

      <CreateKeyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        namespace={activeTab}
        onCreated={() => undefined}
      />

      <AlertDialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Revoke all active {activeTab} keys?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will revoke every currently active key in the selected
              namespace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkError && <p className="text-xs text-destructive">{bulkError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8" disabled={bulkRevoking}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleBulkRevoke();
              }}
              disabled={bulkRevoking}
            >
              {bulkRevoking ? "Revoking..." : "Revoke all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
