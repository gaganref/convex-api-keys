import { useState } from "react";
import { Copy, Check, Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CLIPBOARD_FEEDBACK_MS = 2500;

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
    setTimeout(() => setCopied(false), CLIPBOARD_FEEDBACK_MS);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2 border border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5">
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

      <div className="token-card border flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="token-card-label text-xs font-mono">
            {keyName}
          </span>
          <span className="token-card-badge text-[10px] px-1.5 py-0.5 rounded font-mono font-bold tracking-wider">
            NEW KEY
          </span>
        </div>

        <div className="token-card-value font-mono text-sm break-all rounded px-3 py-3 select-all cursor-text">
          {token}
          <span className="token-card-cursor inline-block ml-0.5 w-[2px] h-[13px] align-middle" />
        </div>

        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-full gap-2 transition-all duration-200",
            copied ? "token-card-copy-success" : "token-card-copy",
          )}
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
