// Usage events in Workers Analytics Engine: which method and tool, which client (the name and version
// it declares), which protocol revision, the outcome and the latency. Never the IP address, the user
// agent or the tool arguments. A client that doesn't declare itself is recorded as "unknown": on the
// 2025 protocol only the initialize request names the client, and stateless serving can't carry it to
// later calls.

export interface AnalyticsEngineDataset {
  writeDataPoint(point: { blobs?: string[]; doubles?: number[]; indexes?: string[] }): void;
}

export interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  HOME_URL?: string;
  OPENAI_APPS_CHALLENGE?: string;
  EVENTS?: AnalyticsEngineDataset;
  RATE_LIMITER?: RateLimit;
}

export interface RequestFacts {
  method: string;
  tool: string;
  client: string;
  clientVersion: string;
  protocol: string;
  era: "modern" | "legacy";
}

const CLIENT_INFO = "io.modelcontextprotocol/clientInfo";
const PROTOCOL_VERSION = "io.modelcontextprotocol/protocolVersion";
/** Bodies above this aren't read for telemetry (the server's own limit is larger). */
const MAX_TELEMETRY_BODY = 65_536;

/** A declared label, reduced to plain characters and a fixed length. */
export function label(value: unknown, max: number, fallback = "unknown"): string {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[^\w .@/+:-]/g, "").trim().slice(0, max);
  return clean.length > 0 ? clean : fallback;
}

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json | undefined => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : undefined);

/** What a request is, read from its headers and a copy of its body. Tool names outside `tools` are "other". */
export async function describeRequest(request: Request, tools: ReadonlySet<string>): Promise<RequestFacts> {
  const facts: RequestFacts = { method: `http-${request.method.toLowerCase()}`, tool: "", client: "unknown", clientVersion: "", protocol: label(request.headers.get("mcp-protocol-version"), 20, ""), era: "legacy" };
  if (request.method !== "POST") return facts;
  const size = Number(request.headers.get("content-length") ?? "0");
  let body: unknown;
  if (size <= MAX_TELEMETRY_BODY) {
    try {
      body = JSON.parse(await request.clone().text());
    } catch {
      body = undefined;
    }
  }
  if (Array.isArray(body)) return { ...facts, method: "batch" };
  const message = asObject(body);
  const params = asObject(message?.params);
  const meta = asObject(params?._meta);
  const method = label(message?.method ?? request.headers.get("mcp-method"), 40);
  const declared = asObject(meta?.[CLIENT_INFO]) ?? (method === "initialize" ? asObject(params?.clientInfo) : undefined);
  const modern = typeof meta?.[PROTOCOL_VERSION] === "string";
  const tool = method === "tools/call" ? label(params?.name ?? request.headers.get("mcp-name"), 64) : "";
  return {
    method,
    tool: tool === "" || tools.has(tool) ? tool : "other",
    client: label(declared?.name, 64),
    clientVersion: label(declared?.version, 32, ""),
    protocol: label(modern ? meta?.[PROTOCOL_VERSION] : method === "initialize" ? params?.protocolVersion : facts.protocol, 20, ""),
    era: modern ? "modern" : "legacy",
  };
}

/**
 * The JSON-RPC message a response carries: its JSON body, or the last `data:` event of a finite SSE
 * stream. It reads the body, so pass a clone, and never a long-lived stream (subscriptions/listen).
 */
async function responseMessage(response: Response): Promise<Json | undefined> {
  const type = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (type.startsWith("text/event-stream")) {
    const data = body.split("\n").filter((line) => line.startsWith("data:")).at(-1);
    return data === undefined ? undefined : asObject(JSON.parse(data.slice(5)));
  }
  return type.includes("json") ? asObject(JSON.parse(body)) : undefined;
}

/** ok, tool_error, rpc_error:<code>, accepted, rate_limited or http_<status>. Reads the body: pass a clone. */
export async function outcomeOf(response: Response): Promise<string> {
  if (response.status === 429) return "rate_limited";
  if (response.status === 202) return "accepted";
  if (response.status >= 400) return `http_${response.status}`;
  try {
    const message = await responseMessage(response);
    const error = asObject(message?.error);
    if (error) return `rpc_error:${typeof error.code === "number" ? error.code : "unknown"}`;
    return asObject(message?.result)?.isError === true ? "tool_error" : "ok";
  } catch {
    return "ok";
  }
}

export function record(env: Env, facts: RequestFacts, outcome: string, latencyMs: number): void {
  env.EVENTS?.writeDataPoint({
    indexes: [facts.method],
    blobs: [facts.method, facts.tool, facts.client, facts.clientVersion, facts.protocol, facts.era, outcome],
    doubles: [latencyMs],
  });
}
