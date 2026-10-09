import type { ReactNode } from "react";
import { formatRupees } from "@/lib/format";
import type { PickFacts, ReportData } from "@/lib/report/facts";
import { DUE_DILIGENCE, DISCLAIMER, FIELD_TRIP } from "./static";
import { PrintButton } from "./PrintButton";

const NA = "Not available";
const na = (v: string | number | null | undefined, suffix = "") => (v === null || v === undefined || v === "" ? NA : `${v}${suffix}`);
const label = (s: string) => s.replace(/_/g, " ");

type OneTime = NonNullable<ReportData["input"]["affordability"]["picks"][number]["oneTimeAtTypical"][keyof ReportData["input"]["affordability"]["picks"][number]["oneTimeAtTypical"]]>;

/** Merge stages whose one-time costs are identical (ready and resale usually are). */
function groupOneTime(by: Record<string, OneTime | undefined>): [string, OneTime][] {
  const groups = new Map<string, { names: string[]; c: OneTime }>();
  for (const [status, c] of Object.entries(by)) {
    if (!c) continue;
    const g = groups.get(c.total + ":" + c.gst);
    if (g) g.names.push(label(status));
    else groups.set(c.total + ":" + c.gst, { names: [label(status)], c });
  }
  return [...groups.values()].map((g) => [g.names.join(" or "), g.c]);
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-10 break-inside-avoid-page">
      <h2 className="border-b border-stone-300 pb-2 text-xl font-semibold">
        {n}. {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((t, i) => <li key={i}>{t}</li>)}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>{head.map((h, i) => <th key={i} className="border-b border-stone-300 px-2 py-1.5 font-medium text-stone-600">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">{r.map((c, j) => <td key={j} className={`border-b border-stone-200 px-2 py-1.5 ${j === 0 ? "font-medium" : ""}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PickDetail({ p, narrative }: { p: PickFacts; narrative?: ReportData["narrative"]["picks"][number] }) {
  const facts: [string, string][] = [
    ["Typical price", p.typicalPrice ? `${p.typicalPrice.bhk} BHK, ${p.typicalPrice.low} to ${p.typicalPrice.high}` : NA],
    ["Price per sq ft", p.pricePerSqft ? `${formatRupees(p.pricePerSqft.min)} to ${formatRupees(p.pricePerSqft.max)}` : NA],
    ["Price trend", `${NA} (our data is a single snapshot)`],
    ["Nearest metro", `${na(p.nearestMetro)}${p.metroStatus ? ` (${p.metroStatus})` : ""}`],
    ["Peak-hour commute", p.commute.length ? p.commute.map((c) => `${label(c.destination)}: ${c.peakMinutes} min by ${label(c.mode)} (your limit ${c.yourLimitMinutes} min)`).join("; ") : NA],
    ["Schools for your board", p.schools.length ? p.schools.map((s) => `${s.name} (${s.board})`).join("; ") : NA],
    ["Water", na(p.notes.water)],
    ["Flood history", na(p.notes.flood)],
    ["Power", na(p.notes.power)],
    ["Air and noise", na(p.notes.airNoise)],
    ["Greenery", na(p.notes.greenery)],
    ["Hospitals", na(p.notes.hospitals)],
    ["Airport", p.airportMinutes === null ? NA : `${p.airportMinutes} min`],
  ];
  return (
    <article className="break-inside-avoid-page rounded-xl border border-stone-200 bg-white p-5">
      <h3 className="text-lg font-semibold">#{p.rank} {p.name}</h3>
      <p className="text-sm text-stone-500">{p.corridor} · score {p.totalScore} out of 100</p>
      {narrative && <p className="mt-2 text-sm">{narrative.reason}</p>}
      <div className="mt-3">
        <Table head={["Fact", "Detail"]} rows={facts.map(([k, v]) => [k, v])} />
      </div>
      <h4 className="mt-4 text-sm font-semibold">Projects to shortlist</h4>
      {p.shortlist.length ? (
        <Table
          head={["Project", "RERA number", "Stage", "Khata", "OC/CC"]}
          rows={p.shortlist.map((s) => [s.name, na(s.reraNumber), na(s.stage && label(s.stage)), na(s.khata), na(s.ocCc && label(s.ocCc))])}
        />
      ) : (
        <p className="text-sm text-stone-600">No project in our data meets your legal requirements here.</p>
      )}
      <h4 className="mt-4 text-sm font-semibold">Projects to skip</h4>
      {p.skip.length ? <Bullets items={p.skip.map((s) => `${s.name}: ${s.reason}`)} /> : <p className="text-sm text-stone-600">None in our data.</p>}
      {narrative && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><h4 className="text-sm font-semibold">What works</h4><Bullets items={narrative.whatWorks} /></div>
          <div><h4 className="text-sm font-semibold">What to watch</h4><Bullets items={narrative.whatToWatch} /></div>
        </div>
      )}
      {p.dataGaps.length > 0 && <p className="mt-3 text-xs text-stone-500">Not in our data: {p.dataGaps.join("; ")}.</p>}
    </article>
  );
}

export function ReportView({ report }: { report: ReportData }) {
  const { input, narrative, narrativeSource } = report;
  const byId = new Map(narrative.picks.map((p) => [p.microMarketId, p]));
  const a = input.affordability;
  const picks = input.picks;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 print:max-w-none print:py-0">
      {input.hasSampleData && (
        <div role="alert" className="mb-4 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Sample data: this report uses placeholder numbers for testing. Do not use it to make decisions.
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">Where to buy in Bangalore</h1>
          <p className="mt-1 text-sm text-stone-500">Data as of {input.dataAsOf}. {DISCLAIMER}</p>
        </div>
        <PrintButton />
      </header>

      <Section n={1} title="Headline">
        <p className="text-base">{narrative.headline}</p>
        {picks.length === 0 ? (
          <p className="text-sm">No micro-market passed your filters with enough data. See section 5 for why each was ruled out.</p>
        ) : (
          <ol className="space-y-2">
            {picks.map((p) => (
              <li key={p.microMarketId} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
                <span className="font-semibold">#{p.rank} {p.name}</span> <span className="text-stone-500">({p.totalScore} out of 100)</span>
                <div>{byId.get(p.microMarketId)?.reason}</div>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section n={2} title="Your situation and priorities">
        <p className="text-sm">{narrative.situation}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold">What matters most, in order</h3>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {input.priorities.map((p) => <li key={p.dimension}>{p.dimension} ({p.weightPercent}%)</li>)}
            </ol>
          </div>
          <div>
            <h3 className="text-sm font-semibold">What you told us</h3>
            <ul className="space-y-1 text-sm">
              {input.buyerAnswers.map((b) => <li key={b.question}><span className="font-medium">{b.question}:</span> {b.answer}</li>)}
            </ul>
          </div>
        </div>
        {input.usedDefaults.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold">Defaults we used where you skipped or left something blank</h3>
            <Bullets items={input.usedDefaults} />
          </div>
        )}
      </Section>

      <Section n={3} title="Affordability: the honest math">
        <p className="text-sm">
          {a.maxPrice
            ? `From the numbers you gave, your maximum price is ${a.maxPrice.text}, limited by ${a.maxPrice.binding === "emi_cap" ? "the comfortable EMI share of your income" : "your all-in budget"}.`
            : "A maximum price could not be worked out from the numbers you gave."}
        </p>
        {a.picks.map((ap) => {
          const pick = picks.find((p) => p.microMarketId === ap.microMarketId);
          return (
            <div key={ap.microMarketId} className="break-inside-avoid-page">
              <h3 className="text-sm font-semibold">{pick?.name} ({ap.bhk} BHK)</h3>
              <Table
                head={["Price point", "Price", "Loan", "Monthly EMI", "EMI as % of income (with existing EMIs)"]}
                rows={ap.points.map((pt) => [pt.label, pt.priceText, formatRupees(pt.loan), pt.emiText, pt.emiSharePct === null ? NA : `${pt.emiSharePct}%`])}
              />
              <p className="mt-2 text-sm">
                One-time costs at the typical price:{" "}
                {groupOneTime(ap.oneTimeAtTypical).map(([statuses, c]) => `${statuses} ${c.totalText} (stamp duty ${formatRupees(c.stampDuty)}, registration ${formatRupees(c.registration)}, GST ${formatRupees(c.gst)}, interiors ${formatRupees(c.interiors)}, deposits ${formatRupees(c.deposits)})`).join("; ")}.
              </p>
              <p className="text-sm">
                Ongoing: maintenance {ap.ongoing ? `${ap.ongoing.maintenanceText} a month` : NA}; property tax {ap.ongoing ? `${ap.ongoing.propertyTaxText} a year` : NA}. Keep a cash buffer of at least {ap.liquidityBufferText} after closing ({a.assumptions.minLiquidityBufferMonths} months of EMIs).
              </p>
            </div>
          );
        })}
        <p className="text-sm">Rules we apply: stay within a maximum price, keep the liquidity buffer after closing, and do not stretch beyond {a.assumptions.comfortableEmiSharePct}% of income on EMIs.</p>
        <p className="text-xs text-stone-500">Assumed interest rate {a.assumptions.interestRatePct}% over {a.assumptions.tenureYears} years. {a.assumptions.note}</p>
        {a.notAvailable.length > 0 && <Bullets items={a.notAvailable} />}
      </Section>

      <Section n={4} title="Your top picks in detail">
        {picks.map((p) => <PickDetail key={p.microMarketId} p={p} narrative={byId.get(p.microMarketId)} />)}
        {picks.length === 0 && <p className="text-sm">No top picks.</p>}
      </Section>

      <Section n={5} title="Backups, and ruled out and why">
        <h3 className="text-sm font-semibold">Backups</h3>
        {input.backups.length ? (
          <ul className="space-y-1 text-sm">
            {input.backups.map((b) => (
              <li key={b.microMarketId}>
                <span className="font-medium">#{b.rank} {b.name}</span> ({b.totalScore} out of 100). {narrative.backups.find((n) => n.microMarketId === b.microMarketId)?.note}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm">None.</p>}
        <h3 className="text-sm font-semibold">Ruled out</h3>
        {input.ruledOut.length ? (
          <ul className="space-y-2 text-sm">
            {input.ruledOut.map((r) => <li key={r.microMarketId}><span className="font-medium">{r.name}:</span> {r.reasons.join(" ")}</li>)}
          </ul>
        ) : <p className="text-sm">Nothing was ruled out.</p>}
      </Section>

      <Section n={6} title="Side by side">
        {picks.length > 0 && (
          <Table
            head={["", ...picks.map((p) => p.name)]}
            rows={[
              ["Overall score", ...picks.map((p) => `${p.totalScore} out of 100`)],
              ...picks[0].dimensions.map((d) => [d.dimension, ...picks.map((p) => na(p.dimensions.find((x) => x.dimension === d.dimension)?.score))]),
              ["Typical price", ...picks.map((p) => (p.typicalPrice ? `${p.typicalPrice.bhk} BHK, ${p.typicalPrice.low} to ${p.typicalPrice.high}` : NA))],
              ["Price per sq ft", ...picks.map((p) => (p.pricePerSqft ? `${formatRupees(p.pricePerSqft.min)} to ${formatRupees(p.pricePerSqft.max)}` : NA))],
              ["Commute", ...picks.map((p) => (p.commute.length ? p.commute.map((c) => `${c.peakMinutes} min to ${label(c.destination)}`).join(", ") : NA))],
              ["Nearest metro", ...picks.map((p) => `${na(p.nearestMetro)}${p.metroStatus ? ` (${p.metroStatus})` : ""}`)],
              ["Airport", ...picks.map((p) => (p.airportMinutes === null ? NA : `${p.airportMinutes} min`))],
            ]}
          />
        )}
      </Section>

      <Section n={7} title="Due-diligence checklist"><Bullets items={DUE_DILIGENCE} /></Section>
      <Section n={8} title="Field-trip plan"><Bullets items={FIELD_TRIP} /></Section>

      <Section n={9} title="Bottom line">
        <Bullets items={narrative.bottomLine} />
      </Section>

      <footer className="mt-10 border-t border-stone-300 pt-4 text-xs text-stone-500">
        <p>{DISCLAIMER} Data as of {input.dataAsOf}.</p>
        <p className="mt-1">Scores come from fixed rules in code; {narrativeSource === "llm" ? "the wording was written by an AI model from the data above and checked against it" : "the wording was generated from the data above"}.</p>
      </footer>
    </main>
  );
}
