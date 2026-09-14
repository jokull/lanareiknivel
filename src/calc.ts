import type {
  LoanInput,
  MonthResult,
  YearSummary,
  Assumptions,
  PaymentBracket,
  PensionCap,
} from "./types";
import { buildCPISeries } from "./cpi";

const PENSION_CAP: Record<PensionCap, number> = {
  none: Infinity,
  single: 500_000,
  couple: 1_000_000,
};

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

/** Annuity payment (jafngreiðslur) */
export function pmtCalc(
  balance: number,
  monthlyRate: number,
  monthsLeft: number
): number {
  if (monthsLeft <= 0 || balance <= 0) return 0;
  if (monthlyRate === 0) return balance / monthsLeft;
  const pow = Math.pow(1 + monthlyRate, monthsLeft);
  return balance * ((monthlyRate * pow) / (pow - 1));
}

function getExtraForMonth(brackets: PaymentBracket[], month: string): number {
  const year = parseInt(month.split("-")[0]);
  for (const b of brackets) {
    if (year >= b.startYear && year < b.startYear + b.years) return b.amount;
  }
  return 0;
}

/**
 * Compute month-by-month amortization for a single loan under one CPI scenario.
 */
export function computeLoanSchedule(
  loan: LoanInput,
  startMonth: string,
  cpiSeries: number[],
  pensionUsedByYear?: Map<number, number>,
  pensionCapAmount?: number
): MonthResult[] {
  const results: MonthResult[] = [];
  let balance = loan.balance;
  let monthsLeft = loan.remainingMonths;

  const numMonths = cpiSeries.length - 1; // cpiSeries has numMonths+1 entries

  for (let i = 0; i < numMonths && balance > 0 && monthsLeft > 0; i++) {
    const month = addMonths(startMonth, i);

    // Check for rate changes
    let apr = loan.apr;
    for (const rc of loan.rateChanges) {
      if (i >= rc.atMonth) apr = rc.newApr;
    }
    const r = apr / 100 / 12;

    // Indexation from CPI ratio
    const cpiRatio = cpiSeries[i + 1] / cpiSeries[i];
    const indexation = Math.round(balance * (cpiRatio - 1));
    const indexed = balance + indexation;

    let grossPayment: number;
    let principalRepaid: number;

    if (loan.method === "annuity") {
      grossPayment = Math.round(pmtCalc(indexed, r, monthsLeft));
      const interest = Math.round(indexed * r);
      principalRepaid = grossPayment - interest;
    } else {
      // Equal principal
      principalRepaid = Math.round(indexed / monthsLeft);
      const interest = Math.round(indexed * r);
      grossPayment = principalRepaid + interest;
    }

    const interest = Math.round(indexed * r);

    // Extra principal
    const extra = getExtraForMonth(loan.extraBrackets, month);
    const year = parseInt(month.split("-")[0]);
    let pension = loan.pensionPrincipal;
    if (pensionUsedByYear && pensionCapAmount !== undefined && pension > 0) {
      const used = pensionUsedByYear.get(year) ?? 0;
      const remaining = Math.max(0, pensionCapAmount - used);
      pension = Math.min(pension, remaining);
      pensionUsedByYear.set(year, used + pension);
    }

    balance = Math.max(
      0,
      indexed - principalRepaid - extra - pension
    );
    monthsLeft--;

    results.push({
      month,
      monthIndex: i,
      payment: grossPayment,
      interest,
      principalRepaid,
      extra,
      pension,
      indexation,
      balance,
      cpi: cpiSeries[i + 1],
    });
  }

  return results;
}

/**
 * Compute schedules for a single loan across all 3 scenarios.
 */
export function computeAllScenarios(
  loan: LoanInput,
  assumptions: Assumptions,
  scenarioPensionMaps?: [Map<number, number>, Map<number, number>, Map<number, number>]
): [MonthResult[], MonthResult[], MonthResult[]] {
  // 50% headroom over remaining months — indexation can extend loan life
  const numMonths = Math.ceil(loan.remainingMonths * 1.5);
  const cap = PENSION_CAP[assumptions.pensionCap];

  return assumptions.scenarios.map((scenario, si) => {
    const cpiSeries = buildCPISeries(
      assumptions.startMonth,
      numMonths,
      scenario
    );
    return computeLoanSchedule(
      loan,
      assumptions.startMonth,
      cpiSeries,
      scenarioPensionMaps?.[si],
      cap
    );
  }) as [MonthResult[], MonthResult[], MonthResult[]];
}

/**
 * Group monthly results into yearly summaries.
 */
export function groupByYear(months: MonthResult[]): YearSummary[] {
  const yearMap = new Map<number, MonthResult[]>();

  for (const m of months) {
    const year = parseInt(m.month.split("-")[0]);
    if (!yearMap.has(year)) yearMap.set(year, []);
    yearMap.get(year)!.push(m);
  }

  const summaries: YearSummary[] = [];
  for (const [year, ms] of [...yearMap.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    summaries.push({
      year,
      months: ms,
      totalPayment: ms.reduce((s, m) => s + m.payment, 0),
      totalInterest: ms.reduce((s, m) => s + m.interest, 0),
      totalPrincipal: ms.reduce((s, m) => s + m.principalRepaid, 0),
      totalExtra: ms.reduce((s, m) => s + m.extra, 0),
      totalPension: ms.reduce((s, m) => s + m.pension, 0),
      totalIndexation: ms.reduce((s, m) => s + m.indexation, 0),
      endBalance: ms[ms.length - 1].balance,
    });
  }

  return summaries;
}

/**
 * Compute everything: all loans × all scenarios, grouped by year.
 * Returns: per-loan array of [opt, base, con] year summaries.
 */
export function computeAll(
  loans: LoanInput[],
  assumptions: Assumptions
): {
  loanSchedules: {
    loan: LoanInput;
    scenarios: [MonthResult[], MonthResult[], MonthResult[]];
    yearSummaries: [YearSummary[], YearSummary[], YearSummary[]];
  }[];
} {
  // Shared pension budget maps per scenario (across all loans)
  const scenarioPensionMaps: [Map<number, number>, Map<number, number>, Map<number, number>] = [
    new Map(),
    new Map(),
    new Map(),
  ];

  // Sequential: each loan draws from the shared pension budget
  const loanSchedules = loans.map((loan) => {
    const scenarios = computeAllScenarios(loan, assumptions, scenarioPensionMaps);
    const yearSummaries = scenarios.map(groupByYear) as [
      YearSummary[],
      YearSummary[],
      YearSummary[],
    ];
    return { loan, scenarios, yearSummaries };
  });

  return { loanSchedules };
}
