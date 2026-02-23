import { useState } from "react";
import { useMutation } from "convex/react";
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
import { useAuth } from "@/context/AuthContext";
import type { Environment } from "@/lib/namespace";
import type { MockApiKey } from "@/mock/data";
import { api } from "../../convex/_generated/api";

type RevokeKeyDialogProps = {
  apiKey: MockApiKey | null;
  namespace: Environment;
  onOpenChange: (open: boolean) => void;
};

export function RevokeKeyDialog({
  apiKey,
  namespace,
  onOpenChange,
}: RevokeKeyDialogProps) {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const revokeKey = useMutation(api.keys.revokeKey);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!apiKey) return;
    setRevoking(true);
    setError(null);
    try {
      const result = await revokeKey({
        workspace,
        environment: namespace,
        keyId: apiKey.id,
        reason: "revoked_from_ui",
      });
      if (!result.ok) {
        setError(
          result.reason === "revoked"
            ? "This key is already revoked."
            : "Key not found.",
        );
        return;
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key.");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <AlertDialog
      open={!!apiKey}
      onOpenChange={(open) => {
        if (!open && !revoking) {
          onOpenChange(false);
          setError(null);
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-sm">
            Revoke "{apiKey?.name}"?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            This key will immediately stop working. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel className="text-xs h-8" disabled={revoking}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className="text-xs h-8 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={revoking}
          >
            {revoking ? "Revoking..." : "Revoke key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
