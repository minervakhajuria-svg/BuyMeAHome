import { z } from "zod";
import type { ModelCall } from "@/lib/intake/extract";
import { mentionsProtectedAttribute } from "@/lib/guards";
import type { ReportInput } from "./facts";

/**
 * The narrative is the only LLM-written part of the report. The model gets ReportInput as JSON and
 * writes words only: it never ranks, never does arithmetic, never supplies facts. Output is
 * validated in code; if it cannot be made valid, a deterministic template is used instead.
 */

export const narrativeSchema = z.object({
  headline: z.string(),
  situation: z.string(),
  picks: z.array(z.object({ microMarketId: z.string(), reason: z.string(), whatWorks: z.array(z.string()), whatToWatch: z.array(z.string()) })),
  backups: z.array(z.object({ microMarketId: z.string(), note: z.string() })),
  bottomLine: z.array(z.string()),
});
export type Narrative = z.infer<typeof narrativeSchema>;

/* -------------------------------------------------------------- validation */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;
const toNumber = (s: string) => Number(s.replace(/,/g, ""));

/** Every number that appears anywhere in the input, as a value or inside a string. */
export function numbersIn(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number") into.add(value);
  else if (typeof value === "string") for (const m of value.match(NUMBER) ?? []) into.add(toNumber(m));
  else if (Array.isArray(value)) value.forEach((v) => numbersIn(v, into));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => numbersIn(v, into));
  return into;
}

function strings(n: Narrative): string[] {
  return [
    n.headline,
    n.situation,
    ...n.picks.flatMap((p) => [p.reason, ...p.whatWorks, ...p.whatToWatch]),
    ...n.backups.map((b) => b.note),
    ...n.bottomLine,
  ];
}

/** Investment and rental talk is out of scope for a live-in, buy-only product. */
const BANNED = /\b(invest\w*|rent\w*|roi|appreciat\w*|yield)\b/i;

export function validateNarrative(n: Narrative, input: ReportInput): string[] {
  const problems: string[] = [];
  const pickIds = input.picks.map((p) => p.microMarketId);
  if (n.picks.map((p) => p.microMarketId).join() !== pickIds.join()) problems.push("picks must cover exactly the top picks, in rank order, by microMarketId");
  const backupIds = new Set(input.backups.map((b) => b.microMarketId));
  if (n.backups.some((b) => !backupIds.has(b.microMarketId)) || n.backups.length !== backupIds.size) problems.push("backups must cover exactly the listed backups by microMarketId");
  if (n.bottomLine.length < 6 || n.bottomLine.length > 8) problems.push("bottomLine must have 6 to 8 bullets");
  for (const p of n.picks) {
    if (p.whatWorks.length < 1 || p.whatWorks.length > 4 || p.whatToWatch.length < 1 || p.whatToWatch.length > 4) {
      problems.push(`${p.microMarketId}: whatWorks and whatToWatch need 1 to 4 items each`);
    }
  }

  const known = numbersIn(input);
  const unknown = new Set<number>();
  for (const s of strings(n)) for (const m of s.match(NUMBER) ?? []) if (!known.has(toNumber(m))) unknown.add(toNumber(m));
  if (unknown.size) problems.push(`these numbers are not in the input data: ${[...unknown].join(", ")}`);

  const text = strings(n).join("\n");
  const banned = text.match(BANNED);
  if (banned) problems.push(`out-of-scope wording: "${banned[0]}"`);
  if (mentionsProtectedAttribute(text)) problems.push("mentions a protected attribute");
  return problems;
}

/* ---------------------------------------------------------------- template */

const sentence = (s: string | null) => (s ? s.replace(/\.$/, "") : null);

/** Deterministic narrative built only from the input; valid by construction. */
export function templateNarrative(input: ReportInput): Narrative {
  const top = input.picks;
  const names = top.map((p) => p.name);
  const picks = top.map((p) => {
    const scored = p.dimensions.filter((d) => d.score !== null).sort((a, b) => b.score! - a.score!);
    const best = scored[0];
    const worst = scored[scored.length - 1];
    const works = [
      ...scored.slice(0, 2).flatMap((d) => d.notes.slice(0, 1)),
      p.typicalPrice ? `Typical ${p.typicalPrice.bhk} BHK price ${p.typicalPrice.low} to ${p.typicalPrice.high}` : null,
    ].filter((x): x is string => !!x);
    const watch = [
      worst && worst !== best ? `Weakest area: ${worst.dimension} (${worst.score})` : null,
      ...p.dataGaps.slice(0, 2),
      p.metroStatus ? `Metro status in our data: ${p.metroStatus}` : null,
    ].filter((x): x is string => !!x);
    return {
      microMarketId: p.microMarketId,
      reason: `Scores ${p.totalScore} out of ${input.scoreScale}${best ? `, strongest on ${best.dimension} (${best.score})` : ""}.`,
      whatWorks: works.length ? works.slice(0, 4) : ["See the figures in the comparison tables"],
      whatToWatch: watch.length ? watch.slice(0, 4) : ["No specific concerns found in our data; verify on site"],
    };
  });

  const max = input.affordability.maxPrice;
  const bullets = [
    top[0] ? `Top pick: ${top[0].name}, scoring ${top[0].totalScore} out of ${input.scoreScale}.` : "No micro-market passed your filters with enough data.",
    top.length > 1 ? `Also strong: ${names.slice(1).join(" and ")}.` : null,
    max ? `Your maximum price from the numbers you gave is ${max.text}.` : "A maximum price could not be worked out from the numbers given.",
    `Data in this report is as of ${input.dataAsOf}; verify every fact before buying.`,
    "Visit each shortlisted area on a weekday morning at peak hour to test the real commute.",
    "Visit after rain to check drainage and waterlogging.",
    "Check khata, RERA registration, OC/CC and the encumbrance certificate for any project you shortlist.",
    input.hasSampleData ? "This report uses sample data and is for testing only." : null,
  ].filter((x): x is string => !!x);

  return {
    headline: top.length ? `Best fit for you: ${names.join(", ")}.` : "No strong match found with the data we have.",
    situation: `We weighed ${input.priorities.map((p) => p.dimension.toLowerCase()).slice(0, 3).join(", ")} most heavily${input.usedDefaults.length ? `, and used documented defaults for unanswered items` : ""}.`,
    picks,
    backups: input.backups.map((b) => ({ microMarketId: b.microMarketId, note: `Ranked ${b.rank} with ${b.totalScore} out of ${input.scoreScale}.` })),
    bottomLine: bullets.slice(0, 8),
  };
}

/* --------------------------------------------------------------------- LLM */

const SYSTEM = `You write the narrative for a Bangalore home-buying report. The buyer plans to live in the home; this is buy-only.

You receive one JSON object (the "input"). It already contains every ranking, score, price, EMI and fact. Your job is wording only.

Hard rules:
- Use ONLY facts in the input. No outside knowledge about Bangalore, builders, prices, schools, metro lines or neighbourhoods.
- Do not rank, re-rank or change scores. Do not do arithmetic: no sums, differences, percentages or conversions. Quote numbers exactly as they appear in the input (money is already formatted, e.g. "₹1.25 crore").
- Every number you write must appear in the input. Prefer words over numbers when unsure.
- If the input lacks a fact (null, "not available", or listed in dataGaps), say it is not available. Never guess.
- Do not mention investment, returns, appreciation, renting or rental yield. Never mention caste, religion or community.
- Do not invent project, street, school or area names. Use only names in the input.
- Be plain, specific and brief. Each bullet is one sentence.

Output fields:
- headline: one sentence naming the top picks.
- situation: one or two sentences playing back what matters most to the buyer, using input.priorities and input.buyerAnswers.
- picks: exactly one entry per input.picks item, in the same order, with microMarketId copied exactly. reason: one sentence why it ranks where it does. whatWorks: 1 to 4 short points. whatToWatch: 1 to 4 short points.
- backups: exactly one entry per input.backups item, microMarketId copied exactly, note: one sentence.
- bottomLine: 6 to 8 bullets summarising what to do next.`;

export interface NarrativeResult {
  narrative: Narrative;
  source: "llm" | "template";
  problems: string[];
}

export async function writeNarrative(input: ReportInput, call?: ModelCall, maxAttempts = 2): Promise<NarrativeResult> {
  const problems: string[] = [];
  if (call && input.picks.length > 0) {
    let feedback = "";
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let raw: unknown;
      try {
        raw = await call({ system: SYSTEM, user: `<input>${JSON.stringify(input)}</input>${feedback}`, schema: narrativeSchema, maxTokens: 8000 });
      } catch {
        problems.push(`attempt ${attempt}: model call failed`);
        continue;
      }
      const parsed = narrativeSchema.safeParse(raw);
      if (!parsed.success) {
        problems.push(`attempt ${attempt}: output was not in the expected shape`);
        feedback = "\n\nYour previous answer was not in the expected shape. Follow the output fields exactly.";
        continue;
      }
      const issues = validateNarrative(parsed.data, input);
      if (issues.length === 0) return { narrative: parsed.data, source: "llm", problems };
      problems.push(...issues.map((i) => `attempt ${attempt}: ${i}`));
      feedback = `\n\nYour previous answer was rejected: ${issues.join("; ")}. Rewrite it so it passes.`;
    }
  }
  return { narrative: templateNarrative(input), source: "template", problems };
}
