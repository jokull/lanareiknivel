/**
 * Debt & equity over time — historic (exact, from Arion payment history +
 * HMS fjölbýli höfuðborgarsvæði vísitala anchors) and projected forward
 * (calculator's loan schedule engine + property growth assumption).
 *
 * Stacked areas: debt at the bottom, equity on top — together they equal
 * the property value envelope. The composition boundary steps down (a
 * "dent" in equity) every month a principal installment lands.
 *
 * Data: src/data/debt-equity.json — an example ships with the repo; build
 * your own from a bank payment-history JSON with `scripts/build-debt-equity.ts`
 * (see README).
 */
import { useMemo, useState } from "react";
import { defineChart, areaY, ruleX, dot, lineY, type ChartCurve } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scaleTime } from "d3-scale";
import { Chart } from "@tanstack/react-charts/tooltip";
import * as XLSX from "xlsx";
import { computeLoanSchedule } from "../calc";
import { buildCPISeries } from "../cpi";
import type { LoanInput, ScenarioConfig } from "../types";
import data from "../data/debt-equity.json";

// Example plan: 100k/mo extra principal on loan 2 from 2027.
const EXTRA_PRINCIPAL_BRACKET = { startYear: 2027, years: 5, amount: 100_000 };

// CPI path: Peningamál 2026/1 Tafla 4 (4.3% 2026–27, then the 2.5% target).
const CPI_SCENARIO: ScenarioConfig = {
  label: "Grunn",
  rateBrackets: [
    { startYear: 2026, years: 2, rate: 4.3 },
    { startYear: 2028, years: 23, rate: 2.5 },
  ],
};

interface Row {
  month: Date;
  debt: number;
  equity: number;
  property: number;
}

interface ExtraPayment {
  month: string;
  loanId: number;
  kind: "prepayment" | "pension";
  amount: number;
}

interface ExtraDot {
  date: Date;
  y: number;
  kind: "prepayment" | "pension";
  amount: number;
  loanId: number;
}

interface UploadedRow {
  loanId: number;
  action: string;
  date: Date;
  principal: number;
  total: number;
}

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function buildSeries(
  growthPct: number,
  extraPrincipal: boolean,
  horizonYears: number | null
): Row[] {
  const historic: Row[] = data.monthly.map((m) => ({
    month: new Date(`${m.month}-01T00:00:00Z`),
    debt: m.debt,
    equity: m.equity,
    property: m.property,
  }));

  const last = data.monthly[data.monthly.length - 1]!;
  const startMonth = addMonths(last.month, 1);
  const maxRemaining = Math.max(...data.loans.map((l) => l.remainingMonths));
  const horizonMonths = horizonYears != null ? horizonYears * 12 : maxRemaining;

  const cpiSeries = buildCPISeries(startMonth, horizonMonths, CPI_SCENARIO);
  const schedules = data.loans.map((l) => {
    const loan: LoanInput = {
      id: String(l.arionLoanId),
      name: l.id,
      balance: l.currentRemainingPrincipal,
      apr: l.currentApr,
      remainingMonths: l.remainingMonths,
      method: "annuity",
      extraBrackets: extraPrincipal ? [EXTRA_PRINCIPAL_BRACKET] : [],
      pensionPrincipal: 0,
      rateChanges: [],
    };
    return computeLoanSchedule(loan, startMonth, cpiSeries);
  });

  const projected: Row[] = [];
  let property = last.property;
  for (let i = 0; i < horizonMonths; i++) {
    const month = addMonths(startMonth, i);
    const debt = schedules.reduce((sum, s) => sum + (s[i]?.balance ?? 0), 0);
    property = property * Math.pow(1 + growthPct / 100, 1 / 12);
    projected.push({
      month: new Date(`${month}-01T00:00:00Z`),
      debt,
      equity: property - debt,
      property,
    });
  }
  return [...historic, ...projected];
}

const fmtM = (v: number) => `${Math.round(v / 1e6)}M`;

/**
 * Step-after curve: the balance holds its value until the payment month,
 * then jumps — so principal installments render as right-angle dents
 * instead of slopes.
 */
const stepCurve: ChartCurve = {
  line: (pts) => {
    if (pts.length === 0) return "";
    let d = `M${pts[0]![0]},${pts[0]![1]}`;
    for (let i = 1; i < pts.length; i++) d += `H${pts[i]![0]}V${pts[i]![1]}`;
    return d;
  },
  area: (top, bottom) => {
    if (top.length === 0) return "";
    let d = `M${top[0]![0]},${top[0]![1]}`;
    for (let i = 1; i < top.length; i++) d += `H${top[i]![0]}V${top[i]![1]}`;
    d += `L${bottom[bottom.length - 1]![0]},${bottom[bottom.length - 1]![1]}`;
    for (let i = bottom.length - 2; i >= 0; i--) d += `H${bottom[i]![0]}V${bottom[i]![1]}`;
    return `${d}Z`;
  },
};

function fmtISK(v: number): string {
  return `${Math.round(v).toLocaleString("is-IS")} kr.`;
}

export function DebtEquityChart() {
  const [growthPct, setGrowthPct] = useState(4.5); // HMS nominal trend since purchase
  const [extraPrincipal, setExtraPrincipal] = useState(true);
  const [horizonYears, setHorizonYears] = useState<number | null>(null); // null = full term
  const [real, setReal] = useState(false); // deflate to today's krónur
  const [showPension, setShowPension] = useState(false); // séreignarsparnaður dots
  const [uploadedRows, setUploadedRows] = useState<UploadedRow[]>([]);

  // Arion "LoanPayments" export (heimabanki). Parsed ENTIRELY in the browser —
  // the workbook never leaves the client (static site, no server processing).
  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]!];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        // row 0 = header (Lánsnúmer, Aðgerð, Greiðsludags., Mynt, Höfuðstóll, …).
        const parsed = (rows as unknown[])
          .slice(1)
          .map((r) => r as Array<string | number | Date | null>)
          .filter((r) => r && r[0] != null && r[2] instanceof Date)
          .map((r) => ({
            loanId: Number(r[0]),
            action: String(r[1] ?? ""),
            date: r[2] as Date,
            principal: Number(r[4] ?? 0),
            total: Number(r[12] ?? 0),
          }));
        setUploadedRows(parsed);
      } catch (err) {
        console.error("xlsx parse failed", err);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  const rows = useMemo(
    () => buildSeries(growthPct, extraPrincipal, horizonYears),
    [growthPct, extraPrincipal, horizonYears]
  );

  // One continuous nominal CPI series from the first historic month to the
  // horizon end (cpi.ts historical + the same 4.3→2.5% path the projection
  // indexes with) — used to deflate every value to today's krónur.
  const fullCpi = useMemo(
    () => buildCPISeries(data.monthly[0]!.month, rows.length - 1, CPI_SCENARIO),
    [rows]
  );

  // Real-terms rows: nominal × CPI_today / CPI_month (today = last historic
  // month, so the present is unchanged and past/future shrink to today's krónur).
  const nowCpiIdx = data.monthly.length - 1;
  const displayRows = useMemo(() => {
    if (!real) return rows;
    const now = fullCpi[nowCpiIdx]!;
    return rows.map((r, i) => {
      const f = now / fullCpi[i]!;
      return {
        ...r,
        debt: r.debt * f,
        equity: r.equity * f,
        property: r.property * f,
      };
    });
  }, [rows, real, fullCpi, nowCpiIdx]);

  // Extra principal payments (Innborgun + séreignarsparnaður) as dots on the
  // debt/equity boundary; details surface in the hover card.
  // Dots sit on the debt boundary (the band the payments move). Pension dots
  // are opt-in (21 monthly automatic payments clutter the historic zone).
  const extraDots = useMemo<ExtraDot[]>(() => {
    const debtByMonth = new Map(
      data.monthly.map((m, i) => [m.month, displayRows[i]?.debt ?? 0])
    );
    return ((data.extraPayments as ExtraPayment[] | undefined) ?? [])
      .filter((p) => p.kind === "prepayment" || showPension)
      .flatMap((p) => {
        const debt = debtByMonth.get(p.month);
        if (debt == null) return [];
        return [
          {
            date: new Date(`${p.month}-01T00:00:00Z`),
            y: debt,
            kind: p.kind,
            amount: p.amount,
            loanId: p.loanId,
          },
        ];
      });
  }, [displayRows, showPension]);

  const today = new Date(`${data.monthly[data.monthly.length - 1]!.month}-01T00:00:00Z`);

  // Deflation factor for a historic "YYYY-MM" month (extras in the card).
  const deflateFor = (month: string): number => {
    const start = data.monthly[0]!.month;
    const offset = Math.round(
      (new Date(`${month}-01T00:00:00Z`).getTime() -
        new Date(`${start}-01T00:00:00Z`).getTime()) /
        86_400_000 /
        30.44
    );
    const now = fullCpi[nowCpiIdx]!;
    return now / (fullCpi[offset] ?? now);
  };

  // Rows by "YYYY-MM" — for dot placement and the dot-hover fallback.
  const displayRowsByMonth = useMemo(
    () => new Map(displayRows.map((r) => [r.month.toISOString().slice(0, 7), r])),
    [displayRows]
  );

  // Payments from an uploaded Arion export, overlaid on the debt boundary.
  const uploadedDots = useMemo<ExtraDot[]>(
    () =>
      uploadedRows.flatMap((p) => {
        const month = p.date.toISOString().slice(0, 7);
        const debt = displayRowsByMonth.get(month)?.debt;
        if (debt == null) return [];
        return [
          {
            date: p.date,
            y: debt,
            kind: p.action.includes("séreignar") ? "pension" : "prepayment",
            amount: p.principal,
            loanId: p.loanId,
          },
        ];
      }),
    [uploadedRows, displayRowsByMonth]
  );

  const definition = useMemo(
    () =>
      defineChart(
        {
          marks: [
            // Green = asset: fasteign (property) from zero, the envelope.
            areaY(displayRows, {
              x: (d) => d.month,
              y1: 0,
              y: (d) => d.property,
              fill: "#10b981",
              fillOpacity: 0.4,
              stroke: "#059669",
              strokeWidth: 1,
              curve: stepCurve,
            }),
            // Amber = debt from zero (liability). It sits at the bottom of the
            // green; the dotted line marks what's yours above it.
            areaY(displayRows, {
              x: (d) => d.month,
              y1: 0,
              y: (d) => d.debt,
              fill: "#f59e0b",
              fillOpacity: 0.75,
              stroke: "#d97706",
              strokeWidth: 1,
              curve: stepCurve,
            }),
            // Dotted line = eigið fé (net worth): property − debt, true value.
            lineY(displayRows, {
              x: (d) => d.month,
              y: (d) => d.equity,
              stroke: "#047857",
              strokeWidth: 2.5,
              strokeDasharray: "4 4",
              curve: stepCurve,
            }),
            ruleX([{ t: today }], {
              x: (d) => d.t,
              stroke: "#0f172a",
              strokeWidth: 1,
              strokeDasharray: "4 4",
            }),
            dot(
              extraDots.filter((d) => d.kind === "prepayment"),
              {
                x: (d) => d.date,
                y: (d) => d.y,
                r: 3.5,
                fill: "#7c3aed",
                stroke: "#fff",
                strokeWidth: 1,
              }
            ),
            dot(
              extraDots.filter((d) => d.kind === "pension"),
              {
                x: (d) => d.date,
                y: (d) => d.y,
                r: 2.5,
                fill: "#60a5fa",
                stroke: "#fff",
                strokeWidth: 0.5,
              }
            ),
            dot(uploadedDots, {
              x: (d) => d.date,
              y: (d) => d.y,
              r: 3,
              fill: "#14b8a6",
              stroke: "#fff",
              strokeWidth: 1,
            }),
          ],
          scales: {
            x: {
              scale: scaleTime,
              grid: true,
              axis: { label: "Tími" },
            },
            y: {
              scale: () => scaleLinear(),
              nice: true,
              grid: true,
              axis: {
                label: real ? "ISK (raunvirði)" : "ISK",
                ticks: { format: (v) => fmtM(Number(v)) },
              },
            },
          },
        },
        { tooltip }
      ),
    [displayRows, today, extraDots, uploadedDots, real]
  );

  const lastRow = displayRows[displayRows.length - 1];

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-bold">Skuld og eigið fé</h2>

      <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600">
        <label className="flex items-center gap-1">
          Vöxtur fasteignaverðs (%/ár):
          <input
            type="number"
            value={growthPct}
            onChange={(e) => setGrowthPct(Number(e.target.value))}
            step={0.5}
            min={0}
            className="w-16 border border-neutral-300 px-1 py-0.5 text-right text-xs"
          />
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={extraPrincipal}
            onChange={(e) => setExtraPrincipal(e.target.checked)}
            className="accent-amber-600"
          />
          Aukaafborgun 100k (lán 2, frá 2027)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={real}
            onChange={(e) => setReal(e.target.checked)}
            className="accent-emerald-600"
          />
          Raunvirði (leiðrétt fyrir verðbólgu)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={showPension}
            onChange={(e) => setShowPension(e.target.checked)}
            className="accent-blue-500"
          />
          Sýna séreignarsparnað (bláir punktar)
        </label>
        <label className="flex items-center gap-1 text-xs">
          Arion greiðsluskrá:
          <input
            type="file"
            accept=".xlsx"
            onChange={handleUpload}
            className="text-xs"
          />
        </label>
        <label className="flex items-center gap-1">
          Spálengd:
          <select
            value={horizonYears ?? ""}
            onChange={(e) =>
              setHorizonYears(e.target.value === "" ? null : Number(e.target.value))
            }
            className="border border-neutral-300 px-1 py-0.5 text-xs"
          >
            <option value="">Lánstími</option>
            <option value="10">10 ár</option>
            <option value="15">15 ár</option>
            <option value="20">20 ár</option>
          </select>
        </label>
        {lastRow ? (
          <span className="ml-auto text-neutral-500">
            {lastRow.month.toLocaleDateString("is-IS", { month: "short", year: "numeric" })}
            {" — "}skuld {fmtM(lastRow.debt)} · eigið fé {fmtM(lastRow.equity)}
          </span>
        ) : null}
      </div>

      {uploadedRows.length > 0 ? (
        <p className="text-xs text-neutral-500">
          ⚠ Unnið alfarið í vafranum — ekkert sent á netþjón. {uploadedRows.length} færslur úr
          Arion greiðsluskrá; höfuðstóll: {fmtISK(uploadedRows.reduce((s, r) => s + r.principal, 0))}.
        </p>
      ) : null}

      <div className="border border-neutral-200 rounded p-2">
        <Chart
          definition={definition}
          aspectRatio={21 / 9}
          initialWidth={1200}
          ariaLabel="Eignir, skuld og eigið fé þróun"
          ariaDescription="Græna svæðið er fasteignavirði (eignir); appelsínugula svæðið neðst er skuldin; punktalínan er eigið fé (eignir mínus skuldir). Spor á punktalínunni lækka þegar höfuðstólslausnir koma inn."
          renderTooltipBody={({ points }) => {
            // Focus groups mix row datums with dot-mark datums (no `month`).
            // Prefer the row; when the hover is purely on a dot, fall back to
            // the row of the dot's month so the card still shows the context.
            const datums = points.map((p) => p.datum);
            let d = datums.find(
              (x): x is Row => !!x && typeof x === "object" && "month" in x
            );
            if (!d) {
              const dotD = datums.find(
                (x): x is ExtraDot =>
                  !!x && typeof x === "object" && "date" in x && "kind" in x
              );
              if (dotD) d = displayRowsByMonth.get(dotD.date.toISOString().slice(0, 7));
            }
            if (!d) return null;
            const month = d.month.toISOString().slice(0, 7);
            const extras = ((data.extraPayments as ExtraPayment[] | undefined) ?? []).filter(
              (p) => p.month === month
            );
            return (
              <div className="text-xs">
                <div className="font-bold">
                  {d.month.toLocaleDateString("is-IS", { month: "short", year: "numeric" })}
                  {real ? " (raunvirði)" : ""}
                </div>
                <div>Skuld: {fmtISK(d.debt)}</div>
                <div>Eigið fé: {fmtISK(d.equity)}</div>
                <div>Fasteign: {fmtISK(d.property)}</div>
                {extras.map((p) => (
                  <div key={`${p.kind}-${p.loanId}-${p.amount}`} className="text-violet-700">
                    {p.kind === "prepayment" ? "Innborgun" : "Séreignarsparnaður"}:{" "}
                    {fmtISK(real ? p.amount * deflateFor(p.month) : p.amount)} (lán{" "}
                    {data.loans.findIndex((l) => l.arionLoanId === p.loanId) + 1})
                  </div>
                ))}
              </div>
            );
          }}
        />
      </div>

      <p className="text-xs text-neutral-400">
        Saga: Arion greiðslusaga (höfuðstólslausnir) + HMS fjölbýli höfuðborgarsvæði vísitala
        (innskotin milli mælipunkta). Framspá: lánaáætlun reiknivélar (CPI 4.3→2.5%) og
        forsendan um {growthPct}% árlegan vöxt fasteignaverðs. Raunvirði leiðréttir öll gildi
        með vísitölu neysluverðs (CPI_now/CPI_month). Bláir punktar (valfrjálsir) = séreignarsparnaður.
      </p>
    </section>
  );
}
