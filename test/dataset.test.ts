import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDataset } from "../src/dataset.ts";

const raw = JSON.parse(readFileSync(new URL("../data/platform-requirements.json", import.meta.url), "utf8")) as Record<string, unknown> & { facts: Array<Record<string, unknown>> };

describe("the bundled dataset", () => {
  it("is valid, version 1.x, and links every requirement to invokary.com", () => {
    const dataset = parseDataset(raw);
    expect(dataset.schemaVersion).toMatch(/^1\./);
    for (const fact of dataset.facts) expect(new URL(fact.url).origin).toBe("https://invokary.com");
    expect(dataset.license.name).toBe("CC BY 4.0");
  });

  it("accepts fields it doesn't know, so additive changes sync without a release", () => {
    expect(() => parseDataset({ ...raw, newField: 1, facts: raw.facts.map((fact) => ({ ...fact, extra: "x" })) })).not.toThrow();
  });

  it("refuses a new major version, duplicate ids and unknown platforms", () => {
    expect(() => parseDataset({ ...raw, schemaVersion: "2.0.0" })).toThrow(/new major version/);
    expect(() => parseDataset({ ...raw, facts: [...raw.facts, raw.facts[0]] })).toThrow(/duplicate requirement id/);
    expect(() => parseDataset({ ...raw, facts: [{ ...raw.facts[0], platform: "slack" }] })).toThrow(/unknown platform slack/);
  });
});
