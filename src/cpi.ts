import type { ScenarioConfig } from "./types";

// Vísitala neysluverðs til verðtryggingar, Hagstofa VIS01004.px (May 1988 = 100), keyed by
// the month the value governs indexation. Refresh: https://github.com/jokull/fjarmalalaesi
// `python3 scripts/cpi.py indexation -n 36` (or the PX-Web API below).
// Source: https://px.hagstofa.is/pxis/pxweb/is/Efnahagur/Efnahagur__visitolur__1_vnv__1_vnv/VIS01004.px
const HISTORICAL_CPI: Record<string, number> = {
  "2023-11": 599.9,
  "2023-12": 603.5,
  "2024-01": 605.8,
  "2024-02": 608.3,
  "2024-03": 607.3,
  "2024-04": 615.4,
  "2024-05": 620.3,
  "2024-06": 623.7,
  "2024-07": 627.3,
  "2024-08": 630.3,
  "2024-09": 633.2,
  "2024-10": 633.8,
  "2024-11": 632.3,
  "2024-12": 634.1,
  "2025-01": 634.7,
  "2025-02": 637.2,
  "2025-03": 635.5,
  "2025-04": 641.3,
  "2025-05": 643.7,
  "2025-06": 649.7,
  "2025-07": 651.0,
  "2025-08": 656.5,
  "2025-09": 658.6,
  "2025-10": 657.6,
  "2025-11": 658.3,
  "2025-12": 661.4,
  "2026-01": 658.2,
  "2026-02": 665.8,
  "2026-03": 668.3,
  "2026-04": 674.6,
  "2026-05": 678.3,
  "2026-06": 683.8,
  "2026-07": 684.3,
  "2026-08": 690.7,
  "2026-09": 693.2,
  "2026-10": 694.6,
};

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

function getYearFromMonth(ym: string): number {
  return parseInt(ym.split("-")[0]);
}

/**
 * Build a CPI series for `numMonths + 1` entries starting at `startMonth`.
 * Uses historical values when available, then projects forward using the
 * scenario's annual rates compounded monthly.
 */
export function buildCPISeries(
  startMonth: string,
  numMonths: number,
  scenario: ScenarioConfig
): number[] {
  const series: number[] = [];

  for (let i = 0; i <= numMonths; i++) {
    const month = addMonths(startMonth, i);
    if (HISTORICAL_CPI[month] !== undefined) {
      series.push(HISTORICAL_CPI[month]);
    } else {
      // Find last known CPI and compound forward
      const lastKnownMonth = findLastKnownMonth(month);
      const lastCPI = HISTORICAL_CPI[lastKnownMonth];
      const monthsToProject = monthDiff(lastKnownMonth, month);

      let cpi = lastCPI;
      let currentMonth = lastKnownMonth;
      for (let j = 0; j < monthsToProject; j++) {
        currentMonth = addMonths(currentMonth, 1);
        const year = getYearFromMonth(currentMonth);
        const annualRate = getRateForYear(scenario, year);
        const monthlyRate = Math.pow(1 + annualRate / 100, 1 / 12) - 1;
        cpi = cpi * (1 + monthlyRate);
      }
      series.push(Math.round(cpi * 10) / 10);
    }
  }

  return series;
}

function findLastKnownMonth(beforeMonth: string): string {
  const months = Object.keys(HISTORICAL_CPI).sort();
  let last = months[0];
  for (const m of months) {
    if (m >= beforeMonth) break;
    last = m;
  }
  return last;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

function getRateForYear(scenario: ScenarioConfig, year: number): number {
  // Find the bracket that covers this year
  for (let i = scenario.rateBrackets.length - 1; i >= 0; i--) {
    const b = scenario.rateBrackets[i];
    if (year >= b.startYear && year < b.startYear + b.years) return b.rate;
  }
  // Fall back to last bracket's rate (CPI continues)
  return scenario.rateBrackets[scenario.rateBrackets.length - 1]?.rate ?? 2.5;
}

export function getHistoricalCPI(): Record<string, number> {
  return { ...HISTORICAL_CPI };
}
