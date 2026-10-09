"use client";

import { useState } from "react";
import { HUB_LABELS, INFRA_LABELS, LIFESTYLE_LABELS } from "@/config/questions";
import {
  INFRA_ITEMS,
  LIFESTYLE_ITEMS,
  workHub,
  type BuyerProfile,
  type Importance,
  type QuestionId,
} from "@/lib/schemas";
import { Chip, Field, NumberInput, PrimaryButton, toggle } from "./ui";

export interface WidgetProps {
  profile: BuyerProfile;
  busy: boolean;
  onSubmit: (answer: unknown) => void;
}

const HUBS = workHub.options.filter((h) => h !== "other");
const lakh = (rupees: number | undefined) => (rupees === undefined ? "" : String(rupees / 100_000));
const toRupees = (v: string, unit: number) => (v.trim() === "" || Number.isNaN(Number(v)) ? undefined : Math.round(Number(v) * unit));

function Household({ profile, busy, onSubmit }: WidgetProps) {
  const h = profile.household;
  const [adults, setAdults] = useState<number | undefined>(h?.adults);
  const [kids, setKids] = useState<number[]>(h?.kidAges ?? []);
  const [parents, setParents] = useState(h?.parentsLiving ?? false);
  const [pets, setPets] = useState(h?.pets ?? false);
  return (
    <div className="space-y-4">
      <Field label="Adults">
        {[1, 2, 3, 4].map((n) => (
          <Chip key={n} selected={adults === n} onClick={() => setAdults(n)}>{n === 4 ? "4+" : n}</Chip>
        ))}
      </Field>
      <Field label="Kids (tap an age to add; tap again to remove)">
        {Array.from({ length: 19 }, (_, age) => (
          <Chip key={age} selected={kids.includes(age)} onClick={() => setKids(toggle(kids, age).sort((a, b) => a - b))}>{age}</Chip>
        ))}
      </Field>
      <Field label="Also in the home">
        <Chip selected={parents} onClick={() => setParents(!parents)}>Parents</Chip>
        <Chip selected={pets} onClick={() => setPets(!pets)}>Pets</Chip>
      </Field>
      <PrimaryButton disabled={busy || adults === undefined} onClick={() => onSubmit({ adults, kidAges: kids, parentsLiving: parents, pets })}>Continue</PrimaryButton>
    </div>
  );
}

function Work({ profile, busy, onSubmit }: WidgetProps) {
  const w = profile.work;
  const find = (who: "you" | "partner") => w?.workplaces.find((x) => x.who === who)?.hub;
  const [you, setYou] = useState(find("you"));
  const [partner, setPartner] = useState(find("partner"));
  const [days, setDays] = useState<number | undefined>(w?.officeDaysPerWeek);
  const [minutes, setMinutes] = useState(w?.maxCommuteMinutes ?? 45);
  const [mode, setMode] = useState(w?.mode);
  const hubChips = (value: typeof you, set: (h: typeof you) => void) =>
    HUBS.map((h) => <Chip key={h} selected={value === h} onClick={() => set(value === h ? undefined : h)}>{HUB_LABELS[h]}</Chip>);
  return (
    <div className="space-y-4">
      <Field label="Where do you work?">{hubChips(you, setYou)}</Field>
      <Field label="Where does your partner work? (optional)">{hubChips(partner, setPartner)}</Field>
      <Field label="Office days per week">
        {[0, 1, 2, 3, 4, 5, 6].map((n) => <Chip key={n} selected={days === n} onClick={() => setDays(n)}>{n}</Chip>)}
      </Field>
      <label className="block space-y-1 text-sm font-medium text-stone-700">
        Longest one-way commute at peak hour: {minutes} min
        <input type="range" min={15} max={120} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className="block w-full max-w-sm accent-emerald-700" />
      </label>
      <Field label="How will you travel?">
        {([["car", "Car"], ["two_wheeler", "Two-wheeler"], ["metro", "Metro"], ["cab_bus", "Cab or bus"]] as const).map(([v, label]) => (
          <Chip key={v} selected={mode === v} onClick={() => setMode(v)}>{label}</Chip>
        ))}
      </Field>
      <PrimaryButton
        disabled={busy}
        onClick={() =>
          onSubmit({
            workplaces: [you && { who: "you", hub: you }, partner && { who: "partner", hub: partner }].filter(Boolean),
            officeDaysPerWeek: days,
            maxCommuteMinutes: minutes,
            mode,
          })
        }
      >Continue</PrimaryButton>
    </div>
  );
}

function Schools({ profile, busy, onSubmit }: WidgetProps) {
  const s = profile.schools;
  const [board, setBoard] = useState(s?.board);
  const [run, setRun] = useState(s?.maxSchoolRunMinutes);
  return (
    <div className="space-y-4">
      <Field label="Preferred board">
        {(["CBSE", "ICSE", "IB/IGCSE", "State", "open"] as const).map((b) => (
          <Chip key={b} selected={board === b} onClick={() => setBoard(b)}>{b === "open" ? "No preference" : b}</Chip>
        ))}
      </Field>
      <Field label="Farthest school run">
        {[10, 15, 20, 30].map((m) => <Chip key={m} selected={run === m} onClick={() => setRun(m)}>{m} min</Chip>)}
      </Field>
      <PrimaryButton disabled={busy || (board === undefined && run === undefined)} onClick={() => onSubmit({ board, maxSchoolRunMinutes: run })}>Continue</PrimaryButton>
    </div>
  );
}

function Budget({ profile, busy, onSubmit }: WidgetProps) {
  const b = profile.budget;
  const [low, setLow] = useState(lakh(b?.allInBudget?.min));
  const [high, setHigh] = useState(lakh(b?.allInBudget?.max));
  const [down, setDown] = useState(lakh(b?.downPayment));
  const [income, setIncome] = useState(lakh(b?.householdMonthlyIncome));
  const [emis, setEmis] = useState(b?.existingMonthlyEmis === undefined ? "" : String(b.existingMonthlyEmis / 1000));
  const max = toRupees(high || low, 100_000);
  const min = toRupees(low || high, 100_000);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <NumberInput label="All-in budget, from" value={low} onChange={setLow} suffix="lakh" />
        <NumberInput label="to (optional)" value={high} onChange={setHigh} suffix="lakh" />
      </div>
      <div className="flex flex-wrap gap-4">
        <NumberInput label="Down payment" value={down} onChange={setDown} suffix="lakh" />
        <NumberInput label="Household income" value={income} onChange={setIncome} suffix="lakh per month" />
        <NumberInput label="Existing EMIs" value={emis} onChange={setEmis} suffix="thousand per month" />
      </div>
      <p className="text-xs text-stone-500">100 lakh = 1 crore. Leave anything blank that you would rather not say.</p>
      <PrimaryButton
        disabled={busy || (max === undefined && toRupees(down, 100_000) === undefined)}
        onClick={() =>
          onSubmit({
            allInBudget: min !== undefined && max !== undefined ? { min: Math.min(min, max), max: Math.max(min, max) } : undefined,
            downPayment: toRupees(down, 100_000),
            householdMonthlyIncome: toRupees(income, 100_000),
            existingMonthlyEmis: toRupees(emis, 1000),
          })
        }
      >Continue</PrimaryButton>
    </div>
  );
}

function Property({ profile, busy, onSubmit }: WidgetProps) {
  const p = profile.property;
  const [types, setTypes] = useState(p?.types ?? []);
  const [statuses, setStatuses] = useState(p?.statuses ?? []);
  const [bhk, setBhk] = useState(p?.minBhk);
  const [carpet, setCarpet] = useState(p?.minCarpetSqft === undefined ? "" : String(p.minCarpetSqft));
  return (
    <div className="space-y-4">
      <Field label="Type (pick any)">
        {([["apartment", "Apartment"], ["villa", "Villa"], ["independent_house", "Independent house"], ["plot", "Plot"]] as const).map(([v, l]) => (
          <Chip key={v} selected={types.includes(v)} onClick={() => setTypes(toggle(types, v))}>{l}</Chip>
        ))}
      </Field>
      <Field label="Stage (pick any)">
        {([["ready", "Ready to move"], ["under_construction", "Under construction"], ["resale", "Resale"]] as const).map(([v, l]) => (
          <Chip key={v} selected={statuses.includes(v)} onClick={() => setStatuses(toggle(statuses, v))}>{l}</Chip>
        ))}
      </Field>
      <Field label="Minimum bedrooms">
        {[1, 2, 3, 4].map((n) => <Chip key={n} selected={bhk === n} onClick={() => setBhk(n)}>{n === 4 ? "4+" : n} BHK</Chip>)}
      </Field>
      <NumberInput label="Minimum carpet area (optional)" value={carpet} onChange={setCarpet} suffix="sq ft" step="50" />
      <PrimaryButton disabled={busy || (types.length === 0 && statuses.length === 0 && bhk === undefined)} onClick={() => onSubmit({ types, statuses, minBhk: bhk, minCarpetSqft: toRupees(carpet, 1) })}>Continue</PrimaryButton>
    </div>
  );
}

function Legal({ profile, busy, onSubmit }: WidgetProps) {
  const [khata, setKhata] = useState(profile.legal?.khata);
  const [rera, setRera] = useState(profile.legal?.reraWithOcCcRequired);
  return (
    <div className="space-y-4">
      <Field label="Khata">
        <Chip selected={khata === "a_only"} onClick={() => setKhata("a_only")}>A-khata only</Chip>
        <Chip selected={khata === "b_acceptable"} onClick={() => setKhata("b_acceptable")}>B-khata is acceptable</Chip>
      </Field>
      <Field label="RERA registration with OC/CC">
        <Chip selected={rera === true} onClick={() => setRera(true)}>Required</Chip>
        <Chip selected={rera === false} onClick={() => setRera(false)}>Not required</Chip>
      </Field>
      <PrimaryButton disabled={busy || (khata === undefined && rera === undefined)} onClick={() => onSubmit({ khata, reraWithOcCcRequired: rera })}>Continue</PrimaryButton>
    </div>
  );
}

function Community({ profile, busy, onSubmit }: WidgetProps) {
  const [setting, setSetting] = useState(profile.community?.setting);
  const [must, setMust] = useState(profile.community?.mustHaves ?? []);
  return (
    <div className="space-y-4">
      <Field label="Setting">
        {([["gated_with_clubhouse", "Gated with clubhouse"], ["standalone", "Standalone"], ["either", "Either is fine"]] as const).map(([v, l]) => (
          <Chip key={v} selected={setting === v} onClick={() => setSetting(v)}>{l}</Chip>
        ))}
      </Field>
      <Field label="Must-haves (pick any)">
        {([["parking", "Parking"], ["power_backup", "Power backup"], ["lift", "Lift"]] as const).map(([v, l]) => (
          <Chip key={v} selected={must.includes(v)} onClick={() => setMust(toggle(must, v))}>{l}</Chip>
        ))}
      </Field>
      <PrimaryButton disabled={busy || (setting === undefined && must.length === 0)} onClick={() => onSubmit({ setting, mustHaves: must })}>Continue</PrimaryButton>
    </div>
  );
}

const LEVELS: [Importance, string][] = [["must_have", "Must-have"], ["nice_to_have", "Nice to have"], ["dont_care", "Don't care"]];

function Ratings<K extends string>({ items, labels, initial, busy, onSubmit }: {
  items: readonly K[]; labels: Record<K, string>; initial: Partial<Record<K, Importance>>; busy: boolean; onSubmit: (a: unknown) => void;
}) {
  const [ratings, setRatings] = useState<Partial<Record<K, Importance>>>(initial);
  return (
    <div className="space-y-4">
      {items.map((k) => (
        <Field key={k} label={labels[k]}>
          {LEVELS.map(([v, l]) => <Chip key={v} selected={ratings[k] === v} onClick={() => setRatings({ ...ratings, [k]: v })}>{l}</Chip>)}
        </Field>
      ))}
      <p className="text-xs text-stone-500">Anything you leave unrated counts as nice to have.</p>
      <PrimaryButton disabled={busy || Object.keys(ratings).length === 0} onClick={() => onSubmit({ ratings })}>Continue</PrimaryButton>
    </div>
  );
}

function Dealbreakers({ profile, busy, onSubmit }: WidgetProps) {
  const [text, setText] = useState(profile.dealbreakers?.text ?? "");
  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="For example: no ground-floor flats, nothing near a flyover"
        className="w-full rounded-md border border-stone-300 bg-white p-2 text-base"
      />
      <PrimaryButton disabled={busy || text.trim() === ""} onClick={() => onSubmit({ text: text.trim() })}>Continue</PrimaryButton>
    </div>
  );
}

/** Answers from the option widgets are sent as typed JSON; Dealbreakers sends its text as an answer object too. */
export function QuestionWidget({ question, ...props }: WidgetProps & { question: QuestionId }) {
  const { profile, busy, onSubmit } = props;
  switch (question) {
    case "household": return <Household {...props} />;
    case "work": return <Work {...props} />;
    case "schools": return <Schools {...props} />;
    case "budget": return <Budget {...props} />;
    case "property": return <Property {...props} />;
    case "legal": return <Legal {...props} />;
    case "community": return <Community {...props} />;
    case "infrastructure": return <Ratings items={INFRA_ITEMS} labels={INFRA_LABELS} initial={profile.infrastructure?.ratings ?? {}} busy={busy} onSubmit={onSubmit} />;
    case "lifestyle": return <Ratings items={LIFESTYLE_ITEMS} labels={LIFESTYLE_LABELS} initial={profile.lifestyle?.ratings ?? {}} busy={busy} onSubmit={onSubmit} />;
    case "dealbreakers": return <Dealbreakers {...props} />;
  }
}
