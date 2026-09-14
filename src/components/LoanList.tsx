import type { LoanInput } from "../types";
import { LoanForm } from "./LoanForm";
import { nextId } from "../defaults";

interface Props {
  loans: LoanInput[];
  onChange: (loans: LoanInput[]) => void;
}

export function LoanList({ loans, onChange }: Props) {
  const updateLoan = (idx: number, loan: LoanInput) => {
    const next = [...loans];
    next[idx] = loan;
    onChange(next);
  };

  const removeLoan = (idx: number) => {
    onChange(loans.filter((_, i) => i !== idx));
  };

  const addLoan = () => {
    onChange([
      ...loans,
      {
        id: nextId(),
        name: `Lán ${loans.length + 1}`,
        balance: 10_000_000,
        apr: 5.0,
        remainingMonths: 240,

        method: "annuity",
        extraBrackets: [],
        pensionPrincipal: 0,
        rateChanges: [],
      },
    ]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">Lán</h2>
        <button
          onClick={addLoan}
          className="text-xs border border-neutral-300 px-2 py-0.5 hover:bg-neutral-100"
        >
          + bæta við láni
        </button>
      </div>
      {loans.map((loan, i) => (
        <LoanForm
          key={loan.id}
          loan={loan}
          onChange={(l) => updateLoan(i, l)}
          onRemove={() => removeLoan(i)}
        />
      ))}
    </div>
  );
}
