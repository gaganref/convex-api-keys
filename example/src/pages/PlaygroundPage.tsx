import { useState } from "react";
import {
  PaperPlaneTilt,
  CaretDown,
  CaretUp,
  Copy,
  Check,
} from "@phosphor-icons/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Endpoint = {
  id: string;
  method: "POST" | "GET";
  path: string;
  description: string;
  permission: string;
  defaultBody?: string;
};

const ENDPOINTS: Endpoint[] = [
  {
    id: "track",
    method: "POST",
    path: "/track",
    description: "Send a tracking event",
    permission: "events:write",
    defaultBody: JSON.stringify(
      {
        event: "page_view",
        properties: { url: "/dashboard", user_id: "usr_123" },
      },
      null,
      2,
    ),
  },
  {
    id: "events",
    method: "GET",
    path: "/events",
    description: "List recent events",
    permission: "reports:read",
  },
  {
    id: "stats",
    method: "GET",
    path: "/stats",
    description: "Aggregate event counts",
    permission: "reports:read",
  },
  {
    id: "me",
    method: "GET",
    path: "/me",
    description: "Identify the key and its permissions",
    permission: "any",
  },
];

type BodyPreset = {
  label: string;
  body: string;
};

const BODY_PRESETS: BodyPreset[] = [
  {
    label: "Page View",
    body: JSON.stringify(
      {
        event: "page_view",
        properties: { url: "/dashboard", user_id: "usr_123" },
      },
      null,
      2,
    ),
  },
  {
    label: "Purchase",
    body: JSON.stringify(
      {
        event: "purchase",
        properties: { amount: 49.99, currency: "USD", user_id: "usr_456" },
      },
      null,
      2,
    ),
  },
  {
    label: "Sign Up",
    body: JSON.stringify(
      {
        event: "sign_up",
        properties: { method: "google", plan: "pro" },
      },
      null,
      2,
    ),
  },
];

type HttpResponse = {
  status: number;
  body: unknown;
  durationMs: number;
};

const STATUS_TEXT: Record<number, string> = {
  200: "OK",
  204: "No Content",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  429: "Too Many Requests",
  500: "Internal Server Error",
};

function resolveHttpBaseUrl() {
  const raw =
    (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ??
    (import.meta.env.VITE_CONVEX_URL as string | undefined) ??
    "";
  if (!raw) {
    return "";
  }

  try {
    const url = new URL(raw);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(".convex.cloud", ".convex.site");
    }
    return url.origin;
  } catch {
    return raw;
  }
}

const CONVEX_HTTP_BASE = resolveHttpBaseUrl();

function buildRequestUrl(endpoint: Endpoint): string {
  if (!CONVEX_HTTP_BASE) {
    throw new Error(
      "Missing VITE_CONVEX_SITE_URL (or VITE_CONVEX_URL) for HTTP endpoints.",
    );
  }
  const url = new URL(endpoint.path, CONVEX_HTTP_BASE);
  if (endpoint.id === "events") {
    url.searchParams.set("limit", "25");
  }
  return url.toString();
}

function buildCurlCommand(
  endpoint: Endpoint,
  apiKey: string,
  body: string,
): string {
  if (!CONVEX_HTTP_BASE) {
    return "# Missing VITE_CONVEX_SITE_URL (or VITE_CONVEX_URL)";
  }
  const url = buildRequestUrl(endpoint);
  const parts = [
    `curl -X ${endpoint.method}`,
    `  "${url}"`,
    `  -H "x-api-key: ${apiKey || "<your-key>"}"`,
  ];
  if (endpoint.method === "POST") {
    parts.push(`  -H "Content-Type: application/json"`);
    parts.push(`  -d '${body.replace(/\n/g, " ")}'`);
  }
  return parts.join(" \\\n");
}

function MethodBadge({ method }: { method: "POST" | "GET" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono px-1.5 py-0 shrink-0",
        method === "POST"
          ? "text-blue-500 border-blue-500/30"
          : "text-green-500 border-green-500/30",
      )}
    >
      {method}
    </Badge>
  );
}

function StatusBadge({ status }: { status: number }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-sm px-2 py-0.5 tabular-nums",
        status < 300
          ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30"
          : status < 500
            ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30"
            : "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
      )}
    >
      {status}
    </Badge>
  );
}

export function PlaygroundPage() {
  const [endpointId, setEndpointId] = useState("track");
  const [apiKey, setApiKey] = useState("");
  const [body, setBody] = useState(ENDPOINTS[0].defaultBody ?? "");
  const [response, setResponse] = useState<HttpResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [curlOpen, setCurlOpen] = useState(false);
  const [curlCopied, setCurlCopied] = useState(false);

  const endpoint = ENDPOINTS.find((e) => e.id === endpointId)!;

  function handleEndpointChange(id: string) {
    setEndpointId(id);
    const ep = ENDPOINTS.find((e) => e.id === id)!;
    setBody(ep.defaultBody ?? "");
    setResponse(null);
  }

  async function handleSend() {
    setLoading(true);
    setResponse(null);
    try {
      const url = buildRequestUrl(endpoint);
      const startedAt = performance.now();

      const headers: Record<string, string> = {};
      if (apiKey.trim()) {
        headers["x-api-key"] = apiKey.trim();
      }
      if (endpoint.method === "POST") {
        headers["Content-Type"] = "application/json";
      }

      const fetchResponse = await fetch(url, {
        method: endpoint.method,
        headers,
        body: endpoint.method === "POST" ? body : undefined,
      });

      const rawBody = await fetchResponse.text();
      let payload: unknown = null;
      if (rawBody.length > 0) {
        try {
          payload = JSON.parse(rawBody);
        } catch {
          payload = rawBody;
        }
      }

      setResponse({
        status: fetchResponse.status,
        body: payload,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      setResponse({
        status: 500,
        body: {
          error: "NETWORK_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Request failed unexpectedly.",
        },
        durationMs: 0,
      });
    } finally {
      setLoading(false);
    }
  }

  const curlCommand = buildCurlCommand(endpoint, apiKey, body);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Playground</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Test your API keys against the Beacon HTTP endpoints. Paste a key
          token from the API Keys page to get started.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Request panel */}
        <div className="lg:col-span-2 flex flex-col gap-3 rounded-md border p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Request
          </p>

          {/* Endpoint selector */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Endpoint</Label>
            <Select
              value={endpointId}
              onValueChange={(v) => {
                if (v !== null) handleEndpointChange(v);
              }}
            >
              <SelectTrigger className="text-xs h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENDPOINTS.map((ep) => (
                  <SelectItem key={ep.id} value={ep.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <MethodBadge method={ep.method} />
                      <span className="font-mono">{ep.path}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {endpoint.description} — requires{" "}
              <span className="font-mono">{endpoint.permission}</span>
            </p>
          </div>

          {/* API key input */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">API Key</Label>
            <Input
              placeholder="sk_..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          {/* Body (only for POST) */}
          {endpoint.method === "POST" && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Body</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex items-center justify-center h-6 text-xs px-2 gap-1 rounded-none hover:bg-accent hover:text-accent-foreground">
                    Sample body
                    <CaretDown size={10} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="text-xs w-40">
                    {BODY_PRESETS.map((preset) => (
                      <DropdownMenuItem
                        key={preset.label}
                        className="text-xs"
                        onClick={() => setBody(preset.body)}
                      >
                        {preset.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-xs resize-none"
                rows={6}
                spellCheck={false}
              />
            </div>
          )}

          <Button
            onClick={handleSend}
            disabled={loading}
            className="w-full gap-2 mt-1"
          >
            {loading ? (
              <Spinner className="size-3.5" />
            ) : (
              <PaperPlaneTilt size={13} weight="fill" />
            )}
            {loading ? "Sending…" : "Send Request"}
          </Button>
        </div>

        {/* Response panel */}
        <div className="lg:col-span-3 flex flex-col gap-3 rounded-md border p-4 min-h-[300px]">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            Response
          </p>

          {!response && !loading && (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-xs text-muted-foreground">
                Send a request to see the response.
              </p>
            </div>
          )}

          {loading && (
            <div className="flex-1 flex items-center justify-center">
              <Spinner className="text-muted-foreground size-5" />
            </div>
          )}

          {response && (
            <div className="flex flex-col gap-3">
              {/* Status + timing */}
              <div className="flex items-center gap-2.5">
                <StatusBadge status={response.status} />
                <span className="text-xs text-muted-foreground">
                  {STATUS_TEXT[response.status] ?? "Unknown"}
                </span>
                <span className="text-xs text-muted-foreground ml-auto tabular-nums">
                  {response.durationMs}ms
                </span>
              </div>

              {/* Response body */}
              <div className="rounded-md bg-muted/40 border p-3 overflow-auto max-h-80">
                <pre className="text-[12px] font-mono whitespace-pre-wrap break-all">
                  {JSON.stringify(response.body, null, 2)}
                </pre>
              </div>

              {/* cURL equivalent */}
              <Collapsible open={curlOpen} onOpenChange={setCurlOpen}>
                <CollapsibleTrigger className="inline-flex items-center justify-center h-7 text-xs gap-1 px-2 rounded-none hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
                  cURL equivalent
                  {curlOpen ? <CaretUp size={10} /> : <CaretDown size={10} />}
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="relative rounded-md bg-muted/40 border p-3 mt-1 group">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(curlCommand);
                        setCurlCopied(true);
                        setTimeout(() => setCurlCopied(false), 1500);
                      }}
                      className="absolute top-2 right-2 p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
                      aria-label="Copy cURL command"
                    >
                      {curlCopied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                    <pre className="text-[11px] font-mono whitespace-pre-wrap break-all text-muted-foreground">
                      {curlCommand}
                    </pre>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
