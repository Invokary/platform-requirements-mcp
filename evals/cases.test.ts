import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../src/index.ts";
import { connect, harness } from "../test/harness.ts";

// The test cases a ChatGPT plugin submission asks for (exactly five positive and three negative,
// requirement chatgpt.test-cases), run against the server. Each positive case names the tool an
// assistant should pick and its arguments; CI checks that the call answers the prompt. The negative
// cases are prompts the server should not be used for; they go into the submission as written.

interface Cases {
  positive: Array<{ prompt: string; tool: string; arguments: Record<string, unknown>; expect: { ids: string[]; text: string[] } }>;
  negative: Array<{ prompt: string; why: string }>;
}

const cases = JSON.parse(readFileSync(new URL("./cases.json", import.meta.url), "utf8")) as Cases;

/** Every `id` anywhere in a structured result. */
function ids(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(ids);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => (key === "id" && typeof inner === "string" ? [inner] : ids(inner)));
}

describe("submission test cases", () => {
  it("has exactly five positive and three negative cases, each with a prompt", () => {
    expect(cases.positive).toHaveLength(5);
    expect(cases.negative).toHaveLength(3);
    for (const entry of [...cases.positive, ...cases.negative]) expect(entry.prompt.trim().length).toBeGreaterThan(10);
  });

  for (const era of ["modern", "legacy"] as const) {
    it.each(cases.positive)(`answers "$prompt" (${era} client)`, async (entry) => {
      expect(TOOL_NAMES.has(entry.tool)).toBe(true);
      const client = await connect(harness(), era);
      const result = await client.callTool({ name: entry.tool, arguments: entry.arguments });
      expect(result.isError).toBeFalsy();
      const found = ids(result.structuredContent);
      for (const id of entry.expect.ids) expect(found, id).toContain(id);
      const text = (result.content as Array<{ text: string }>).map((block) => block.text).join("\n");
      for (const phrase of entry.expect.text) expect(text, phrase).toContain(phrase);
    });
  }
});
