import type { LoanInput, RateChange, PaymentBracket } from "../types";
import { fmtISK } from "../utils/format";
import { useState } from "react";
import { BracketTable } from "./BracketTable";

interface Props {
  loan: LoanInput;
  onChange: (loan: LoanInput) => void;
  onRemove: () => void;
}

function NumInput({
  label,
  value,
  onChange,
  step,
  min,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="flex items-center gap-1 text-xs">
      <span className="w-24 text-neutral-500 shrink-0">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        step={step ?? 1}
        min={min ?? 0}
        className="w-28 border border-neutral-300 px-1 py-0.5 text-right text-xs"
      />
      {suffix && <span className="text-neutral-400 text-xs">{suffix}</span>}
    </label>
  );
}

export function LoanForm({ loan, onChange, onRemove }: Props) {
  const [showRateChanges, setShowRateChanges] = useState(
    loan.rateChanges.length > 0
  );
  const [showExtraBrackets, setShowExtraBrackets] = useState(
    loan.extraBrackets.length > 0
  );

  const update = (patch: Partial<LoanInput>) =>
    onChange({ ...loan, ...patch });

  const updateRateChange = (idx: number, patch: Partial<RateChange>) => {
    const rcs = [...loan.rateChanges];
    rcs[idx] = { ...rcs[idx], ...patch };
    update({ rateChanges: rcs });
  };

  const addRateChange = () =>
    update({
      rateChanges: [
        ...loan.rateChanges,
        { atMonth: 12, newApr: loan.apr },
      ],
    });

  const removeRateChange = (idx: number) =>
    update({ rateChanges: loan.rateChanges.filter((_, i) => i !== idx) });

  return (
    <div className="border border-neutral-300 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <input
          type="text"
          value={loan.name}
          onChange={(e) => update({ name: e.target.value })}
          className="font-bold text-sm border-b border-transparent hover:border-neutral-300 focus:border-neutral-500 outline-none px-0"
        />
        <button
          onClick={onRemove}
          className="text-xs text-neutral-400 hover:text-red-600"
        >
          eyða
        </button>
      </div>

      <div className="text-xs text-neutral-400">
        Eftirstöðvar: {fmtISK(loan.balance)} kr.
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <NumInput
          label="Eftirst."
          value={loan.balance}
          onChange={(v) => update({ balance: v })}
          step={100000}
        />
        <NumInput
          label="Vextir"
          value={loan.apr}
          onChange={(v) => update({ apr: v })}
          step={0.01}
          suffix="%"
        />
        <NumInput
          label="Mán. eftir"
          value={loan.remainingMonths}
          onChange={(v) => update({ remainingMonths: v })}
        />
        <NumInput
          label="Séreign"
          value={loan.pensionPrincipal}
          onChange={(v) => update({ pensionPrincipal: v })}
          step={1000}
          suffix="/man."
        />
        <label className="flex items-center gap-1 text-xs">
          <span className="w-24 text-neutral-500 shrink-0">Tegund</span>
          <select
            value={loan.method}
            onChange={(e) =>
              update({
                method: e.target.value as "annuity" | "equal_principal",
              })
            }
            className="border border-neutral-300 px-1 py-0.5 text-xs"
          >
            <option value="annuity">Jafngreiðslur</option>
            <option value="equal_principal">Jafnar afborganir</option>
          </select>
        </label>
      </div>

      {/* Aukaafborganir */}
      <div>
        <button
          onClick={() => setShowExtraBrackets(!showExtraBrackets)}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          {showExtraBrackets ? "– aukaafborganir" : "+ aukaafborganir"}
        </button>
        {showExtraBrackets && (
          <div className="mt-1">
            <BracketTable<PaymentBracket>
              brackets={loan.extraBrackets}
              onChange={(extraBrackets) => update({ extraBrackets })}
              valueLabel="Upph./mán."
              valueSuffix="kr."
              valueStep={10000}
              getValue={(b) => b.amount}
              setValue={(b, v) => ({ ...b, amount: v })}
              newBracket={(startYear) => ({
                startYear,
                years: 5,
                amount: 100_000,
              })}
            />
          </div>
        )}
      </div>

      {/* Vaxtabreytingar */}
      <div>
        <button
          onClick={() => setShowRateChanges(!showRateChanges)}
          className="text-xs text-neutral-500 hover:text-neutral-800"
        >
          {showRateChanges ? "– vaxtabreytingar" : "+ vaxtabreytingar"}
        </button>
        {showRateChanges && (
          <div className="mt-1 space-y-1">
            {loan.rateChanges.map((rc, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-neutral-500">á mán.</span>
                <input
                  type="number"
                  value={rc.atMonth}
                  onChange={(e) =>
                    updateRateChange(i, { atMonth: Number(e.target.value) })
                  }
                  className="w-16 border border-neutral-300 px-1 py-0.5 text-right text-xs"
                />
                <span className="text-neutral-500">nýir vextir</span>
                <input
                  type="number"
                  value={rc.newApr}
                  onChange={(e) =>
                    updateRateChange(i, { newApr: Number(e.target.value) })
                  }
                  step={0.01}
                  className="w-20 border border-neutral-300 px-1 py-0.5 text-right text-xs"
                />
                <span className="text-neutral-400">%</span>
                <button
                  onClick={() => removeRateChange(i)}
                  className="text-neutral-400 hover:text-red-600"
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={addRateChange}
              className="text-xs text-neutral-500 hover:text-neutral-800"
            >
              + bæta við vaxtabreytingu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
