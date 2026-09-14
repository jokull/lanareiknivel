import type { LoanInput, Assumptions, ScenarioConfig, RateBracket } from "./types";

let _nextId = 1;
export function nextId(): string {
  return String(_nextId++);
}

export function defaultLoans(): LoanInput[] {
  const id1 = nextId();
  const id2 = nextId();
  return [
    {
      id: id1,
      name: "Íbúðalán 1",
      balance: 40_000_000,
      apr: 4.49,
      remainingMonths: 300,

      method: "annuity",
      extraBrackets: [],
      pensionPrincipal: 0,
      rateChanges: [],
    },
    {
      id: id2,
      name: "Viðbótarlán",
      balance: 6_000_000,
      apr: 5.99,
      remainingMonths: 300,

      method: "annuity",
      extraBrackets: [{ startYear: 2027, years: 5, amount: 100_000 }],
      pensionPrincipal: 41_667, // séreignarsparnaður → höfuðstóll (500k/yr per person cap)
      rateChanges: [],
    },
  ];
}

export function deriveScenarios(
  baseBrackets: RateBracket[]
): [ScenarioConfig, ScenarioConfig, ScenarioConfig] {
  const optimistic: ScenarioConfig = {
    label: "Bjartsýn",
    rateBrackets: baseBrackets.map((b) => ({
      startYear: b.startYear,
      years: b.years,
      rate: Math.max(2.0, b.rate - 0.5),
    })),
  };

  const base: ScenarioConfig = {
    label: "Grunn",
    rateBrackets: [...baseBrackets],
  };

  const conservative: ScenarioConfig = {
    label: "Varúð",
    rateBrackets: baseBrackets.map((b) => ({
      startYear: b.startYear,
      years: b.years,
      rate: Math.min(6.0, b.rate + 0.7),
    })),
  };

  return [optimistic, base, conservative];
}

export function defaultBaseRates(): RateBracket[] {
  return [
    { startYear: 2026, years: 2, rate: 4.3 },
    { startYear: 2028, years: 23, rate: 2.5 },
  ];
}

export function defaultAssumptions(): Assumptions {
  const baseRates = defaultBaseRates();
  return {
    startMonth: "2026-03",
    pensionCap: "single" as const,
    scenarios: deriveScenarios(baseRates),
  };
}
