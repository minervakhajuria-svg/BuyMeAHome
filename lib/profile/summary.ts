import { HUB_LABELS, INFRA_LABELS, LIFESTYLE_LABELS, QUESTIONS } from "@/config/questions";
import { formatRupees } from "@/lib/format";
import { schoolsQuestionApplies, type BuyerProfile, type QuestionId } from "@/lib/schemas";

export interface SummaryLine {
  id: QuestionId;
  title: string;
  state: "answered" | "skipped" | "pending" | "not_applicable";
  /** One-line summary of the answer, when answered. */
  text: string | null;
}

const join = (parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function summarise(p: BuyerProfile, q: QuestionId): string | null {
  switch (q) {
    case "household": {
      const h = p.household;
      if (!h) return null;
      return join([
        h.adults !== undefined && plural(h.adults, "adult"),
        h.kidAges.length > 0 && `kids aged ${h.kidAges.join(", ")}`,
        h.parentsLiving && "parents",
        h.pets && "pets",
      ]) || "Answered";
    }
    case "work": {
      const w = p.work;
      if (!w) return null;
      const places = w.workplaces.map((x) => `${HUB_LABELS[x.hub]} (${x.who})`).join(", ");
      return join([
        places,
        w.officeDaysPerWeek !== undefined && `${plural(w.officeDaysPerWeek, "office day")} a week`,
        w.maxCommuteMinutes !== undefined && `max ${w.maxCommuteMinutes} min`,
        w.mode && w.mode.replace("_", " "),
      ]) || "Answered";
    }
    case "schools": {
      const s = p.schools;
      if (!s) return null;
      return join([s.board && (s.board === "open" ? "any board" : s.board), s.maxSchoolRunMinutes !== undefined && `school run up to ${s.maxSchoolRunMinutes} min`]) || "Answered";
    }
    case "budget": {
      const b = p.budget;
      if (!b) return null;
      const range = b.allInBudget
        ? b.allInBudget.min === b.allInBudget.max
          ? formatRupees(b.allInBudget.max)
          : `${formatRupees(b.allInBudget.min)} to ${formatRupees(b.allInBudget.max)}`
        : null;
      return join([
        range,
        b.downPayment !== undefined && `down ${formatRupees(b.downPayment)}`,
        b.householdMonthlyIncome !== undefined && `income ${formatRupees(b.householdMonthlyIncome)}/month`,
        b.existingMonthlyEmis !== undefined && `EMIs ${formatRupees(b.existingMonthlyEmis)}/month`,
      ]) || "Answered";
    }
    case "property": {
      const x = p.property;
      if (!x) return null;
      return join([
        x.types.length > 0 && x.types.map((t) => t.replace("_", " ")).join(", "),
        x.statuses.length > 0 && x.statuses.map((t) => t.replace("_", " ")).join(", "),
        x.minBhk !== undefined && `${x.minBhk}+ BHK`,
        x.minCarpetSqft !== undefined && `${x.minCarpetSqft}+ sq ft carpet`,
      ]) || "Answered";
    }
    case "legal": {
      const l = p.legal;
      if (!l) return null;
      return join([
        l.khata && (l.khata === "a_only" ? "A-khata only" : "B-khata acceptable"),
        l.reraWithOcCcRequired !== undefined && (l.reraWithOcCcRequired ? "RERA with OC/CC required" : "RERA not required"),
      ]) || "Answered";
    }
    case "community": {
      const c = p.community;
      if (!c) return null;
      const setting = { gated_with_clubhouse: "gated with clubhouse", standalone: "standalone", either: "gated or standalone" };
      return join([c.setting && setting[c.setting], c.mustHaves.length > 0 && `needs ${c.mustHaves.join(", ").replace("_", " ")}`]) || "Answered";
    }
    case "infrastructure":
    case "lifestyle": {
      const ratings = q === "infrastructure" ? p.infrastructure?.ratings : p.lifestyle?.ratings;
      if (!ratings) return null;
      const labels = (q === "infrastructure" ? INFRA_LABELS : LIFESTYLE_LABELS) as Record<string, string>;
      const short = (k: string) => labels[k].replace(/ \(.*\)/, "").toLowerCase();
      const pick = (v: string) => Object.entries(ratings).filter(([, r]) => r === v).map(([k]) => short(k));
      const must = pick("must_have");
      const care = pick("dont_care");
      return join([must.length > 0 && `must: ${must.join(", ")}`, care.length > 0 && `don't care: ${care.join(", ")}`]) || "All nice-to-have";
    }
    case "dealbreakers": {
      const t = p.dealbreakers?.text;
      return t ? (t.length > 80 ? t.slice(0, 77) + "..." : t) : "None";
    }
  }
}

/** One line per question for the "Your Search" sidebar. */
export function summaryLines(p: BuyerProfile): SummaryLine[] {
  return QUESTIONS.map(({ id, title }) => {
    if (id === "schools" && !schoolsQuestionApplies(p) && p.schools === undefined) {
      return { id, title, state: "not_applicable", text: null };
    }
    if (p[id] !== undefined) return { id, title, state: "answered", text: summarise(p, id) };
    if (p.skipped.includes(id)) return { id, title, state: "skipped", text: null };
    return { id, title, state: "pending", text: null };
  });
}
