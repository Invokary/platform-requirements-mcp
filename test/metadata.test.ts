import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { WEBSITE_URL } from "../src/server.ts";

// The listing files agree with each other and with the package: one endpoint, one version.

const json = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")) as Record<string, unknown>;
const ENDPOINT = "https://mcp.invokary.com/mcp";

describe("listing files", () => {
  it("server.json fits the MCP Registry's limits and names this endpoint and version", () => {
    const server = json("server.json") as { name: string; title: string; description: string; version: string; websiteUrl: string; remotes: Array<{ type: string; url: string }> };
    expect(server.name).toMatch(/^com\.invokary\/[a-zA-Z0-9._-]+$/);
    expect(server.description.length).toBeLessThanOrEqual(100);
    expect(server.title.length).toBeLessThanOrEqual(100);
    expect(server.version).toBe(packageJson.version);
    expect(server.websiteUrl).toBe(WEBSITE_URL);
    expect(server.remotes).toEqual([{ type: "streamable-http", url: ENDPOINT }]);
  });

  it("the Cursor plugin is a kebab-case, permissively licensed manifest pointing at this endpoint", () => {
    const plugin = json(".cursor-plugin/plugin.json") as { name: string; version: string; license: string; logo: string; mcpServers: string };
    expect(plugin.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(plugin.version).toBe(packageJson.version);
    expect(plugin.license).toBe(packageJson.license);
    expect(["MIT", "Apache-2.0", "BSD-3-Clause"]).toContain(plugin.license);
    expect(existsSync(new URL(`../${plugin.logo}`, import.meta.url))).toBe(true);
    const servers = (json(plugin.mcpServers) as { mcpServers: Record<string, { url: string }> }).mcpServers;
    expect(Object.values(servers).map((server) => server.url)).toEqual([ENDPOINT]);
  });

  it("tools.json documents the same endpoint", () => {
    expect(json("tools.json").endpoint).toBe(ENDPOINT);
  });
});
