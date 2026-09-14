import { useState, useEffect, useCallback, useRef } from "react";
import type { LoanInput, Assumptions, RateBracket, PensionCap } from "../types";
import { defaultLoans, defaultAssumptions, deriveScenarios, nextId } from "../defaults";

interface AppState {
  loans: LoanInput[];
  assumptions: Assumptions;
}

interface CompactLoan {
  n: string;
  b: number;
  a: number;
  m: number;
  mt: string;
  eb: { s: number; y: number; a: number }[];
  pp: number;
  rc: { m: number; a: number }[];
}

interface CompactState {
  l: CompactLoan[];
  sm: string;
  br: { s: number; y: number; r: number }[];
  pc?: string;
}

function compactify(state: AppState): CompactState {
  return {
    l: state.loans.map((loan) => ({
      n: loan.name,
      b: loan.balance,
      a: loan.apr,
      m: loan.remainingMonths,
      mt: loan.method,
      eb: loan.extraBrackets.map((eb) => ({
        s: eb.startYear,
        y: eb.years,
        a: eb.amount,
      })),
      pp: loan.pensionPrincipal,
      rc: loan.rateChanges.map((rc) => ({ m: rc.atMonth, a: rc.newApr })),
    })),
    sm: state.assumptions.startMonth,
    br: state.assumptions.scenarios[1].rateBrackets.map((b) => ({
      s: b.startYear,
      y: b.years,
      r: b.rate,
    })),
    pc: state.assumptions.pensionCap,
  };
}

function expand(compact: CompactState): AppState {
  const baseBrackets: RateBracket[] = compact.br.map((b) => ({
    startYear: b.s,
    years: b.y,
    rate: b.r,
  }));

  return {
    loans: compact.l.map((cl) => ({
      id: nextId(),
      name: cl.n,
      balance: cl.b,
      apr: cl.a,
      remainingMonths: cl.m,
      method: cl.mt as "annuity" | "equal_principal",
      extraBrackets: (cl.eb ?? []).map((eb) => ({
        startYear: eb.s,
        years: eb.y,
        amount: eb.a,
      })),
      pensionPrincipal: cl.pp,
      rateChanges: cl.rc.map((rc) => ({ atMonth: rc.m, newApr: rc.a })),
    })),
    assumptions: {
      startMonth: compact.sm,
      pensionCap: (compact.pc as PensionCap) ?? "single",
      scenarios: deriveScenarios(baseBrackets),
    },
  };
}

function encodeHash(state: AppState): string {
  try {
    const compact = compactify(state);
    return btoa(JSON.stringify(compact));
  } catch {
    return "";
  }
}

function decodeHash(hash: string): AppState | null {
  try {
    const json = atob(hash);
    const compact = JSON.parse(json) as CompactState;
    return expand(compact);
  } catch {
    return null;
  }
}

export function useHashState(): {
  loans: LoanInput[];
  assumptions: Assumptions;
  setLoans: (loans: LoanInput[]) => void;
  setAssumptions: (assumptions: Assumptions) => void;
} {
  const [state, setState] = useState<AppState>(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const decoded = decodeHash(hash);
      if (decoded) return decoded;
    }
    return { loans: defaultLoans(), assumptions: defaultAssumptions() };
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const encoded = encodeHash(state);
      if (encoded) {
        window.history.replaceState(null, "", "#" + encoded);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [state]);

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const decoded = decodeHash(hash);
        if (decoded) setState(decoded);
      }
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const setLoans = useCallback(
    (loans: LoanInput[]) => setState((s) => ({ ...s, loans })),
    []
  );
  const setAssumptions = useCallback(
    (assumptions: Assumptions) => setState((s) => ({ ...s, assumptions })),
    []
  );

  return { loans: state.loans, assumptions: state.assumptions, setLoans, setAssumptions };
}
