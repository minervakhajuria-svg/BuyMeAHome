import { z } from "zod";
import { mentionsProtectedAttribute } from "@/lib/guards";
import { isExtractable, type Extractor } from "@/lib/intake/extract";
import { nextQuestion } from "@/lib/intake/flow";
import { TOKEN_PATTERN, type SessionStore } from "@/lib/session/store";
import {
  applyPatch,
  buyerProfile,
  profilePatch,
  questionId,
  type BuyerProfile,
  type QuestionId,
} from "@/lib/schemas";

const token = z.string().regex(TOKEN_PATTERN).optional();

export const intakeRequest = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answer"), token, question: questionId, answer: z.unknown() }),
  z.object({ kind: z.literal("skip"), token, question: questionId }),
  z.object({ kind: z.literal("text"), token, question: questionId, text: z.string().trim().min(1).max(1000) }),
]);
export type IntakeRequest = z.infer<typeof intakeRequest>;

export type IntakeResponse =
  | { status: "ok"; token: string; profile: BuyerProfile; next: QuestionId | "done" }
  | { status: "clarify" | "declined"; message: string; token?: string }
  | { status: "error"; message: string };

export interface IntakeResult {
  httpStatus: number;
  body: IntakeResponse;
}

const DECLINED =
  "BuyMeAHome never filters or ranks by caste, religion or community, so I can't use that. Please tell me about the home, the location or your needs instead.";

const err = (httpStatus: number, message: string): IntakeResult => ({ httpStatus, body: { status: "error", message } });

export interface IntakeDeps {
  store: SessionStore;
  /** Lazy so a missing API key only affects free-text replies. */
  getExtractor: () => Extractor;
}

export async function handleIntake(deps: IntakeDeps, req: IntakeRequest): Promise<IntakeResult> {
  let record = req.token ? await deps.store.get(req.token) : null;
  if (req.token && !record) return err(404, "We could not find that session. Start a new search.");
  const current = record?.profile ?? buyerProfile.parse({});

  let next: BuyerProfile;
  if (req.kind === "skip") {
    next = applyPatch(current, { question: "skip", skipped: req.question });
  } else if (req.kind === "answer") {
    const parsed = profilePatch.safeParse({ question: req.question, answer: req.answer });
    if (!parsed.success) return err(400, "That answer was not in the expected format.");
    next = applyPatch(current, parsed.data);
  } else {
    if (mentionsProtectedAttribute(req.text)) {
      return { httpStatus: 200, body: { status: "declined", message: DECLINED, token: record?.token } };
    }
    if (req.question === "dealbreakers") {
      next = applyPatch(current, { question: "dealbreakers", answer: { text: req.text } });
    } else if (isExtractable(req.question)) {
      let result;
      try {
        result = await deps.getExtractor()(req.question, req.text);
      } catch {
        return err(503, "Typing an answer is unavailable right now. Please use the options instead.");
      }
      if (!result.ok) return { httpStatus: 200, body: { status: "clarify", message: result.followup, token: record?.token } };
      const parsed = profilePatch.safeParse({ question: req.question, answer: result.answer });
      if (!parsed.success) return err(400, "I could not read that answer.");
      next = applyPatch(current, parsed.data);
    } else {
      return err(400, "Please use the options for this question.");
    }
  }

  // The session (and its resume link) is created at the first accepted answer.
  if (record) await deps.store.save(record.token, next);
  else record = await deps.store.create(next);

  return { httpStatus: 200, body: { status: "ok", token: record.token, profile: next, next: nextQuestion(next) } };
}
