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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { KeyTokenReveal } from "@/components/KeyTokenReveal";
import { useAuth } from "@/context/AuthContext";
import type { Environment } from "@/lib/namespace";
import type { MockApiKey } from "@/mock/data";
import { api } from "../../convex/_generated/api";

type RotateKeyDialogProps = {
  apiKey: MockApiKey | null;
  namespace: Environment;
  onOpenChange: (open: boolean) => void;
};

export function RotateKeyDialog({
  apiKey,
  namespace,
  onOpenChange,
}: RotateKeyDialogProps) {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const rotateKey = useMutation(api.keys.rotateKey);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotatedToken, setRotatedToken] = useState<{
    token: string;
    keyName: string;
  } | null>(null);

  async function handleConfirm() {
    if (!apiKey) return;
    setRotating(true);
    setError(null);
    try {
      const result = await rotateKey({
        workspace,
        environment: namespace,
        keyId: apiKey.id,
        reason: "rotated_from_ui",
      });
      if (!result.ok) {
        setError(
          result.reason === "revoked"
            ? "This key is already revoked."
            : result.reason === "expired" || result.reason === "idle_timeout"
              ? "This key is no longer active and cannot be rotated."
              : "Key not found.",
        );
        return;
      }
      onOpenChange(false);
      setRotatedToken({ token: result.token, keyName: apiKey.name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rotate key.");
    } finally {
      setRotating(false);
    }
  }

  return (
    <>
      <AlertDialog
        open={!!apiKey}
        onOpenChange={(open) => {
          if (!open && !rotating) {
            onOpenChange(false);
            setError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              Rotate "{apiKey?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              A new key will be generated and the old key will be revoked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs h-8" disabled={rotating}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="text-xs h-8"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirm();
              }}
              disabled={rotating}
            >
              {rotating ? "Rotating..." : "Rotate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={rotatedToken !== null}
        onOpenChange={(open) => {
          if (!open) setRotatedToken(null);
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
