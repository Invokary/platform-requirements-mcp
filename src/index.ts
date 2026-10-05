import { createMcpHandler } from "@modelcontextprotocol/server";
import raw from "../data/platform-requirements.json" with { type: "json" };
import { parseDataset } from "./dataset.ts";
import { createServer } from "./server.ts";
import { describeRequest, outcomeOf, record, type Env, type ExecutionContext } from "./telemetry.ts";

// The Worker at https://mcp.invokary.com:
// - /mcp: the MCP endpoint (Streamable HTTP, stateless, no sign-in). It serves the 2026-07-28 protocol
//   and, for clients that still open with `initialize`, the 2025 revisions;
// - /.well-known/openai-apps-challenge: the ChatGPT domain verification token, when one is set;
// - /: a redirect to the documentation on invokary.com.

/** Validated once per isolate. A bad snapshot fails at deploy, before any request is served. */
export const dataset = parseDataset(raw);

export const TOOL_NAMES = new Set(["list_platforms", "get_platform_requirements", "get_requirement", "compare_platforms", "search_requirements", "list_platform_changes"]);

const DEFAULT_HOME = "https://invokary.com/open-source";

// The tools send nothing before their result, so 2026-07-28 responses are single JSON bodies. Clients
// on the 2025 revisions get the SDK's stateless fallback, which answers as a one-event SSE stream.
const handler = createMcpHandler(() => createServer(dataset));

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, Mcp-Session-Id, Last-Event-Id",
  "Access-Control-Expose-Headers": "Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const out = new Response(response.body, response);
  for (const [name, value] of Object.entries(CORS)) out.headers.set(name, value);
  return out;
}

const text = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", ...headers } });

function rateLimited(): Response {
  const body = JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: "Too many requests. Try again in a minute." } });
  return new Response(body, { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "60" } });
}

async function serveMcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const started = Date.now();
  const facts = await describeRequest(request, TOOL_NAMES);
  // Cloudflare counts by IP address in memory to apply the limit; the server never stores it.
  const allowed = env.RATE_LIMITER ? (await env.RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") ?? "unknown" })).success : true;
  const response = allowed ? await handler.fetch(request) : rateLimited();
  const latency = Date.now() - started;
  // The outcome is read from a copy after the response has gone out. A subscriptions/listen stream stays
  // open, so its outcome is only that it opened.
  if (facts.method === "subscriptions/listen") record(env, facts, response.status === 200 ? "stream" : `http_${response.status}`, latency);
  else {
    const copy = response.clone();
    ctx.waitUntil(outcomeOf(copy).then((outcome) => record(env, facts, outcome, latency)));
  }
  return withCors(response);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const read = request.method === "GET" || request.method === "HEAD";
    if (url.pathname === "/mcp") return serveMcp(request, env, ctx);
    if (url.pathname === "/.well-known/openai-apps-challenge" && read) return env.OPENAI_APPS_CHALLENGE ? text(env.OPENAI_APPS_CHALLENGE.trim()) : text("Not found", 404);
    if (url.pathname === "/" && read) return Response.redirect(env.HOME_URL ?? DEFAULT_HOME, 302);
    return text("Not found. The MCP endpoint is /mcp.", 404);
  },
};
