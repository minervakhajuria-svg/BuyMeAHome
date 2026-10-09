import { NextResponse } from "next/server";
import { loadDataset } from "@/lib/dataset/load";
import { createEmailSender } from "@/lib/email/send";
import { anthropicModelCall } from "@/lib/intake/extract";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { deliverReport, deliverRequest } from "@/lib/report/deliver";
import { getReportStore } from "@/lib/report/store";
import { getStore } from "@/lib/session/store";

export const dynamic = "force-dynamic";
// Generating a report can involve one or two model calls.
export const maxDuration = 300;

const HOUR = 60 * 60 * 1000;

export async function POST(req: Request) {
  const parsed = deliverRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Please enter a valid email and tick the consent box." }, { status: 400 });
  }
  const limits = [rateLimit(`report:ip:${clientIp(req)}`, 5, HOUR), rateLimit(`report:session:${parsed.data.token}`, 3, HOUR)];
  const blocked = limits.find((l) => !l.ok);
  if (blocked) {
    return NextResponse.json(
      { status: "error", message: "You have requested several reports recently. Please try again later." },
      { status: 429, headers: { "retry-after": String(blocked.retryAfterSeconds) } },
    );
  }

  try {
    // Neither the email address nor the profile is logged.
    const result = await deliverReport(
      {
        sessions: getStore(),
        reports: getReportStore(),
        loadDataset,
        modelCall: process.env.ANTHROPIC_MODEL ? anthropicModelCall : undefined,
        sendEmail: createEmailSender(),
        baseUrl: process.env.APP_URL || new URL(req.url).origin,
      },
      parsed.data,
    );
    if (result.status === "error") return NextResponse.json(result, { status: result.httpStatus });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ status: "error", message: "Something went wrong creating your report. Please try again." }, { status: 500 });
  }
}
