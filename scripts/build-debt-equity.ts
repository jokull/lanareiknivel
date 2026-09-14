/**
 * Build the historic monthly debt + property-value series for the
 * debt/equity chart.
 *
 * Usage:
 *   bun scripts/build-debt-equity.ts <loans.json> <property.json>
 *
 * loans.json — one entry per loan (the shape Arion's netbanki history maps to):
 *   [{ mortgageId, arionLoanId, currentApr, remainingMonths, currentRemainingPrincipal,
 *      payments: [{ paymentDate, remainingPrincipal }],
 *      pensionPayments?: [{ paymentDate, principalAmount }],
 *      otherPayments?:   [{ paymentDate, principalAmount }] }]
 *   NOTE: the bank's table states amounts in base-index kronur; reconstruct
 *   remainingPrincipal as (P0 − Σ base principal) × I(m)/I_base — see
 *   https://github.com/jokull/fjarmalalaesi references/verdtrygging.md §10.
 * property.json — { purchasePrice, purchaseMonth: "YYYY-MM",
 *   hmsAnchors: [{ month, index }] }  (HMS vísitala íbúðaverðs sub-index for
 *   the property type/area; public CSV linked from hms.is/visitolur)
 *
 * Output: src/data/debt-equity.json (imported by the chart).
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

interface Payment {
  paymentDate: string;
  remainingPrincipal: number;
}
interface LoanDetail {
  mortgageId: string;
  arionLoanId: number;
  currentApr: number;
  remainingMonths: number;
  currentRemainingPrincipal: number;
  payments: Payment[];
  pensionPayments?: { paymentDate: string; principalAmount: number }[];
  otherPayments?: { paymentDate: string; principalAmount: number }[];
}

const ROOT = join(import.meta.dir, "..");
const [loansPath, propertyPath] = process.argv.slice(2);
if (!loansPath || !propertyPath) {
  console.error("usage: bun scripts/build-debt-equity.ts <loans.json> <property.json>");
  process.exit(1);
}
const loans: LoanDetail[] = JSON.parse(readFileSync(loansPath, "utf-8"));
const property = JSON.parse(readFileSync(propertyPath, "utf-8")) as {
  purchasePrice: number;
  purchaseMonth: string;
  hmsAnchors: Array<{ month: string; index: number }>;
};
const PURCHASE_PRICE = property.purchasePrice;
const PURCHASE_MONTH = property.purchaseMonth;
const HMS_ANCHORS = [...property.hmsAnchors].sort((a, b) => a.month.localeCompare(b.month));
const BASE_INDEX = HMS_ANCHORS[0]!.index;

function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Linear interpolation of the HMS index at a month between anchors. */
function indexForMonth(month: string): number {
  if (month <= HMS_ANCHORS[0]!.month) return HMS_ANCHORS[0]!.index;
  const last = HMS_ANCHORS[HMS_ANCHORS.length - 1]!;
  if (month >= last.month) return last.index;
  for (let i = 1; i < HMS_ANCHORS.length; i++) {
    const a = HMS_ANCHORS[i - 1]!;
    const b = HMS_ANCHORS[i]!;
    if (month >= a.month && month <= b.month) {
      const span = monthDiff(a.month, b.month);
      const pos = monthDiff(a.month, month);
      return a.index + ((b.index - a.index) * pos) / span;
    }
  }
  return last.index;
}

function monthDiff(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by! - ay!) * 12 + (bm! - am!);
}

// Per-loan running balance by month (carry forward between payments).
const balanceByMonth = new Map<string, Record<string, number>>();
for (const loan of loans) {
  let last: number | null = null;
  for (const p of loan.payments) {
    last = p.remainingPrincipal;
    const month = p.paymentDate.slice(0, 7);
    const entry = balanceByMonth.get(month) ?? {};
    entry[loan.arionLoanId] = last;
    balanceByMonth.set(month, entry);
  }
}
// Current balances at the fetch month (post-last-payment snapshot).
const fetchedMonth = loans[0]!.payments.length
  ? loans[0]!.payments[loans[0]!.payments.length - 1]!.paymentDate.slice(0, 7)
  : "2026-09";

// Series from the first payment month through the last payment month.
const firstPayment = [...balanceByMonth.keys()].sort()[0]!;
const monthly: Array<{
  month: string;
  loans: Record<string, number | null>;
  debt: number;
  property: number;
  equity: number;
  index: number;
}> = [];
// Carry forward each loan's last-known balance into months without a payment.
const lastKnown: Record<string, number | null> = {};
for (const l of loans) lastKnown[l.arionLoanId] = null;
let m = firstPayment;
while (m <= fetchedMonth) {
  const entry = balanceByMonth.get(m) ?? {};
  for (const l of loans) if (entry[l.arionLoanId] != null) lastKnown[l.arionLoanId] = entry[l.arionLoanId]!;
  const debt = Object.values(lastKnown).reduce((s, v) => s + (v ?? 0), 0);
  const index = indexForMonth(m);
  const property = Math.round((PURCHASE_PRICE * index) / BASE_INDEX);
  monthly.push({ month: m, loans: { ...lastKnown }, debt, property, equity: property - debt, index });
  m = addMonths(m, 1);
}
// Final point: the bank's authoritative current balances ("Staða láns") — the
// last payment row may predate later principal reductions (e.g. Innborgun).
{
  const last = monthly[monthly.length - 1]!;
  const current: Record<string, number | null> = {};
  for (const l of loans) current[l.arionLoanId] = l.currentRemainingPrincipal ?? last.loans[l.arionLoanId] ?? null;
  const index = indexForMonth(last.month);
  const property = Math.round((PURCHASE_PRICE * index) / BASE_INDEX);
  const debt = Object.values(current).reduce((s, v) => s + (v ?? 0), 0);
  monthly[monthly.length - 1] = { ...last, loans: current, debt, property, equity: property - debt };
}

// Extra principal reductions beyond the scheduled installment: voluntary
// prepayments (Innborgun) and séreignarsparnaður principal payments.
const extraPayments: {
  month: string;
  loanId: number;
  kind: "prepayment" | "pension";
  amount: number;
}[] = [];
for (const loan of loans) {
  for (const p of loan.pensionPayments ?? []) {
    extraPayments.push({
      month: p.paymentDate.slice(0, 7),
      loanId: loan.arionLoanId,
      kind: "pension",
      amount: p.principalAmount,
    });
  }
  for (const p of loan.otherPayments ?? []) {
    extraPayments.push({
      month: p.paymentDate.slice(0, 7),
      loanId: loan.arionLoanId,
      kind: "prepayment",
      amount: p.principalAmount,
    });
  }
}
extraPayments.sort((a, b) => a.month.localeCompare(b.month));

const out = {
  generatedAt: new Date().toISOString(),
  purchasePrice: PURCHASE_PRICE,
  purchaseMonth: PURCHASE_MONTH,
  hmsBaseIndex: BASE_INDEX,
  hmsAnchors: HMS_ANCHORS,
  loans: loans.map((l) => ({
    id: l.mortgageId,
    arionLoanId: l.arionLoanId,
    currentApr: l.currentApr,
    remainingMonths: l.remainingMonths,
    currentRemainingPrincipal: l.currentRemainingPrincipal,
  })),
  monthly,
  extraPayments,
};

const outPath = join(ROOT, "src/data/debt-equity.json");
mkdirSync(join(ROOT, "src/data"), { recursive: true });
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`Wrote ${outPath}: ${monthly.length} months (${firstPayment} → ${fetchedMonth})`);
console.log(
  `  first: debt=${monthly[0]!.debt.toLocaleString()} property=${monthly[0]!.property.toLocaleString()}`
);
const last = monthly[monthly.length - 1]!;
console.log(
  `  last:  debt=${last.debt.toLocaleString()} property=${last.property.toLocaleString()} equity=${last.equity.toLocaleString()}`
);
