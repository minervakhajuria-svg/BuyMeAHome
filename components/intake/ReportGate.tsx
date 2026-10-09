"use client";

import { useState } from "react";
import { CONSENT_TEXT } from "@/lib/consent";

type Phase = { name: "form" } | { name: "working" } | { name: "done"; url: string; emailSent: boolean; email: string };

export function ReportGate({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const [error, setError] = useState<string | null>(null);
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPhase({ name: "working" });
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, email, consent }),
      });
      const data = await res.json();
      if (data.status === "ok") setPhase({ name: "done", url: data.reportUrl, emailSent: data.emailSent, email });
      else {
        setError(data.message ?? "Something went wrong.");
        setPhase({ name: "form" });
      }
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPhase({ name: "form" });
    }
  }

  if (phase.name === "done") {
    return (
      <div className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm" role="status">
        <p className="text-base font-semibold">Your report is ready.</p>
        <p>
          {phase.emailSent
            ? `We emailed the link to ${phase.email}. It can take a minute to arrive; check spam too.`
            : "We could not send the email, so please open your report here and save the link."}
        </p>
        <a href={phase.url} className="inline-block rounded-md bg-emerald-700 px-4 py-2 font-medium text-white hover:bg-emerald-800">Open your report</a>
        <p className="break-all text-xs text-stone-600">Anyone with this link can open the report: {phase.url}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="text-base font-semibold">That's everything. Get your report.</h2>
      <p className="text-sm text-stone-700">
        <span className="font-medium">Privacy:</span> we collect your email and the answers you gave, only to build your report and send you its link.
        Our service providers process them for us: Supabase stores them, Anthropic&apos;s AI model reads typed answers and writes the report wording
        (your email is never sent to it), and Resend delivers the email. Anyone who has your report link can open the report.
        {contact ? ` To ask about your data, write to ${contact}.` : ""}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-emerald-700" />
        <span>{CONSENT_TEXT}</span>
      </label>
      <label className="block text-sm font-medium text-stone-700">
        Your email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 block w-full max-w-sm rounded-md border border-stone-300 bg-white px-3 py-2 text-base"
        />
      </label>
      {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
      <button
        type="submit"
        disabled={!consent || !email || phase.name === "working"}
        className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {phase.name === "working" ? "Creating your report..." : "Get my report"}
      </button>
      {phase.name === "working" && <p className="text-sm text-stone-600" aria-live="polite">This can take up to a minute. Please keep this page open.</p>}
      <p className="text-xs text-stone-500">Free while we test. Not financial or legal advice.</p>
    </form>
  );
}
