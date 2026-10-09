import { NextResponse } from "next/server";
import { anthropicModelCall, createExtractor } from "@/lib/intake/extract";
import { handleIntake, intakeRequest } from "@/lib/intake/handle";
import { getStore } from "@/lib/session/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = intakeRequest.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ status: "error", message: "Invalid request." }, { status: 400 });
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
