import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadSampleDataset } from "@/lib/dataset/sample";
import { generateReport } from "@/lib/report/generate";
import { MemoryReportStore } from "@/lib/report/store";
import { buyerProfile } from "@/lib/schemas";
import { readFileSync } from "node:fs";
import { ReportView } from "./ReportView";

const example = buyerProfile.parse(JSON.parse(readFileSync("data/sample/profile.example.json", "utf8")));
const html = async (profile = example) => renderToStaticMarkup(<ReportView report={await generateReport(profile, loadSampleDataset())} />);

describe("ReportView", () => {
  it("renders all nine sections, the sample banner, as-of date and disclaimer", async () => {
    const out = await html();
    for (const title of ["Headline", "Your situation and priorities", "Affordability: the honest math", "Your top picks in detail", "Backups, and ruled out and why", "Side by side", "Due-diligence checklist", "Field-trip plan", "Bottom line"]) {
      expect(out).toContain(title);
    }
    expect(out).toContain("Sample data: this report uses placeholder numbers");
    expect(out).toContain("Data as of 2026-10-09");
    expect(out).toContain("not financial or legal advice");
    expect(out).toContain("Download PDF");
  });

  it("never prints raw undefined, NaN or null", async () => {
    for (const profile of [example, buyerProfile.parse({}), buyerProfile.parse({ budget: { allInBudget: { min: 1, max: 1_000_000 } } })]) {
      expect(await html(profile)).not.toMatch(/undefined|NaN|\bnull\b/);
    }
  });

  it("says why when nothing qualifies", async () => {
    const out = await html(buyerProfile.parse({ budget: { allInBudget: { min: 1, max: 1_000_000 } } }));
    expect(out).toContain("No micro-market passed your filters");
    expect(out).toContain("Cheapest typical");
  });

  it("hides the sample banner for non-sample data", async () => {
    const ds = loadSampleDataset();
    ds.microMarkets = ds.microMarkets.map((m) => ({ ...m, is_sample: false }));
    const out = renderToStaticMarkup(<ReportView report={await generateReport(example, ds)} />);
    expect(out).not.toContain("Sample data:");
  });
});

describe("MemoryReportStore", () => {
  it("round-trips a report by an unguessable token", async () => {
    const report = await generateReport(example, loadSampleDataset());
    const store = new MemoryReportStore();
    const { token } = await store.save("s1", report);
    expect(token).toHaveLength(22);
    expect(await store.get(token)).toEqual(report);
    expect(await store.get("x".repeat(22))).toBeNull();
  });
});
