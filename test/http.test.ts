import { describe, expect, it } from "vitest";
import { connect, harness, modernRequest } from "./harness.ts";

// The Worker's other routes, CORS, the rate limit and what telemetry records.

describe("routes", () => {
  it("sends a browser at the root to the documentation", async () => {
    const response = await harness().fetch("https://mcp.invokary.com/");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://invokary.com/open-source");
  });

  it("serves the ChatGPT domain token only once one is set", async () => {
    const url = "https://mcp.invokary.com/.well-known/openai-apps-challenge";
    expect((await harness().fetch(url)).status).toBe(404);
    const response = await harness({ OPENAI_APPS_CHALLENGE: " token-from-openai \n" }).fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("token-from-openai");
  });

  it("answers anything else with 404", async () => {
    expect((await harness().fetch("https://mcp.invokary.com/sse")).status).toBe(404);
  });
});

describe("CORS", () => {
  it("answers preflight and labels responses for any origin", async () => {
    const preflight = await harness().fetch("https://mcp.invokary.com/mcp", { method: "OPTIONS", headers: { Origin: "https://example.com" } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Mcp-Method");
    const response = await harness().fetch(modernRequest("server/discover"));
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("rate limit", () => {
  it("answers 429 with a JSON-RPC error once a client is over the limit, keyed by IP but never recording it", async () => {
    const keys: string[] = [];
    const h = harness({ RATE_LIMITER: { limit: async ({ key }) => (keys.push(key), { success: false }) } });
    const response = await h.fetch(modernRequest("tools/list"));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toMatchObject({ error: { code: -32000 } });
    expect(keys).toEqual(["203.0.113.7"]);
    await h.settle();
    expect(h.events.at(-1)?.blobs?.at(-1)).toBe("rate_limited");
    expect(JSON.stringify(h.events)).not.toContain("203.0.113.7");
  });
});

describe("telemetry", () => {
  it("records method, tool, declared client, protocol and outcome, and never arguments, IPs or user agents", async () => {
    const h = harness();
    const response = await h.fetch(modernRequest("tools/call", { name: "search_requirements", arguments: { query: "zebra quokka 4711" } }, "search_requirements"));
    expect(response.status).toBe(200);
    await h.settle();
    expect(h.events).toEqual([
      { indexes: ["tools/call"], blobs: ["tools/call", "search_requirements", "raw-client", "0.0.1", "2026-07-28", "modern", "ok"], doubles: [expect.any(Number)] },
    ]);
    const recorded = JSON.stringify(h.events);
    for (const secret of ["zebra", "4711", "203.0.113.7", "raw-agent"]) expect(recorded).not.toContain(secret);
  });

  it("records 2025-era clients by the name they give at initialize, later calls as unknown, and tool errors", async () => {
    const h = harness();
    const client = await connect(h, "legacy", "legacy-client");
    await client.callTool({ name: "get_requirement", arguments: { id: "nope.nothing" } });
    await h.settle();
    const rows = h.events.map((event) => event.blobs);
    expect(rows).toContainEqual(["initialize", "", "legacy-client", "1.2.3", expect.any(String), "legacy", "ok"]);
    expect(rows).toContainEqual(["tools/call", "get_requirement", "unknown", "", expect.any(String), "legacy", "tool_error"]);
  });

  it("files calls to tools it doesn't have under other", async () => {
    const h = harness();
    await h.fetch(modernRequest("tools/call", { name: "drop_tables", arguments: {} }, "drop_tables"));
    await h.settle();
    expect(h.events[0]?.blobs?.slice(0, 2)).toEqual(["tools/call", "other"]);
  });
});
