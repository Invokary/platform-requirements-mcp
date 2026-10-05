import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import worker from "../src/index.ts";
import type { Env } from "../src/telemetry.ts";

// Drives the Worker in-process: requests go straight to its fetch handler, with stand-ins for the
// Analytics Engine and rate-limit bindings.

export const ENDPOINT = new URL("https://mcp.invokary.com/mcp");
export const MODERN = "2026-07-28";

export interface DataPoint {
  blobs?: string[];
  doubles?: number[];
  indexes?: string[];
}

export interface Harness {
  env: Env;
  events: DataPoint[];
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  /** Waits for the telemetry written after responses went out. */
  settle: () => Promise<void>;
}

export function harness(overrides: Partial<Env> = {}): Harness {
  const events: DataPoint[] = [];
  const pending: Promise<unknown>[] = [];
  const env: Env = { EVENTS: { writeDataPoint: (point) => void events.push(point) }, ...overrides };
  const ctx = { waitUntil: (promise: Promise<unknown>) => void pending.push(promise) };
  return {
    env,
    events,
    fetch: (input, init) => worker.fetch(input instanceof Request ? input : new Request(input, init), env, ctx),
    settle: async () => {
      await Promise.all(pending);
    },
  };
}

/** A client on the 2026-07-28 protocol (pinned) or on the 2025 handshake (`initialize`). */
export async function connect(h: Harness, era: "modern" | "legacy", name = "test-client"): Promise<Client> {
  const client = new Client({ name, version: "1.2.3" }, era === "modern" ? { versionNegotiation: { mode: { pin: MODERN } } } : {});
  await client.connect(new StreamableHTTPClientTransport(ENDPOINT, { fetch: (url, init) => h.fetch(url, init) }));
  return client;
}

/** A raw 2026-07-28 JSON-RPC request, with the envelope and headers the protocol requires. */
export function modernRequest(method: string, params: Record<string, unknown> = {}, name?: string): Request {
  const envelope = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientCapabilities": {}, "io.modelcontextprotocol/clientInfo": { name: "raw-client", version: "0.0.1" } };
  return new Request(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MODERN,
      "Mcp-Method": method,
      ...(name ? { "Mcp-Name": name } : {}),
      "CF-Connecting-IP": "203.0.113.7",
      "User-Agent": "raw-agent/9.9",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: envelope } }),
  });
}
