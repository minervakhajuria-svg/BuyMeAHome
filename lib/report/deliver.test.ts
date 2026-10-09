import { describe, expect, it, vi } from "vitest";
import { buildReportEmail, createEmailSender } from "@/lib/email/send";
import { loadSampleDataset } from "@/lib/dataset/sample";
import { rateLimit } from "@/lib/rateLimit";
import { buyerProfile } from "@/lib/schemas";
import { MemorySessionStore } from "@/lib/session/store";
import { deliverReport, deliverRequest, type DeliverDeps } from "./deliver";
import { MemoryReportStore } from "./store";

const done = buyerProfile.parse({
  household: { adults: 2, kidAges: [] },
  budget: { allInBudget: { min: 12_000_000, max: 14_000_000 }, downPayment: 3_000_000 },
  skipped: ["work", "schools", "property", "legal", "community", "infrastructure", "lifestyle", "dealbreakers"],
});

function setup(over: Partial<DeliverDeps> = {}) {
  const sessions = new MemorySessionStore();
  const reports = new MemoryReportStore();
  const sendEmail = vi.fn().mockResolvedValue(true);
  const deps: DeliverDeps = { sessions, reports, loadDataset: async () => loadSampleDataset(), sendEmail, baseUrl: "https://app.example/", now: () => new Date("2026-10-09T10:00:00Z"), ...over };
  return { sessions, reports, sendEmail, deps };
}
const req = (token: string) => deliverRequest.parse({ token, email: "  Friend@Example.com ", consent: true });

describe("deliverRequest", () => {
  it("requires consent, a valid email and a token; normalises the email", () => {
    const t = "a".repeat(22);
    expect(deliverRequest.parse({ token: t, email: " A@B.co ", consent: true }).email).toBe("a@b.co");
    expect(() => deliverRequest.parse({ token: t, email: "a@b.co", consent: false })).toThrow();
    expect(() => deliverRequest.parse({ token: t, email: "nope", consent: true })).toThrow();
    expect(() => deliverRequest.parse({ token: "short", email: "a@b.co", consent: true })).toThrow();
  });
});

describe("deliverReport", () => {
  it("records consent, saves the report and emails its link", async () => {
    const { sessions, reports, sendEmail, deps } = setup();
    const { token } = await sessions.create(done);
    const res = await deliverReport(deps, req(token));
    if (res.status !== "ok") throw new Error("expected ok");
    expect(sessions.contacts.get(token)).toEqual({ email: "friend@example.com", consentAt: new Date("2026-10-09T10:00:00Z") });
    expect(res.reportUrl).toBe(`https://app.example/report/${res.reportToken}`);
    expect(await reports.get(res.reportToken)).not.toBeNull();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith({ to: "friend@example.com", reportUrl: res.reportUrl, hasSampleData: true });
    expect(res.emailSent).toBe(true);
  });

  it("never lets the email reach the report data or the model", async () => {
    const call = vi.fn();
    const { sessions, reports, deps } = setup({ modelCall: () => call });
    const { token } = await sessions.create(done);
    const res = await deliverReport(deps, req(token));
    if (res.status !== "ok") throw new Error("expected ok");
    expect(JSON.stringify(await reports.get(res.reportToken))).not.toContain("example.com");
    for (const [args] of call.mock.calls) expect(JSON.stringify(args)).not.toContain("example.com");
  });

  it("still returns the report link when the email fails", async () => {
    const { sessions, deps } = setup({ sendEmail: vi.fn().mockResolvedValue(false) });
    const { token } = await sessions.create(done);
    const res = await deliverReport(deps, req(token));
    expect(res).toMatchObject({ status: "ok", emailSent: false });
  });

  it("rejects an unknown session and an unfinished intake, and stores nothing", async () => {
    const { sessions, reports, sendEmail, deps } = setup();
    expect(await deliverReport(deps, req("z".repeat(22)))).toMatchObject({ status: "error", httpStatus: 404 });
    const { token } = await sessions.create(buyerProfile.parse({}));
    expect(await deliverReport(deps, req(token))).toMatchObject({ status: "error", httpStatus: 409 });
    expect(sessions.contacts.size).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(await reports.get("x".repeat(22))).toBeNull();
  });

  it("reports a data-loading failure without sending anything", async () => {
    const { sessions, sendEmail, deps } = setup({ loadDataset: async () => { throw new Error("db down"); } });
    const { token } = await sessions.create(done);
    expect(await deliverReport(deps, req(token))).toMatchObject({ status: "error", httpStatus: 502 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("email", () => {
  it("builds a link-only message that escapes the URL and flags sample data", () => {
    const m = buildReportEmail({ reportUrl: 'https://x/report/a"b<c', hasSampleData: true });
    expect(m.html).toContain("https://x/report/a&quot;b&lt;c");
    expect(m.text).toContain("sample data");
    expect(m.text).toMatch(/not financial or legal advice/i);
    expect(buildReportEmail({ reportUrl: "https://x", hasSampleData: false }).text).not.toContain("sample data");
  });
  it("without Resend settings reports 'not sent' instead of throwing", async () => {
    expect(await createEmailSender({} as NodeJS.ProcessEnv)({ to: "a@b.co", reportUrl: "https://x", hasSampleData: false })).toBe(false);
  });
});

describe("rateLimit", () => {
  it("allows up to the limit per window, then blocks until reset", () => {
    const k = "test:" + Math.random();
    const r = [1, 2, 3, 4].map((i) => rateLimit(k, 3, 1000, 10_000 + i));
    expect(r.map((x) => x.ok)).toEqual([true, true, true, false]);
    expect(r[3].retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit(k, 3, 1000, 12_000).ok).toBe(true);
  });
});
