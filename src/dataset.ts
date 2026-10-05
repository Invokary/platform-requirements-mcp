import { z } from "zod";

// The Platform Requirements dataset, as published at https://invokary.com/data/platform-requirements.json
// (JSON Schema: https://invokary.com/data/platform-requirements.schema.json). The server bundles a
// snapshot in data/, refreshed daily by .github/workflows/sync-data.yml.
//
// This schema checks the fields the server reads. It accepts fields it doesn't know, so an additive
// change on invokary.com (a minor schemaVersion bump) syncs without a release; a new major version
// needs one.

export const SUPPORTED_SCHEMA_MAJOR = 1;

/** Protocol-level requirements (the MCP specification itself) carry this platform id. */
export const ECOSYSTEM = "ecosystem";

const date = z.iso.date();

export const sourceSchema = z.object({
  label: z.string().min(1),
  url: z.url(),
  accessed: date,
});

export const requirementSchema = z.object({
  id: z.string().min(1),
  platform: z.string().min(1),
  productSurface: z.array(z.string().min(1)),
  category: z.string().min(1),
  categoryLabel: z.string().min(1),
  text: z.string().min(1),
  evidence: z.string().min(1),
  sourceKind: z.string().min(1),
  sources: z.array(sourceSchema).min(1),
  status: z.enum(["verified", "conflict"]),
  conflictNote: z.string().min(1).optional(),
  verifiedAt: date,
  verifiedBy: z.string().min(1),
  url: z.url(),
});

export const changeSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  url: z.url(),
  markdownUrl: z.url(),
  published: date,
  updated: date,
  lastVerified: date,
  platforms: z.array(z.string().min(1)),
  sources: z.array(sourceSchema).min(1),
});

export const platformSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string().min(1),
  surfaceName: z.string().min(1),
  url: z.url(),
});

export const retiredSchema = z.object({ id: z.string().min(1), retiredAt: date, replacedBy: z.string().min(1).optional() });

export const datasetSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    schemaVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    dateModified: date,
    url: z.url(),
    license: z.object({ name: z.string().min(1), url: z.url() }),
    attribution: z.string().min(1),
    platforms: z.array(platformSchema).min(1),
    facts: z.array(requirementSchema).min(1),
    changes: z.array(changeSchema),
    retired: z.array(retiredSchema),
  })
  .superRefine((dataset, ctx) => {
    const major = Number(dataset.schemaVersion.split(".")[0]);
    if (major !== SUPPORTED_SCHEMA_MAJOR) ctx.addIssue({ code: "custom", path: ["schemaVersion"], message: `schemaVersion ${dataset.schemaVersion} is a new major version; this server reads ${SUPPORTED_SCHEMA_MAJOR}.x` });
    const ids = dataset.facts.map((fact) => fact.id);
    for (const id of new Set(ids.filter((value, index) => ids.indexOf(value) !== index))) ctx.addIssue({ code: "custom", path: ["facts"], message: `duplicate requirement id ${id}` });
    const platforms = new Set(dataset.platforms.map((platform) => platform.id));
    for (const fact of dataset.facts) {
      if (fact.platform !== ECOSYSTEM && !platforms.has(fact.platform)) ctx.addIssue({ code: "custom", path: ["facts"], message: `${fact.id} names unknown platform ${fact.platform}` });
    }
  });

export type Source = z.infer<typeof sourceSchema>;
export type Requirement = z.infer<typeof requirementSchema>;
export type Change = z.infer<typeof changeSchema>;
export type Platform = z.infer<typeof platformSchema>;
export type Retired = z.infer<typeof retiredSchema>;
export type Dataset = z.infer<typeof datasetSchema>;

/** Validates a dataset file's parsed JSON, throwing with every problem listed. */
export function parseDataset(raw: unknown): Dataset {
  const result = datasetSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid Platform Requirements dataset:\n${z.prettifyError(result.error)}`);
  return result.data;
}
