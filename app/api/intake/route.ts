import { NextResponse } from "next/server";
import { anthropicModelCall, createExtractor } from "@/lib/intake/extract";
import { handleIntake, intakeRequest } from "@/lib/intake/handle";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getStore } from "@/lib/session/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = intakeRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
  }
  // Typed answers call the model, so they get a much tighter limit than option taps.
  const ip = clientIp(req);
  const limit = parsed.data.kind === "text" ? rateLimit(`intake:text:${ip}`, 20, 10 * 60_000) : rateLimit(`intake:${ip}`, 300, 10 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { status: "error", message: "You are going a bit fast. Please wait a moment and try again." },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }
  try {
    // Profiles and free text are never logged.
    const result = await handleIntake(
      { store: getStore(), getExtractor: () => createExtractor(anthropicModelCall()) },
      parsed.data,
    );
    return NextResponse.json(result.body, { status: result.httpStatus });
  } catch {
    return NextResponse.json({ status: "error", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
