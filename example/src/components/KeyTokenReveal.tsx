import { useState } from "react";
import { Copy, Check, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type KeyTokenRevealProps = {
  token: string;
  keyName: string;
  onDone: () => void;
};

export function KeyTokenReveal({ token, keyName, onDone }: KeyTokenRevealProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Warning banner */}
      <div className="flex items-start gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5">
        <Warning
          size={14}
          weight="fill"
          className="text-yellow-500 mt-0.5 shrink-0"
        />
        <p className="text-xs text-yellow-600 dark:text-yellow-400 leading-relaxed">
          <strong>Save this key now.</strong> For security reasons, we don't
          store the raw key and you won't be able to see it again.
        </p>
      </div>

      {/* Terminal-style token display */}
      <div
        className="rounded-md border flex flex-col gap-3 p-4"
        style={{
          background: "oklch(0.1 0.015 260)",
          borderColor: "oklch(from var(--color-beacon-amber) l c h / 0.25)",
          boxShadow:
            "0 0 0 1px oklch(from var(--color-beacon-amber) l c h / 0.08), inset 0 1px 0 oklch(1 0 0 / 3%)",
        }}
      >
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-mono"
            style={{ color: "oklch(0.55 0.05 260)" }}
          >
            {keyName}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider"
            style={{
              color: "var(--color-beacon-amber)",
              border: "1px solid oklch(from var(--color-beacon-amber) l c h / 0.3)",
              background: "oklch(from var(--color-beacon-amber) l c h / 0.1)",
            }}
          >
            NEW KEY
          </span>
        </div>

        {/* Token text with blinking cursor */}
        <div
          className="font-mono text-sm break-all rounded px-3 py-3 select-all cursor-text"
          style={{
            color: "var(--color-beacon-amber)",
            background: "oklch(from var(--color-beacon-amber) l c h / 0.07)",
            border: "1px solid oklch(from var(--color-beacon-amber) l c h / 0.2)",
            textShadow: "0 0 18px oklch(from var(--color-beacon-amber) l c h / 0.5)",
          }}
        >
          {token}
          <span
            className="inline-block ml-0.5 w-[2px] h-[13px] align-middle rounded-sm"
            style={{
              background: "var(--color-beacon-amber)",
              animation: "blink 1s step-end infinite",
            }}
          />
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2 transition-all duration-200"
          style={
            copied
              ? {
                  borderColor: "oklch(0.6 0.15 142 / 50%)",
                  color: "oklch(0.6 0.15 142)",
                  background: "oklch(0.6 0.15 142 / 0.08)",
                }
              : {
                  borderColor: "oklch(from var(--color-beacon-amber) l c h / 0.3)",
                  color: "var(--color-beacon-amber)",
                  background: "oklch(from var(--color-beacon-amber) l c h / 0.05)",
                }
          }
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check size={14} />
              <span>Copied to clipboard!</span>
            </>
          ) : (
            <>
              <Copy size={14} />
              <span>Copy to clipboard</span>
            </>
          )}
        </Button>
      </div>

      <Button onClick={onDone} className="w-full">
        I've saved my key — Done
      </Button>
    </div>
  );
}
