import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import type { Environment } from "@/lib/namespace";
import type { MockApiKey } from "@/mock/data";
import { api } from "../../convex/_generated/api";

type RenameKeyDialogProps = {
  apiKey: MockApiKey | null;
  namespace: Environment;
  onOpenChange: (open: boolean) => void;
};

export function RenameKeyDialog({
  apiKey,
  namespace,
  onOpenChange,
}: RenameKeyDialogProps) {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const updateKey = useMutation(api.keys.updateKey);
  const [value, setValue] = useState(apiKey?.name ?? "");
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync initial value when apiKey changes
  if (apiKey && value === "" && apiKey.name !== "") {
    setValue(apiKey.name);
  }

  async function handleConfirm() {
    if (!apiKey || !value.trim()) return;
    setRenaming(true);
    setError(null);
    try {
      const result = await updateKey({
        workspace,
        environment: namespace,
        keyId: apiKey.id,
        name: value.trim(),
      });
      if (!result.ok) {
        setError("Key not found.");
        return;
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename key.");
    } finally {
      setRenaming(false);
    }
  }

  function handleClose() {
    if (!renaming) {
      onOpenChange(false);
      setValue("");
      setError(null);
    }
  }

  return (
    <Dialog
      open={!!apiKey}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Rename key</DialogTitle>
          <DialogDescription className="text-xs">
            Update the display name for this key.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleConfirm();
              if (e.key === "Escape") handleClose();
            }}
            className="font-mono text-sm"
            placeholder="Key name"
            disabled={renaming}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-8"
              onClick={handleClose}
              disabled={renaming}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="text-xs h-8"
              onClick={() => void handleConfirm()}
              disabled={renaming || !value.trim()}
            >
              {renaming ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
