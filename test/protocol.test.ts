import { describe, expect, it } from "vitest";
import { dataset, TOOL_NAMES } from "../src/index.ts";
import { connect, harness, MODERN, modernRequest } from "./harness.ts";

// The server as clients see it, on both protocol eras, and against the listing rules the directories
// publish (tracked in the dataset itself: claude.rule-*, chatgpt.annotations).

const VALID_CALLS: Record<string, Record<string, unknown>> = {
  list_platforms: {},
  get_platform_requirements: { platform: "claude" },
  get_requirement: { id: "claude.rule-annotations" },
  compare_platforms: {},
  search_requirements: { query: "privacy policy" },
  list_platform_changes: {},
};

describe("protocol", () => {
  it("serves 2026-07-28 clients: discovery, a cacheable tool list in a fixed order, and calls", async () => {
    const client = await connect(harness(), "modern");
    expect(client.getNegotiatedProtocolVersion()).toBe(MODERN);
    expect(client.getServerVersion()).toMatchObject({ name: "platform-requirements", title: "Invokary Platform Requirements", websiteUrl: "https://invokary.com/open-source" });
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    expect(listed).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });
    const result = await client.callTool({ name: "get_requirement", arguments: { id: "chatgpt.test-cases" } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ requirement: { id: "chatgpt.test-cases", platform: "chatgpt" } });
  });

  it("serves clients that open with the 2025 initialize handshake from the same tools", async () => {
    const client = await connect(harness(), "legacy");
    expect(client.getNegotiatedProtocolVersion()).not.toBe(MODERN);
    expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([...TOOL_NAMES]);
    const result = await client.callTool({ name: "search_requirements", arguments: { query: "test cases" } });
    expect((result.structuredContent as { requirements: Array<{ id: string }> }).requirements[0]?.id).toBe("chatgpt.test-cases");
  });

  it("answers server/discover with its identity, and offers nothing to subscribe to", async () => {
    const response = await harness().fetch(modernRequest("server/discover"));
    const { result } = (await response.json()) as { result: Record<string, unknown> };
    expect(result.supportedVersions).toContain(MODERN);
    expect(result.capabilities).toEqual({ tools: { listChanged: false } });
    expect(result._meta).toMatchObject({ "io.modelcontextprotocol/serverInfo": { name: "platform-requirements" } });
  });

  it("names the dataset, its date, its license and Invokary in every result", async () => {
    const client = await connect(harness(), "modern");
    for (const [name, args] of Object.entries(VALID_CALLS)) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).toBeFalsy();
      expect(result.structuredContent, name).toMatchObject({
        citation: { dataset: dataset.name, dateModified: dataset.dateModified, license: { name: "CC BY 4.0" }, attribution: "Invokary, https://invokary.com/platforms" },
      });
      const text = (result.content as Array<{ type: string; text: string }>).map((block) => block.text).join("\n");
      expect(text, name).toContain("Source: Invokary, https://invokary.com/platforms");
    }
  });

  it("returns a tool error, not a crash, for arguments outside the schema or an unknown id", async () => {
    const client = await connect(harness(), "modern");
    const wrongPlatform = await client.callTool({ name: "get_platform_requirements", arguments: { platform: "slack" } });
    expect(wrongPlatform.isError).toBe(true);
    const unknown = await client.callTool({ name: "get_requirement", arguments: { id: "claude.portl" } });
    expect(unknown.isError).toBe(true);
    expect(JSON.stringify(unknown.content)).toContain("claude.portal");
  });
});

describe("listing rules", () => {
  it("gives every tool a title, a short name and all four hints, set for a read-only tool", async () => {
    const { tools } = await (await connect(harness(), "modern")).listTools();
    for (const tool of tools) {
      expect(tool.name.length, tool.name).toBeLessThanOrEqual(64);
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations, tool.name).toEqual({ title: tool.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(tool.outputSchema, tool.name).toBeDefined();
    }
  });

  it("describes what each tool does without telling the model how to behave", async () => {
    const { tools } = await (await connect(harness(), "modern")).listTools();
    for (const tool of tools) {
      expect(tool.description, tool.name).toMatch(/^(Lists|Returns|Sets|Finds) /);
      expect(tool.description, tool.name).not.toMatch(/\b(you must|always|never|ignore|do not|don't|instead of asking|before answering)\b/i);
    }
  });
});
