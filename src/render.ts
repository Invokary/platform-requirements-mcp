import type { Change, Requirement } from "./dataset.ts";
import type { Citation, Comparison, PlatformSummary } from "./queries.ts";

// The text content of each tool result: Markdown for clients that show text rather than reading
// structuredContent. It holds the same facts, and always ends with the source line.

const EVIDENCE: Record<string, string> = {
  V: "verified against the platform's documentation",
  "3P": "third-party source",
  "V/3P": "verified, with third-party sources",
  CC: "company claim",
  INF: "inference",
  carried: "not re-verified",
};

export const sourceLine = (citation: Citation): string =>
  `Source: ${citation.attribution} (${citation.dataset}, ${citation.license.name}, ${citation.license.url}). Data as of ${citation.dateModified}.`;

export function requirementLine(fact: Requirement): string {
  const evidence = EVIDENCE[fact.evidence] ?? fact.evidence;
  const conflict = fact.status === "conflict" && fact.conflictNote ? ` Sources disagree: ${fact.conflictNote}` : "";
  return `- ${fact.text} (${evidence}; checked ${fact.verifiedAt}; id ${fact.id}; ${fact.url})${conflict}`;
}

export function requirementDetail(fact: Requirement): string {
  return [
    `${fact.text}`,
    "",
    `- Id: ${fact.id}`,
    `- Platform: ${fact.platform}; product surface: ${fact.productSurface.join(", ")}`,
    `- Topic: ${fact.categoryLabel}`,
    `- Evidence: ${EVIDENCE[fact.evidence] ?? fact.evidence}; checked ${fact.verifiedAt}`,
    ...(fact.status === "conflict" && fact.conflictNote ? [`- Sources disagree: ${fact.conflictNote}`] : []),
    `- Sources: ${fact.sources.map((source) => `${source.label} (${source.url})`).join("; ")}`,
    `- On invokary.com: ${fact.url}`,
  ].join("\n");
}

export function platformsText(platforms: readonly PlatformSummary[], protocolCount: number, citation: Citation): string {
  return [
    ...platforms.map(
      (platform) =>
        `- ${platform.name} (${platform.surfaceName}, ${platform.vendor}), id ${platform.id}: ${platform.requirementCount} requirements on ${platform.topics.map((topic) => topic.label.toLowerCase()).join(", ")}; last checked ${platform.lastChecked ?? "never"}. ${platform.url}`,
    ),
    ...(protocolCount > 0 ? [`- The MCP specification itself, id ecosystem: ${protocolCount} protocol requirement${protocolCount === 1 ? "" : "s"}.`] : []),
    "",
    sourceLine(citation),
  ].join("\n");
}

export function requirementsText(heading: string, facts: readonly Requirement[], citation: Citation, empty: string): string {
  return [heading, "", ...(facts.length > 0 ? facts.map(requirementLine) : [empty]), "", sourceLine(citation)].join("\n");
}

export function comparisonText(comparison: Comparison, names: Record<string, string>, citation: Citation): string {
  const lines = comparison.topics.flatMap((topic) => [
    `## ${topic.label}`,
    ...comparison.platforms.flatMap((platform) => {
      const entries = topic.requirements[platform] ?? [];
      return [`${names[platform] ?? platform}:`, ...(entries.length > 0 ? entries.map((entry) => `- ${entry.text} (checked ${entry.verifiedAt}; ${entry.url})`) : ["- Not stated in the sources tracked."])];
    }),
    "",
  ]);
  return [...(lines.length > 0 ? lines : ["No requirements on that topic for these platforms.", ""]), sourceLine(citation)].join("\n");
}

export function changesText(changes: readonly Change[], citation: Citation): string {
  return [
    ...(changes.length > 0 ? changes.map((change) => `- ${change.title} (updated ${change.updated}; platforms: ${change.platforms.join(", ")}): ${change.summary} ${change.url}`) : ["No change notes match."]),
    "",
    sourceLine(citation),
  ].join("\n");
}
