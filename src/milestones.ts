import type { LoanInput, MonthResult } from "./types";

export interface Milestone {
  month: string;
  year: number;
  loanName: string;
  label: string;
  color: "green" | "blue" | "amber" | "neutral";
}

interface LoanScheduleData {
  loan: LoanInput;
  scenarios: [MonthResult[], MonthResult[], MonthResult[]];
}

export function detectMilestones(loanSchedules: LoanScheduleData[]): Milestone[] {
  const milestones: Milestone[] = [];

  for (let li = 0; li < loanSchedules.length; li++) {
    const ls = loanSchedules[li];
    const base = ls.scenarios[1];
    if (base.length === 0) continue;

    const tag = `#${li + 1}`;
    const startBalance = ls.loan.balance;

    // Loan paid off
    const payoffIdx = base.findIndex((m) => m.balance <= 0);
    if (payoffIdx >= 0) {
      milestones.push({
        month: base[payoffIdx].month,
        year: yearOf(base[payoffIdx].month),
        loanName: tag,
        label: "Greitt",
        color: "green",
      });
    }

    // Peak balance (when indexation stops growing the principal)
    let peakBalance = startBalance;
    let peakIdx = -1;
    for (let i = 0; i < base.length; i++) {
      if (base[i].balance > peakBalance) {
        peakBalance = base[i].balance;
        peakIdx = i;
      }
    }
    if (peakIdx > 0) {
      milestones.push({
        month: base[peakIdx].month,
        year: yearOf(base[peakIdx].month),
        loanName: tag,
        label: `Hámark ${fmtM(peakBalance)}`,
        color: "amber",
      });
    }

    // 50% of starting balance paid down
    const halfIdx = base.findIndex((m) => m.balance <= startBalance * 0.5);
    if (halfIdx >= 0) {
      milestones.push({
        month: base[halfIdx].month,
        year: yearOf(base[halfIdx].month),
        loanName: tag,
        label: "50% greitt",
        color: "blue",
      });
    }

    // Extra principal brackets start/end
    for (const eb of ls.loan.extraBrackets) {
      milestones.push({
        month: `${eb.startYear}-01`,
        year: eb.startYear,
        loanName: tag,
        label: `Aukaafb. byrjar`,
        color: "amber",
      });
      const endYear = eb.startYear + eb.years;
      // Only show end if the loan is still alive at that point
      if (payoffIdx < 0 || yearOf(base[payoffIdx].month) >= endYear) {
        milestones.push({
          month: `${endYear}-01`,
          year: endYear,
          loanName: tag,
          label: `Aukaafb. endar`,
          color: "neutral",
        });
      }
    }
  }

  return milestones.sort((a, b) => a.month.localeCompare(b.month));
}

/** Get milestones for a specific year */
export function milestonesForYear(milestones: Milestone[], year: number): Milestone[] {
  return milestones.filter((m) => m.year === year);
}

function yearOf(month: string): number {
  return parseInt(month.split("-")[0]);
}

function fmtM(v: number): string {
  return (v / 1_000_000).toFixed(1) + "M";
}
