import type { ModelCall } from "@/lib/intake/extract";
import type { ScoringOptions } from "@/lib/scoring";
import type { BuyerProfile, Dataset } from "@/lib/schemas";
import { buildReportInput, type ReportData } from "./facts";
import { writeNarrative } from "./narrative";

export interface GenerateOptions extends ScoringOptions {
  /** Model call for the narrative; without it the deterministic template is used. */
  call?: ModelCall;
}

/** profile + dataset -> scored, rule-out-logged, narrated report data. Code does all the ranking and maths. */
export async function generateReport(profile: BuyerProfile, ds: Dataset, opts: GenerateOptions = {}): Promise<ReportData> {
  const { input, scoring } = buildReportInput(profile, ds, opts);
  const { narrative, source, problems } = await writeNarrative(input, opts.call);
  return { input, scoring, narrative, narrativeSource: source, narrativeProblems: problems };
}
