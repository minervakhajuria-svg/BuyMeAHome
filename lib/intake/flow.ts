import { QUESTION_IDS, schoolsQuestionApplies, type BuyerProfile, type QuestionId } from "@/lib/schemas";

/** The first question that is neither answered nor skipped; Q3 is only asked when Q1 has kids. */
export function nextQuestion(profile: BuyerProfile): QuestionId | "done" {
  for (const q of QUESTION_IDS) {
    if (q === "schools" && !schoolsQuestionApplies(profile)) continue;
    if (profile[q] !== undefined || profile.skipped.includes(q)) continue;
    return q;
  }
  return "done";
}

export function answeredCount(profile: BuyerProfile): number {
  return QUESTION_IDS.filter((q) => profile[q] !== undefined).length;
}
