import { describe, expect, it } from "vitest";
import { ECOSYSTEM, type Dataset } from "../src/dataset.ts";
import { dataset } from "../src/index.ts";
import { changesFor, compare, findRequirement, listPlatforms, platformIds, requirementsFor, search, searchTerms, topics } from "../src/queries.ts";

describe("queries", () => {
  it("counts every requirement once, across the platforms and the protocol", () => {
    const counted = listPlatforms(dataset).reduce((sum, platform) => sum + platform.requirementCount, 0);
    expect(counted + dataset.facts.filter((fact) => fact.platform === ECOSYSTEM).length).toBe(dataset.facts.length);
    expect(platformIds(dataset)).toEqual(["claude", "chatgpt", "cursor", "mcp-registry", ECOSYSTEM]);
  });

  it("narrows a platform's requirements by topic and by product surface", () => {
    const rules = requirementsFor(dataset, "claude", { category: "rules" });
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every((fact) => fact.platform === "claude" && fact.category === "rules")).toBe(true);
    const plugins = requirementsFor(dataset, "claude", { productSurface: "claude-plugins" });
    expect(plugins.every((fact) => fact.productSurface.includes("claude-plugins"))).toBe(true);
    expect(plugins.map((fact) => fact.id)).not.toContain("claude.rule-annotations");
  });

  it("finds a requirement, reports a retired one with its replacement, and suggests ids for a typo", () => {
    expect(findRequirement(dataset, " Claude.Portal ")).toMatchObject({ kind: "found", requirement: { id: "claude.portal" } });
    const retiring: Dataset = { ...dataset, retired: [{ id: "claude.old-rule", retiredAt: "2026-10-01", replacedBy: "claude.rule-annotations" }] };
    expect(findRequirement(retiring, "claude.old-rule")).toMatchObject({ kind: "retired", replacement: { id: "claude.rule-annotations" } });
    const typo = findRequirement(dataset, "chatgpt.test-case");
    expect(typo.kind === "unknown" && typo.suggestions[0]).toBe("chatgpt.test-cases");
  });

  it("compares only the topics the chosen platforms set, with an entry for each platform", () => {
    const comparison = compare(dataset, ["claude", "chatgpt"], "auth");
    expect(comparison.topics.map((topic) => topic.id)).toEqual(["auth"]);
    const auth = comparison.topics[0]!;
    expect(Object.keys(auth.requirements)).toEqual(["claude", "chatgpt"]);
    expect(auth.requirements.claude?.map((entry) => entry.id)).toEqual(["claude.auth-options"]);
    const everything = compare(dataset, ["cursor", "mcp-registry"]);
    expect(everything.topics.map((topic) => topic.id)).toEqual(topics(dataset, dataset.facts.filter((fact) => ["cursor", "mcp-registry"].includes(fact.platform))).map((topic) => topic.id));
  });

  it("searches by keywords, ignoring common words and plural endings, best match first", () => {
    expect(searchTerms("What are the test cases?")).toEqual(["test", "case"]);
    expect(search(dataset, "How many test cases does OpenAI want?")[0]?.id).toBe("chatgpt.test-cases");
    expect(search(dataset, "license", "cursor").map((fact) => fact.id)).toEqual(["cursor.licenses"]);
    expect(search(dataset, "the and of")).toEqual([]);
    expect(search(dataset, "a").length).toBe(0);
  });

  it("lists change notes newest first, by platform and by date", () => {
    const all = changesFor(dataset);
    expect(all.map((change) => change.updated)).toEqual([...all.map((change) => change.updated)].sort().reverse());
    expect(changesFor(dataset, { platform: "chatgpt" }).every((change) => change.platforms.includes("chatgpt"))).toBe(true);
    expect(changesFor(dataset, { since: "2999-01-01" })).toEqual([]);
  });
});
