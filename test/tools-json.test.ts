import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { TOOLS_JSON, toolsJson } from "../scripts/tools-json.ts";

it("tools.json is the server's current tool list (npm run tools:json)", async () => {
  expect(readFileSync(TOOLS_JSON, "utf8")).toBe(await toolsJson());
});
