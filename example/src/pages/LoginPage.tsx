import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

export function LoginPage() {
  const { login } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter a username to continue.");
      return;
    }
    if (trimmed.length < 2) {
      setError("Username must be at least 2 characters.");
      return;
    }
    login(trimmed);
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden">
      {/* Radial glow behind the form */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 50%, oklch(0.5 0.2 260 / 8%) 0%, transparent 70%)",
        }}
      />

      <div className="w-full max-w-sm flex flex-col items-center gap-7 relative">
        {/* Logo mark */}
        <div
          className="flex flex-col items-center gap-3"
          style={{ animation: "fadeUp 0.5s ease both" }}
        >
          <div
            className="flex size-16 items-center justify-center bg-primary text-primary-foreground text-3xl select-none"
            style={{
              boxShadow:
                "0 0 0 1px oklch(0.5 0.2 260 / 20%), 0 0 40px oklch(0.5 0.2 260 / 30%), 0 8px 24px oklch(0.5 0.2 260 / 18%)",
            }}
          >
            ⬡
          </div>
        </div>

        <div
          className="text-center flex flex-col gap-1.5"
          style={{ animation: "fadeUp 0.5s ease 0.09s both" }}
        >
          <h1 className="text-2xl font-bold tracking-[0.2em] uppercase">
            Beacon
          </h1>
          <p className="text-xs text-muted-foreground tracking-wide">
            Analytics infrastructure for developers
          </p>
        </div>

        {/* Login card */}
        <div
          className="w-full border bg-card p-6 flex flex-col gap-4"
          style={{
            animation: "fadeUp 0.5s ease 0.18s both",
            boxShadow:
              "0 1px 3px oklch(0 0 0 / 8%), 0 0 0 1px var(--color-border)",
          }}
        >
          <div>
            <p className="text-sm font-medium">Enter your workspace</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Choose a username to scope your API keys and events.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              placeholder="e.g. jane-doe"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="font-mono"
            />
            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full">
              Enter workspace
            </Button>
          </form>
        </div>

        <p
          className="text-xs text-muted-foreground text-center"
          style={{ animation: "fadeUp 0.5s ease 0.27s both" }}
        >
          Your keys are saved to this username.
          <br />
          No account required — this is a local demo.
        </p>
      </div>
    </div>
  );
}
