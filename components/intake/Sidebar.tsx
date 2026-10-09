"use client";

import { useState } from "react";
import { summaryLines } from "@/lib/profile/summary";
import type { BuyerProfile, QuestionId } from "@/lib/schemas";

interface Props {
  profile: BuyerProfile;
  active: QuestionId | "done";
  resumeUrl: string | null;
  onEdit: (q: QuestionId) => void;
}

export function Sidebar({ profile, active, resumeUrl, onEdit }: Props) {
  const [copied, setCopied] = useState(false);
  const lines = summaryLines(profile);

  async function copy() {
    if (!resumeUrl) return;
    try {
      await navigator.clipboard.writeText(resumeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link to resume later:", resumeUrl);
    }
  }

  return (
    <aside aria-label="Your Search" className="rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="text-base font-semibold">Your Search</h2>
      <ol className="mt-3 space-y-3">
        {lines.map((l, i) => (
          <li key={l.id} className={`text-sm ${active === l.id ? "-mx-2 rounded-md bg-emerald-50 px-2 py-1.5" : ""}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-stone-700">{i + 1}. {l.title}</span>
              {(l.state === "answered" || l.state === "skipped") && (
                <button type="button" onClick={() => onEdit(l.id)} className="text-xs text-emerald-800 underline">Edit</button>
              )}
            </div>
            <div className="text-stone-600">
              {l.state === "answered" && l.text}
              {l.state === "skipped" && <span className="italic text-stone-500">Skipped (defaults used)</span>}
              {l.state === "pending" && <span className="text-stone-400">Not answered yet</span>}
              {l.state === "not_applicable" && <span className="text-stone-400">Only asked if you have kids</span>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 border-t border-stone-200 pt-3 text-sm">
        {resumeUrl ? (
          <button type="button" onClick={copy} className="text-emerald-800 underline">
            {copied ? "Link copied" : "Copy link to resume later"}
          </button>
        ) : (
          <span className="text-stone-400">A resume link appears after your first answer</span>
        )}
      </div>
    </aside>
  );
}
