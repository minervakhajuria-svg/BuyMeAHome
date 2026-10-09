import { describe, expect, it } from "vitest";
import { POST } from "./route";

const post = (body: unknown, ip: string) =>
  POST(new Request("http://localhost/api/report", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /api/report", () => {
  it("rejects a missing consent with 400 and never reaches the session", async () => {
    const res = await post({ token: "a".repeat(22), email: "a@b.co", consent: false }, "10.0.0.1");
    expect(res.status).toBe(400);
  });

  it("404s an unknown session, then rate-limits repeated requests from one address", async () => {
    const ok = { token: "b".repeat(22), email: "a@b.co", consent: true };
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await post(ok, "10.0.0.2")).status);
    expect(statuses.slice(0, 3)).toEqual([404, 404, 404]); // per-session limit is 3 an hour
    expect(statuses.slice(3)).toEqual([429, 429, 429]);
  });
});
