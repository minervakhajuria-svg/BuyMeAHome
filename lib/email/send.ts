import { Resend } from "resend";

export interface ReportEmail {
  to: string;
  reportUrl: string;
  hasSampleData: boolean;
}

/** Returns true if the provider accepted the message. Never throws, never logs the address. */
export type EmailSender = (email: ReportEmail) => Promise<boolean>;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildReportEmail({ reportUrl, hasSampleData }: Pick<ReportEmail, "reportUrl" | "hasSampleData">) {
  const sample = hasSampleData ? "Note: this report was built from sample data for testing. Do not use it to make decisions.\n\n" : "";
  const text =
    `Your BuyMeAHome report is ready.\n\nOpen it here:\n${reportUrl}\n\n` +
    `${sample}Anyone with this link can open the report, so keep it private. You can save it as a PDF from the report page.\n\n` +
    "This is not financial or legal advice. Verify every fact before buying.";
  const html =
    `<p>Your BuyMeAHome report is ready.</p><p><a href="${esc(reportUrl)}">Open your report</a></p>` +
    (hasSampleData ? "<p><strong>Note:</strong> this report was built from sample data for testing. Do not use it to make decisions.</p>" : "") +
    "<p>Anyone with this link can open the report, so keep it private. You can save it as a PDF from the report page.</p>" +
    "<p style=\"color:#666;font-size:12px\">This is not financial or legal advice. Verify every fact before buying.</p>";
  return { subject: "Your BuyMeAHome report", text, html };
}

/** Resend when RESEND_API_KEY and EMAIL_FROM are set; otherwise a sender that reports "not sent". */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const key = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (!key || !from) return async () => false;
  const resend = new Resend(key);
  return async (email) => {
    try {
      const { error } = await resend.emails.send({ from, to: email.to, ...buildReportEmail(email) });
      return !error;
    } catch {
      return false;
    }
  };
}
