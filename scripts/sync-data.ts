import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseDataset } from "../src/dataset.ts";

// Refreshes the bundled snapshot from invokary.com, the dataset's source of truth. The new file is
// written only if it validates, byte for byte as published. tools.json is regenerated afterwards (by
// the workflow), since the tools' platform and topic lists come from the data.
//
//   npm run data:sync
//   npm run data:sync -- --from ./platform-requirements.json

export const SOURCE = "https://invokary.com/data/platform-requirements.json";
export const SNAPSHOT = new URL("../data/platform-requirements.json", import.meta.url);

async function read(from: string): Promise<string> {
  if (!/^https:\/\//.test(from)) return readFileSync(from, "utf8");
  const response = await fetch(from, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${from} answered ${response.status}`);
  return response.text();
}

export async function syncData(from: string = SOURCE): Promise<{ changed: boolean; dateModified: string }> {
  const text = await read(from);
  const dataset = parseDataset(JSON.parse(text));
  const changed = readFileSync(SNAPSHOT, "utf8") !== text;
  if (changed) writeFileSync(SNAPSHOT, text);
  return { changed, dateModified: dataset.dateModified };
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { from: { type: "string" } } });
  const { changed, dateModified } = await syncData(values.from);
  console.log(changed ? `Updated the snapshot (data as of ${dateModified}).` : "The snapshot is current.");
}
