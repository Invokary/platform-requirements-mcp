import { ECOSYSTEM, type Change, type Dataset, type Platform, type Requirement, type Retired } from "./dataset.ts";

// Read-only queries over the dataset. Every tool result is built from these, so the tests can check
// the answers without going through the protocol.

/** What every result carries, so an assistant can name and link the source. */
export interface Citation {
  dataset: string;
  schemaVersion: string;
  dateModified: string;
  license: { name: string; url: string };
  attribution: string;
  url: string;
}

export const citation = (dataset: Dataset): Citation => ({
  dataset: dataset.name,
  schemaVersion: dataset.schemaVersion,
  dateModified: dataset.dateModified,
  license: dataset.license,
  attribution: dataset.attribution,
  url: dataset.url,
});

export interface Topic {
  id: string;
  label: string;
}

/** The topics (categories) in the order the dataset first uses them, which follows the site's. */
export function topics(dataset: Dataset, facts: readonly Requirement[] = dataset.facts): Topic[] {
  const seen = new Map<string, string>();
  for (const fact of facts) if (!seen.has(fact.category)) seen.set(fact.category, fact.categoryLabel);
  return [...seen].map(([id, label]) => ({ id, label }));
}

/** The directory platforms, then `ecosystem` when the dataset holds protocol requirements. */
export function platformIds(dataset: Dataset): string[] {
  const ids = dataset.platforms.map((platform) => platform.id);
  return dataset.facts.some((fact) => fact.platform === ECOSYSTEM) ? [...ids, ECOSYSTEM] : ids;
}

export function productSurfaces(dataset: Dataset): string[] {
  return [...new Set(dataset.facts.flatMap((fact) => fact.productSurface))];
}

const latest = (dates: readonly string[]): string | undefined => [...dates].sort().at(-1);

export interface PlatformSummary extends Platform {
  requirementCount: number;
  topics: Array<Topic & { requirementCount: number }>;
  lastChecked: string | undefined;
}

export function listPlatforms(dataset: Dataset): PlatformSummary[] {
  return dataset.platforms.map((platform) => {
    const facts = dataset.facts.filter((fact) => fact.platform === platform.id);
    return {
      ...platform,
      requirementCount: facts.length,
      topics: topics(dataset, facts).map((topic) => ({ ...topic, requirementCount: facts.filter((fact) => fact.category === topic.id).length })),
      lastChecked: latest(facts.map((fact) => fact.verifiedAt)),
    };
  });
}

export function requirementsFor(dataset: Dataset, platform: string, filter: { category?: string | undefined; productSurface?: string | undefined } = {}): Requirement[] {
  return dataset.facts.filter(
    (fact) => fact.platform === platform && (filter.category === undefined || fact.category === filter.category) && (filter.productSurface === undefined || fact.productSurface.includes(filter.productSurface)),
  );
}

export type Lookup =
  | { kind: "found"; requirement: Requirement }
  | { kind: "retired"; retired: Retired; replacement: Requirement | undefined }
  | { kind: "unknown"; suggestions: string[] };

/** One requirement by id. Ids are never reused: a removed one is listed as retired. */
export function findRequirement(dataset: Dataset, id: string): Lookup {
  const wanted = id.trim().toLowerCase();
  const requirement = dataset.facts.find((fact) => fact.id === wanted);
  if (requirement) return { kind: "found", requirement };
  const retired = dataset.retired.find((entry) => entry.id === wanted);
  if (retired) return { kind: "retired", retired, replacement: dataset.facts.find((fact) => fact.id === retired.replacedBy) };
  const prefix = wanted.split(".")[0] ?? "";
  const words = wanted.split(/[.\-_\s]+/).filter((word) => word.length > 2);
  const suggestions = dataset.facts
    .map((fact) => ({ id: fact.id, score: (fact.id.startsWith(`${prefix}.`) ? 1 : 0) + words.filter((word) => fact.id.includes(word)).length * 2 }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((candidate) => candidate.id);
  return { kind: "unknown", suggestions };
}

export interface ComparedRequirement {
  id: string;
  text: string;
  verifiedAt: string;
  url: string;
}

export interface Comparison {
  platforms: string[];
  topics: Array<Topic & { requirements: Record<string, ComparedRequirement[]> }>;
}

/** The chosen platforms' requirements side by side, one entry per topic any of them sets. */
export function compare(dataset: Dataset, platforms: readonly string[], category?: string): Comparison {
  const chosen = dataset.facts.filter((fact) => platforms.includes(fact.platform) && (category === undefined || fact.category === category));
  return {
    platforms: [...platforms],
    topics: topics(dataset, chosen).map((topic) => ({
      ...topic,
      requirements: Object.fromEntries(
        platforms.map((platform) => [
          platform,
          chosen.filter((fact) => fact.platform === platform && fact.category === topic.id).map((fact) => ({ id: fact.id, text: fact.text, verifiedAt: fact.verifiedAt, url: fact.url })),
        ]),
      ),
    })),
  };
}

const STOP_WORDS = new Set(["a", "an", "and", "are", "be", "can", "do", "does", "for", "how", "i", "in", "is", "it", "my", "need", "of", "on", "or", "the", "to", "what", "when", "which", "who", "with"]);

/** Search terms: lowercase words, without common words, with a trailing plural "s" dropped. */
export function searchTerms(query: string): string[] {
  const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [...new Set(words.filter((word) => !STOP_WORDS.has(word) && word.length > 1).map((word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word)))];
}

export const SEARCH_LIMIT = 10;

/** Requirements matching the most search terms first; ties keep the dataset's order. */
export function search(dataset: Dataset, query: string, platform?: string): Requirement[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  return dataset.facts
    .filter((fact) => platform === undefined || fact.platform === platform)
    .map((fact, index) => {
      const haystack = `${fact.text} ${fact.categoryLabel} ${fact.id} ${fact.productSurface.join(" ")}`.toLowerCase();
      return { fact, index, score: terms.filter((term) => haystack.includes(term)).length };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, SEARCH_LIMIT)
    .map((match) => match.fact);
}

/** Change notes, newest update first, optionally for one platform or updated on or after a date. */
export function changesFor(dataset: Dataset, filter: { platform?: string | undefined; since?: string | undefined } = {}): Change[] {
  return dataset.changes
    .filter((change) => (filter.platform === undefined || change.platforms.includes(filter.platform)) && (filter.since === undefined || change.updated >= filter.since))
    .sort((a, b) => b.updated.localeCompare(a.updated) || a.slug.localeCompare(b.slug));
}
