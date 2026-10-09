"use client";

import type { ReactNode } from "react";

export function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        selected ? "border-emerald-700 bg-emerald-700 text-white" : "border-stone-300 bg-white text-stone-800 hover:border-stone-500"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-stone-700">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function NumberInput({
  label, value, onChange, suffix, step = "any",
}: { label: string; value: string; onChange: (v: string) => void; suffix: string; step?: string }) {
  return (
    <label className="block text-sm text-stone-700">
      <span className="font-medium">{label}</span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-base"
        />
        <span className="text-stone-500">{suffix}</span>
      </span>
    </label>
  );
}

export function PrimaryButton({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
