import { writeFileSync } from "node:fs";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import worker from "../src/index.ts";

// Writes tools.json: the server's tools/list answer, for documentation and for reviewers who want the
// tool definitions without connecting. CI fails when it is out of date (test/tools-json.test.ts).
//
//   npm run tools:json

export const TOOLS_JSON = new URL("../tools.json", import.meta.url);

export async function listedTools(): Promise<unknown[]> {
  const ctx = { waitUntil: () => undefined };
  const client = new Client({ name: "tools-json", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://mcp.invokary.com/mcp"), { fetch: (url, init) => worker.fetch(new Request(url, init), {}, ctx) }));
  return (await client.listTools()).tools;
}

export async function toolsJson(): Promise<string> {
  return `${JSON.stringify({ endpoint: "https://mcp.invokary.com/mcp", tools: await listedTools() }, null, 2)}\n`;
}

if (import.meta.main) writeFileSync(TOOLS_JSON, await toolsJson());
