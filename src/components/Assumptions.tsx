import type { Assumptions as AssumptionsType, RateBracket, PensionCap } from "../types";
import { deriveScenarios } from "../defaults";
import { fmtPct } from "../utils/format";

interface Props {
  assumptions: AssumptionsType;
  onChange: (assumptions: AssumptionsType) => void;
}

function rechain(brackets: RateBracket[]): RateBracket[] {
  return brackets.map((b, i) => {
    if (i === 0) return b;
    const prev = brackets[i - 1];
    return { ...b, startYear: prev.startYear + prev.years };
  });
}

export function Assumptions({ assumptions, onChange }: Props) {
  const baseBrackets = assumptions.scenarios[1].rateBrackets;
  const optBrackets = assumptions.scenarios[0].rateBrackets;
  const conBrackets = assumptions.scenarios[2].rateBrackets;

  const emit = (newBrackets: RateBracket[]) => {
    onChange({
      ...assumptions,
      scenarios: deriveScenarios(rechain(newBrackets)),
    });
  };

  const updateField = (idx: number, patch: Partial<RateBracket>) => {
    const updated = [...baseBrackets];
    updated[idx] = { ...updated[idx], ...patch };
    emit(updated);
  };

  const addBracket = () => {
    const last = baseBrackets[baseBrackets.length - 1];
    const startYear = last ? last.startYear + last.years : 2026;
    const rate = last?.rate ?? 2.5;
    emit([...baseBrackets, { startYear, years: 5, rate }]);
  };

  const removeBracket = (idx: number) => {
    if (baseBrackets.length <= 1) return;
    emit(baseBrackets.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold">Verðbólguforsendur</h2>

      <table className="text-xs w-full">
        <thead>
          <tr className="border-b border-neutral-300">
            <th className="text-left py-1 pr-1">Frá</th>
            <th className="text-left py-1 px-1">Ár</th>
            <th className="text-right py-1 px-2">Bjartsýn</th>
            <th className="text-right py-1 px-2">Grunn</th>
            <th className="text-right py-1 px-2">Varúð</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {baseBrackets.map((br, i) => (
            <tr key={i} className="border-b border-neutral-100">
              <td className="py-1 pr-1">
                <span className="text-xs text-neutral-400 px-1">
                  {br.startYear}
                </span>
              </td>
              <td className="py-1 px-1">
                <input
                  type="number"
                  value={br.years}
                  onChange={(e) =>
                    updateField(i, {
                      years: Math.max(1, Number(e.target.value)),
                    })
                  }
                  min={1}
                  className="w-12 border border-neutral-300 px-1 py-0.5 text-xs text-right"
                />
              </td>
              <td className="text-right py-1 px-2 text-neutral-400">
                {fmtPct(optBrackets[i]?.rate ?? 0)}
              </td>
              <td className="text-right py-1 px-2">
                <input
                  type="number"
                  value={br.rate}
                  onChange={(e) =>
                    updateField(i, { rate: Number(e.target.value) })
                  }
                  step={0.1}
                  className="w-16 border border-neutral-300 px-1 py-0.5 text-right text-xs"
                />
              </td>
              <td className="text-right py-1 px-2 text-neutral-400">
                {fmtPct(conBrackets[i]?.rate ?? 0)}
              </td>
              <td className="py-1">
                {baseBrackets.length > 1 && (
                  <button
                    onClick={() => removeBracket(i)}
                    className="text-neutral-400 hover:text-red-600 text-xs"
                  >
                    x
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button
        onClick={addBracket}
        className="text-xs text-neutral-500 hover:text-neutral-800"
      >
        + bæta við tímabili
      </button>

      <label className="flex items-center gap-1 text-xs">
        <span className="text-neutral-500 shrink-0">Byrjunarmán.</span>
        <input
          type="text"
          value={assumptions.startMonth}
          onChange={(e) =>
            onChange({ ...assumptions, startMonth: e.target.value })
          }
          placeholder="YYYY-MM"
          className="w-24 border border-neutral-300 px-1 py-0.5 text-xs"
        />
      </label>

      <h2 className="text-sm font-bold pt-2">Séreignarsparnaður</h2>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-neutral-500">Árlegt hámark</span>
        {([
          ["none", "Ekkert"],
          ["single", "500þ/ár"],
          ["couple", "1M/ár"],
        ] as [PensionCap, string][]).map(([value, label]) => (
          <label key={value} className="flex items-center gap-1">
            <input
              type="radio"
              name="pensionCap"
              value={value}
              checked={assumptions.pensionCap === value}
              onChange={() =>
                onChange({ ...assumptions, pensionCap: value })
              }
              className="accent-neutral-700"
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
