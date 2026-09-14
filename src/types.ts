export interface RateChange {
  atMonth: number;
  newApr: number;
}

export interface PaymentBracket {
  startYear: number;
  years: number;
  amount: number;
}

export interface RateBracket {
  startYear: number;
  years: number;
  rate: number;
}

export interface LoanInput {
  id: string;
  name: string;
  balance: number;
  apr: number;
  remainingMonths: number;
  method: "annuity" | "equal_principal";
  extraBrackets: PaymentBracket[];
  pensionPrincipal: number;
  rateChanges: RateChange[];
}

export interface ScenarioConfig {
  label: string;
  rateBrackets: RateBracket[];
}

export type PensionCap = "none" | "single" | "couple";

export interface Assumptions {
  startMonth: string; // "YYYY-MM"
  pensionCap: PensionCap;
  scenarios: [ScenarioConfig, ScenarioConfig, ScenarioConfig];
}

export interface MonthResult {
  month: string;
  monthIndex: number;
  payment: number;
  interest: number;
  principalRepaid: number;
  extra: number;
  pension: number;
  indexation: number;
  balance: number;
  cpi: number;
}

export interface YearSummary {
  year: number;
  months: MonthResult[];
  totalPayment: number;
  totalInterest: number;
  totalPrincipal: number;
  totalExtra: number;
  totalPension: number;
  totalIndexation: number;
  endBalance: number;
}
