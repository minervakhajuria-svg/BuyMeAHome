import { z } from "zod";
import type { EmailSender } from "@/lib/email/send";
import type { ModelCall } from "@/lib/intake/extract";
import { nextQuestion } from "@/lib/intake/flow";
import type { SessionStore } from "@/lib/session/store";
import { TOKEN_PATTERN } from "@/lib/session/store";
import type { Dataset } from "@/lib/schemas";
import { generateReport } from "./generate";
import type { ReportStore } from "./store";

export { CONSENT_TEXT } from "@/lib/consent";

export const deliverRequest = z.object({
  token: z.string().regex(TOKEN_PATTERN),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  consent: z.literal(true),
});
export type DeliverRequest = z.infer<typeof deliverRequest>;

export type DeliverResult =
  | { status: "ok"; reportToken: string; reportUrl: string; emailSent: boolean }
  | { status: "error"; httpStatus: 404 | 409 | 502; message: string };

export interface DeliverDeps {
  sessions: SessionStore;
  reports: ReportStore;
  loadDataset: () => Promise<Dataset>;
  /** Undefined means "no model configured": the template narrative is used. */
  modelCall?: () => ModelCall;
  sendEmail: EmailSender;
  baseUrl: string;
  now?: () => Date;
}

export async function deliverReport(deps: DeliverDeps, req: DeliverRequest): Promise<DeliverResult> {
  const session = await deps.sessions.get(req.token);
  if (!session) return { status: "error", httpStatus: 404, message: "We could not find your session. Start a new search." };
  if (nextQuestion(session.profile) !== "done") {
    return { status: "error", httpStatus: 409, message: "Please answer or skip all 10 questions first." };
  }

  // Consent is recorded before anything is generated or sent.
  await deps.sessions.setContact(session.token, req.email, (deps.now ?? (() => new Date()))());

  let dataset: Dataset;
  try {
    dataset = await deps.loadDataset();
  } catch {
    return { status: "error", httpStatus: 502, message: "We could not load our data just now. Please try again in a few minutes." };
  }

  // The email address is never part of what the report writer sees: only the profile is passed on.
  const report = await generateReport(session.profile, dataset, { call: deps.modelCall?.() });
  const { token: reportToken } = await deps.reports.save(session.id, report);
  const reportUrl = `${deps.baseUrl.replace(/\/$/, "")}/report/${reportToken}`;
  const emailSent = await deps.sendEmail({ to: req.email, reportUrl, hasSampleData: report.input.hasSampleData });
  return { status: "ok", reportToken, reportUrl, emailSent };
}
