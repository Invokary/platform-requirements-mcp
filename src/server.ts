import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import packageJson from "../package.json" with { type: "json" };
import { changeSchema, ECOSYSTEM, platformSchema, requirementSchema, retiredSchema, type Dataset } from "./dataset.ts";
import { changesFor, citation, compare, findRequirement, listPlatforms, platformIds, productSurfaces, requirementsFor, search, SEARCH_LIMIT, topics } from "./queries.ts";
import { changesText, comparisonText, platformsText, requirementDetail, requirementsText, sourceLine } from "./render.ts";

// The MCP server: six read-only tools over the bundled dataset. Every result carries the dataset's
// citation (name, version, date, license and attribution) in both its structured and its text form.

export const SERVER_NAME = "platform-requirements";
export const SERVER_TITLE = "Invokary Platform Requirements";
export const WEBSITE_URL = "https://invokary.com/open-source";

const INSTRUCTIONS =
  "Read-only data on what Claude, ChatGPT, Cursor and the Official MCP Registry require before they list an MCP connector or plugin. Every requirement carries its sources, an evidence label and the date it was last checked. Published by Invokary under CC BY 4.0 at https://invokary.com/platforms.";

/** Every tool only reads a bundled, fixed dataset: no writes, no deletes, no outside calls. */
const readOnly = (title: string) => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });

const oneOf = (values: readonly string[]) => z.enum(values as [string, ...string[]]);

const citationSchema = z.object({
  dataset: z.string(),
  schemaVersion: z.string(),
  dateModified: z.string(),
  license: z.object({ name: z.string(), url: z.string() }),
  attribution: z.string(),
  url: z.string(),
});

/** One hour: the data changes at most once a day. */
const LIST_TTL_MS = 3_600_000;

export function createServer(dataset: Dataset): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, title: SERVER_TITLE, version: packageJson.version, websiteUrl: WEBSITE_URL, icons: [{ src: "https://invokary.com/logo.png", mimeType: "image/png", sizes: ["512x512"] }] },
    {
      instructions: INSTRUCTIONS,
      // The tool list only changes with a deploy, so there is nothing to subscribe to.
      capabilities: { tools: { listChanged: false } },
      cacheHints: { "tools/list": { ttlMs: LIST_TTL_MS, cacheScope: "public" }, "server/discover": { ttlMs: LIST_TTL_MS, cacheScope: "public" } },
    },
  );
  const cite = citation(dataset);
  const platforms = platformIds(dataset);
  const directories = dataset.platforms.map((platform) => platform.id);
  const names = Object.fromEntries([...dataset.platforms.map((platform) => [platform.id, platform.name] as const), [ECOSYSTEM, "MCP specification"] as const]);
  const categories = topics(dataset).map((topic) => topic.id);
  const surfaces = productSurfaces(dataset);
  const platformList = platforms.map((id) => `${id} (${names[id] ?? id})`).join(", ");

  server.registerTool(
    "list_platforms",
    {
      title: "List platforms",
      description:
        "Lists the platforms in the Platform Requirements dataset (Claude, ChatGPT, Cursor and the Official MCP Registry): each one's directory, vendor, number of requirements, topics and latest check date. Use it to see what the dataset covers and which ids the other tools take.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        platforms: z.array(platformSchema.extend({ requirementCount: z.number(), topics: z.array(z.object({ id: z.string(), label: z.string(), requirementCount: z.number() })), lastChecked: z.string().optional() })),
        protocolRequirementCount: z.number(),
        citation: citationSchema,
      }),
      annotations: readOnly("List platforms"),
    },
    async () => {
      const summaries = listPlatforms(dataset);
      const protocolRequirementCount = dataset.facts.filter((fact) => fact.platform === ECOSYSTEM).length;
      return {
        content: [{ type: "text", text: platformsText(summaries, protocolRequirementCount, cite) }],
        structuredContent: { platforms: summaries, protocolRequirementCount, citation: cite },
      };
    },
  );

  server.registerTool(
    "get_platform_requirements",
    {
      title: "Get a platform's requirements",
      description: `Returns what one platform requires before it lists an MCP connector or plugin, each requirement with its sources, evidence label and the date it was last checked. Narrow the list to one topic (category) or one product surface. Platforms: ${platformList}.`,
      inputSchema: z.object({
        platform: oneOf(platforms).describe("The platform id."),
        category: oneOf(categories).optional().describe("Only requirements on this topic."),
        productSurface: oneOf(surfaces).optional().describe("Only requirements that hold for this product surface, e.g. claude-connectors or claude-plugins."),
      }),
      outputSchema: z.object({ platform: platformSchema.nullable(), requirements: z.array(requirementSchema), citation: citationSchema }),
      annotations: readOnly("Get a platform's requirements"),
    },
    async ({ platform, category, productSurface }) => {
      const requirements = requirementsFor(dataset, platform, { category, productSurface });
      const heading = `${names[platform] ?? platform} requirements${category ? ` on ${topics(dataset).find((topic) => topic.id === category)?.label ?? category}` : ""}${productSurface ? ` for ${productSurface}` : ""}:`;
      return {
        content: [{ type: "text", text: requirementsText(heading, requirements, cite, "None in the dataset for that filter.") }],
        structuredContent: { platform: dataset.platforms.find((entry) => entry.id === platform) ?? null, requirements, citation: cite },
      };
    },
  );

  server.registerTool(
    "get_requirement",
    {
      title: "Get one requirement",
      description:
        "Returns one requirement by its id, for example claude.rule-annotations, with its sources and the date it was last checked. For a retired id it returns the retirement date and the requirement that replaced it.",
      inputSchema: z.object({ id: z.string().min(1).max(100).describe("The requirement id, as returned by the other tools.") }),
      outputSchema: z.object({ requirement: requirementSchema.optional(), retired: retiredSchema.optional(), replacement: requirementSchema.optional(), citation: citationSchema }),
      annotations: readOnly("Get one requirement"),
    },
    async ({ id }) => {
      const lookup = findRequirement(dataset, id);
      if (lookup.kind === "found") {
        return { content: [{ type: "text", text: `${requirementDetail(lookup.requirement)}\n\n${sourceLine(cite)}` }], structuredContent: { requirement: lookup.requirement, citation: cite } };
      }
      if (lookup.kind === "retired") {
        const replaced = lookup.replacement ? `\n\nIt was replaced by:\n\n${requirementDetail(lookup.replacement)}` : "";
        return {
          content: [{ type: "text", text: `Requirement ${lookup.retired.id} was retired on ${lookup.retired.retiredAt}.${replaced}\n\n${sourceLine(cite)}` }],
          structuredContent: { retired: lookup.retired, ...(lookup.replacement ? { replacement: lookup.replacement } : {}), citation: cite },
        };
      }
      const hint = lookup.suggestions.length > 0 ? ` Close matches: ${lookup.suggestions.join(", ")}.` : " get_platform_requirements and search_requirements return the ids.";
      return { isError: true, content: [{ type: "text", text: `No requirement has the id "${id}".${hint}` }] };
    },
  );

  server.registerTool(
    "compare_platforms",
    {
      title: "Compare platforms",
      description:
        "Sets the requirements of two or more platforms side by side, grouped by topic, to show where they differ, for example on authentication or on what a submission needs. Leave platforms out to compare all four directories.",
      inputSchema: z.object({
        platforms: z.array(oneOf(platforms)).min(2).max(platforms.length).optional().describe(`Two or more platform ids. Default: ${directories.join(", ")}.`),
        category: oneOf(categories).optional().describe("Only this topic."),
      }),
      outputSchema: z.object({
        platforms: z.array(z.string()),
        topics: z.array(z.object({ id: z.string(), label: z.string(), requirements: z.record(z.string(), z.array(z.object({ id: z.string(), text: z.string(), verifiedAt: z.string(), url: z.string() }))) })),
        citation: citationSchema,
      }),
      annotations: readOnly("Compare platforms"),
    },
    async ({ platforms: chosen, category }) => {
      const comparison = compare(dataset, [...new Set(chosen ?? directories)], category);
      return { content: [{ type: "text", text: comparisonText(comparison, names, cite) }], structuredContent: { ...comparison, citation: cite } };
    },
  );

  server.registerTool(
    "search_requirements",
    {
      title: "Search requirements",
      description: `Finds requirements whose text matches keywords or a question, such as "privacy policy", "OAuth" or "test cases", across every platform or within one. Returns up to ${SEARCH_LIMIT} matches, best first, with their sources and check dates.`,
      inputSchema: z.object({
        query: z.string().min(2).max(200).describe("Keywords or a question."),
        platform: oneOf(platforms).optional().describe("Only this platform."),
      }),
      outputSchema: z.object({ query: z.string(), requirements: z.array(requirementSchema), citation: citationSchema }),
      annotations: readOnly("Search requirements"),
    },
    async ({ query, platform }) => {
      const requirements = search(dataset, query, platform);
      return {
        content: [{ type: "text", text: requirementsText(`Requirements matching "${query}":`, requirements, cite, "No requirement matches those words. list_platforms shows the topics the dataset covers.") }],
        structuredContent: { query, requirements, citation: cite },
      };
    },
  );

  server.registerTool(
    "list_platform_changes",
    {
      title: "List platform changes",
      description:
        "Lists Invokary's dated notes on changes to these platforms' submission rules, most recently updated first, optionally for one platform or updated on or after a date. Each note links to its full text.",
      inputSchema: z.object({
        platform: oneOf(directories).optional().describe("Only notes about this platform."),
        since: z.iso.date().optional().describe("Only notes updated on or after this date (YYYY-MM-DD)."),
      }),
      outputSchema: z.object({ changes: z.array(changeSchema), citation: citationSchema }),
      annotations: readOnly("List platform changes"),
    },
    async ({ platform, since }) => {
      const changes = changesFor(dataset, { platform, since });
      return { content: [{ type: "text", text: changesText(changes, cite) }], structuredContent: { changes, citation: cite } };
    },
  );

  return server;
}
