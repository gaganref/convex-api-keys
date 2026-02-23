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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { KeyTokenReveal } from "@/components/KeyTokenReveal";
import { useAuth } from "@/context/AuthContext";
import type { Environment } from "@/lib/namespace";
import type { Permission } from "@/mock/data";
import { api } from "../../convex/_generated/api";

const PERMISSIONS: { id: Permission; label: string; description: string }[] = [
  {
    id: "events:write",
    label: "events:write",
    description: "Send tracking events via POST /track",
  },
  {
    id: "reports:read",
    label: "reports:read",
    description: "Read events and stats via GET /events, /stats",
  },
  {
    id: "admin",
    label: "admin",
    description: "Full access including key management",
  },
];

const EXPIRY_OPTIONS = [
  { value: "never", label: "Never" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

type CreateKeyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: Environment;
  onCreated: () => void;
};

export function CreateKeyDialog({
  open,
  onOpenChange,
  namespace,
  onCreated,
}: CreateKeyDialogProps) {
  const { username } = useAuth();
  const workspace = username ?? "anonymous";
  const createKey = useMutation(api.example.createKey);
  const [step, setStep] = useState<"form" | "reveal">("form");
  const [name, setName] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([
    "events:write",
  ]);
  const [expiry, setExpiry] = useState("never");
  const [idleEnabled, setIdleEnabled] = useState(false);
  const [idleMs, setIdleMs] = useState("3600000");
  const [generatedToken, setGeneratedToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; permissions?: string }>(
    {},
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  function togglePermission(p: Permission) {
    setPermissions((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
    setErrors((e) => ({ ...e, permissions: undefined }));
  }

  async function handleSubmit() {
    const newErrors: typeof errors = {};
    if (!name.trim()) newErrors.name = "Name is required.";
    if (permissions.length === 0)
      newErrors.permissions = "Select at least one permission.";
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (
      idleEnabled &&
      (!Number.isFinite(Number(idleMs)) || Number(idleMs) <= 0)
    ) {
      setSubmitError("Idle timeout must be a positive number of milliseconds.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await createKey({
        workspace,
        environment: namespace,
        name: name.trim(),
        permissions,
        ttlDays: expiry === "never" ? null : Number(expiry),
        idleTimeoutMs: idleEnabled ? Number(idleMs) : null,
      });
      setGeneratedToken(result.token);
      setStep("reveal");
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Failed to create key",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    onCreated();
    onOpenChange(false);
    // Reset form for next open
    setTimeout(() => {
      setStep("form");
      setName("");
      setPermissions(["events:write"]);
      setExpiry("never");
      setIdleEnabled(false);
      setIdleMs("3600000");
      setErrors({});
      setSubmitError(null);
    }, 300);
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setTimeout(() => {
        setStep("form");
        setName("");
        setPermissions(["events:write"]);
        setExpiry("never");
        setIdleEnabled(false);
        setErrors({});
      }, 300);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {step === "form" ? "Create API Key" : "Key Created"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {step === "form"
              ? `New key for the ${namespace} namespace.`
              : "Copy and save your key before continuing."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="flex flex-col gap-4 mt-2">
            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="key-name" className="text-xs">
                Name
              </Label>
              <Input
                id="key-name"
                placeholder="e.g. Backend Server"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((err) => ({ ...err, name: undefined }));
                }}
                className="font-mono text-sm"
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Permissions */}
            <div className="flex flex-col gap-2">
              <Label className="text-xs">Permissions</Label>
              <div className="flex flex-col gap-2 rounded-md border p-3">
                {PERMISSIONS.map((perm) => (
                  <div key={perm.id} className="flex items-start gap-2.5">
                    <Checkbox
                      id={`perm-${perm.id}`}
                      checked={permissions.includes(perm.id)}
                      onCheckedChange={() => togglePermission(perm.id)}
                      className="mt-0.5"
                    />
                    <div className="flex flex-col gap-0.5">
                      <label
                        htmlFor={`perm-${perm.id}`}
                        className="text-xs font-mono font-medium cursor-pointer"
                      >
                        {perm.label}
                      </label>
                      <p className="text-[11px] text-muted-foreground">
                        {perm.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {errors.permissions && (
                <p className="text-xs text-destructive">{errors.permissions}</p>
              )}
            </div>

            {/* Expiry */}
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Expiry</Label>
              <Select
                value={expiry}
                onValueChange={(v) => {
                  if (v !== null) setExpiry(v);
                }}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRY_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="text-xs"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Idle timeout */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="idle-toggle" className="text-xs">
                  Idle timeout
                </Label>
                <Switch
                  id="idle-toggle"
                  checked={idleEnabled}
                  onCheckedChange={setIdleEnabled}
                />
              </div>
              {idleEnabled && (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={idleMs}
                    onChange={(e) => setIdleMs(e.target.value)}
                    className="font-mono text-xs"
                    min={60000}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">
                    ms
                  </span>
                </div>
              )}
            </div>

            {submitError && (
              <p className="text-xs text-destructive">{submitError}</p>
            )}

            <Button
              onClick={handleSubmit}
              className="w-full mt-1"
              disabled={submitting}
            >
              {submitting ? "Creating key..." : "Create key"}
            </Button>
          </div>
        ) : (
          <div className="mt-2">
            <KeyTokenReveal
              token={generatedToken}
              keyName={name}
              onDone={handleDone}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
