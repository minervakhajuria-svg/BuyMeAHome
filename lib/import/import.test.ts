import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveProfile } from "@/lib/profile/defaults";
import { buyerProfile, type Dataset } from "@/lib/schemas";
import { scoreMarkets } from "@/lib/scoring";
import { parseCsv, validateRows } from "./csv";
import { TABLES } from "./tables";

const sample = (name: string) => parseCsv(readFileSync(`data/sample/${name}.csv`, "utf8"));
const validate = (table: keyof typeof TABLES, parsed: ReturnType<typeof parseCsv>) =>
  validateRows<Record<string, unknown>>(parsed, TABLES[table].schema);

describe("parseCsv / validateRows", () => {
  const markets = TABLES.micro_markets.schema;
  const base = "slug,name,corridor,as_of_date,is_sample,source_notes\n";

  it("accepts a minimal sample row and a sourced real row", () => {
    const csv = base + "a-b,A,C,2026-10-01,true,\n" + 'c-d,"D, with comma",C,2026-10-01,false,Builder brochure\n';
    const res = validateRows<{ name: string }>(parseCsv(csv), markets);
    expect(res.errors).toEqual([]);
    expect(res.rows.map((r) => r.name)).toEqual(["A", "D, with comma"]);
  });

  it("requires source_notes for non-sample rows", () => {
    const res = validateRows(parseCsv(base + "a-b,A,C,2026-10-01,false,\n"), markets);
    expect(res.errors).toEqual([{ line: 2, message: "source_notes: source_notes is required unless is_sample is true" }]);
  });

  it("rejects unknown and missing columns once, on line 1", () => {
    const res = validateRows(parseCsv("slug,name,colour\nx,y,z\n"), markets);
    const msgs = res.errors.map((e) => e.message);
    expect(msgs).toContain('Unknown column "colour"');
    expect(msgs).toContain('Missing required column "corridor"');
    expect(res.errors.every((e) => e.line === 1)).toBe(true);
  });

  it("reports the file line of a bad row", () => {
    const csv = base + "a-b,A,C,2026-10-01,true,\n" + "Bad Slug,B,C,not-a-date,true,\n";
    const res = validateRows(parseCsv(csv), markets);
    expect(res.rows).toHaveLength(1);
    expect(res.errors.map((e) => e.line)).toEqual([3, 3]);
  });

  it("reports ragged rows as a parse error", () => {
    expect(() => parseCsv("a,b\n1\n")).toThrow(/Could not parse CSV/);
  });
});

describe("sample dataset", () => {
  const tables = ["micro_markets", "schools", "projects", "commute_times"] as const;
  const valid = Object.fromEntries(
    tables.map((t) => {
      const res = validate(t, sample(t));
      expect(res.errors, t).toEqual([]);
      return [t, res.rows];
    }),
  ) as Record<(typeof tables)[number], Record<string, unknown>[]>;

  it("marks every market as sample and uses unique slugs", () => {
    expect(valid.micro_markets.length).toBeGreaterThanOrEqual(8);
    expect(valid.micro_markets.every((r) => r.is_sample === true)).toBe(true);
    const slugs = valid.micro_markets.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only references known slugs, with unique keys", () => {
    const slugs = new Set(valid.micro_markets.map((r) => r.slug));
    for (const t of ["schools", "projects", "commute_times"] as const) {
      expect(valid[t].every((r) => slugs.has(r.micro_market_slug as string)), t).toBe(true);
    }
    const keys = valid.commute_times.map((r) => `${r.micro_market_slug}|${r.destination}|${r.mode}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("runs through the scoring engine and yields ranked, ruled-out and gap-aware results", () => {
    const withId = <T extends Record<string, unknown>>(rows: T[]) =>
      rows.map(({ micro_market_slug, ...r }) => ({ ...r, micro_market_id: micro_market_slug }));
    const ds = {
      microMarkets: valid.micro_markets.map(({ slug, ...r }) => ({ ...r, id: slug })),
      schools: withId(valid.schools),
      projects: withId(valid.projects),
      commuteTimes: withId(valid.commute_times),
    } as unknown as Dataset;

    const { resolved, usedDefaults } = resolveProfile(
      buyerProfile.parse({
        household: { kidAges: [5] },
        work: { workplaces: [{ who: "you", hub: "orr_bellandur" }], maxCommuteMinutes: 45, mode: "car" },
        budget: { allInBudget: { min: 15_000_000, max: 15_000_000 } },
      }),
    );
    const out = scoreMarkets(resolved, usedDefaults, ds);
    expect(out.results).toHaveLength(8);
    expect(out.hasSampleData).toBe(true);
    expect(out.results.filter((r) => r.status === "top")).toHaveLength(3);
    expect(out.results.some((r) => r.ruleOuts.length > 0)).toBe(true);
  });
});
