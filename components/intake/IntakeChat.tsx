"use client";

import { useEffect, useRef, useState } from "react";
import { QUESTION_BY_ID, QUESTIONS } from "@/config/questions";
import { nextQuestion } from "@/lib/intake/flow";
import { summaryLines } from "@/lib/profile/summary";
import { buyerProfile, type BuyerProfile, type QuestionId } from "@/lib/schemas";
import { ReportGate } from "./ReportGate";
import { Sidebar } from "./Sidebar";
import { QuestionWidget } from "./widgets";

interface Message {
  role: "assistant" | "user";
  text: string;
}

const TEXT_QUESTIONS: QuestionId[] = ["household", "work", "budget"];

const askText = (q: QuestionId) => {
  const def = QUESTION_BY_ID[q];
  const n = QUESTIONS.findIndex((x) => x.id === q) + 1;
  return `Question ${n} of 10. ${def.prompt}${def.hint ? " " + def.hint : ""}`;
};

export function IntakeChat({ initialToken, initialProfile }: { initialToken?: string; initialProfile?: BuyerProfile }) {
  const [token, setToken] = useState<string | undefined>(initialToken);
  const [profile, setProfile] = useState<BuyerProfile>(initialProfile ?? buyerProfile.parse({}));
  const [editing, setEditing] = useState<QuestionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [messages, setMessages] = useState<Message[]>(() => {
    const first = nextQuestion(initialProfile ?? buyerProfile.parse({}));
    const welcome = initialProfile
      ? "Welcome back. Your answers are in the sidebar and you can edit any of them."
      : "Hi! I will ask 10 short questions to find the best places in Bangalore to buy your home. You can skip any question, and edit any answer later.";
    return [{ role: "assistant", text: welcome }, ...(first === "done" ? [] : [{ role: "assistant" as const, text: askText(first) }])];
  });
  const [origin, setOrigin] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const next = nextQuestion(profile);
  const active: QuestionId | "done" = editing ?? next;
  const resumeUrl = token && origin ? `${origin}/chat/${token}` : null;

  useEffect(() => setOrigin(window.location.origin), []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, notice]);

  async function send(body: Record<string, unknown>, userText: string) {
    if (active === "done") return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, question: active, ...body }),
      });
      const data = await res.json();
      if (data.status === "ok") {
        if (!token) window.history.replaceState(null, "", `/chat/${data.token}`);
        setToken(data.token);
        setProfile(data.profile);
        setTyped("");
        const wasEditing = editing !== null;
        setEditing(null);
        setMessages((m) => {
          const out: Message[] = [...m, { role: "user", text: userText }];
          if (wasEditing) out.push({ role: "assistant", text: "Updated." });
          if (data.next === "done") {
            out.push({ role: "assistant", text: "That's all 10 questions. You can still edit any answer in the sidebar before you get your report." });
          } else if (!wasEditing || data.next !== nextQuestion(profile)) {
            out.push({ role: "assistant", text: askText(data.next) });
          }
          return out;
        });
      } else {
        if (data.token && !token) setToken(data.token);
        setNotice(data.message ?? "Something went wrong.");
      }
    } catch {
      setNotice("Could not reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const describe = (q: QuestionId, answer: unknown) =>
    summaryLines(buyerProfile.parse({ ...profile, [q]: answer })).find((l) => l.id === q)?.text ?? "Answered";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[1fr_320px]">
      <section className="min-w-0 space-y-4" aria-label="Chat">
        <div className="space-y-3" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "assistant" ? "bg-white border border-stone-200" : "ml-auto bg-emerald-700 text-white"}`}>
              {m.text}
            </div>
          ))}
          {notice && <div role="alert" className="max-w-[90%] rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{notice}</div>}
        </div>

        {active !== "done" && (
          <div key={active} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
            {editing && <div className="text-sm font-medium text-emerald-800">Editing: {QUESTION_BY_ID[active].title}</div>}
            <QuestionWidget
              question={active}
              profile={profile}
              busy={busy}
              onSubmit={(answer) => {
                // Dealbreakers are free text: send as text so the server can screen it.
                if (active === "dealbreakers") {
                  const text = (answer as { text: string }).text;
                  send({ kind: "text", text }, text);
                } else send({ kind: "answer", answer }, describe(active, answer));
              }}
            />
            {TEXT_QUESTIONS.includes(active) && (
              <form
                className="flex flex-col gap-2 border-t border-stone-200 pt-3 sm:flex-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typed.trim()) send({ kind: "text", text: typed.trim() }, typed.trim());
                }}
              >
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  maxLength={1000}
                  placeholder="Or type it in your own words"
                  aria-label="Type your answer"
                  className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-base"
                />
                <button type="submit" disabled={busy || !typed.trim()} className="rounded-md border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50">Send</button>
              </form>
            )}
            <div className="flex gap-4 text-sm">
              <button type="button" disabled={busy} onClick={() => send({ kind: "skip" }, "Skip")} className="text-stone-600 underline disabled:opacity-50">Skip this question</button>
              {editing && <button type="button" onClick={() => setEditing(null)} className="text-stone-600 underline">Cancel edit</button>}
            </div>
          </div>
        )}
        {active === "done" && token && <ReportGate token={token} />}
        <div ref={endRef} />
      </section>

      <div className="md:sticky md:top-6 md:self-start">
        <Sidebar profile={profile} active={active} resumeUrl={resumeUrl} onEdit={setEditing} />
      </div>
    </div>
  );
}
