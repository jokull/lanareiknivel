interface Bracket {
  startYear: number;
  years: number;
}

interface Props<T extends Bracket> {
  brackets: T[];
  onChange: (brackets: T[]) => void;
  valueLabel: string;
  valueSuffix: string;
  valueStep: number;
  getValue: (b: T) => number;
  setValue: (b: T, v: number) => T;
  newBracket: (startYear: number) => T;
  minBrackets?: number;
  /** When true, startYear is derived from prev row (CPI). When false, startYear is editable (extra principal). */
  chained?: boolean;
}

/** Recompute startYear for rows 1+ based on previous row's startYear + years */
function rechain<T extends Bracket>(brackets: T[]): T[] {
  return brackets.map((b, i) => {
    if (i === 0) return b;
    const prev = brackets[i - 1];
    return { ...b, startYear: prev.startYear + prev.years };
  });
}

export function BracketTable<T extends Bracket>({
  brackets,
  onChange,
  valueLabel,
  valueSuffix,
  valueStep,
  getValue,
  setValue,
  newBracket,
  minBrackets = 0,
  chained = false,
}: Props<T>) {
  const emit = (updated: T[]) => {
    if (chained) {
      onChange(rechain(updated));
    } else {
      onChange([...updated].sort((a, b) => a.startYear - b.startYear));
    }
  };

  const updateField = (idx: number, patch: Partial<T>) => {
    const updated = [...brackets];
    updated[idx] = { ...updated[idx], ...patch };
    emit(updated);
  };

  const remove = (idx: number) => {
    if (brackets.length <= minBrackets) return;
    emit(brackets.filter((_, i) => i !== idx));
  };

  const add = () => {
    const last = brackets[brackets.length - 1];
    const startYear = last ? last.startYear + last.years : 2026;
    emit([...brackets, newBracket(startYear)]);
  };

  return (
    <div className="space-y-1">
      {brackets.length > 0 && (
        <div className="grid grid-cols-[3.5rem_3rem_1fr_1.5rem] gap-1 text-xs text-neutral-500">
          <span>Frá</span>
          <span>Ár</span>
          <span>{valueLabel}</span>
          <span />
        </div>
      )}
      {brackets.map((b, i) => (
        <div
          key={i}
          className="grid grid-cols-[3.5rem_3rem_1fr_1.5rem] gap-1 items-center"
        >
          {chained ? (
            <span className="text-xs text-neutral-400 px-1">{b.startYear}</span>
          ) : (
            <input
              type="number"
              value={b.startYear}
              onChange={(e) =>
                updateField(i, { startYear: Number(e.target.value) } as Partial<T>)
              }
              className="w-full border border-neutral-300 px-1 py-0.5 text-xs"
            />
          )}
          <input
            type="number"
            value={b.years}
            onChange={(e) =>
              updateField(i, {
                years: Math.max(1, Number(e.target.value)),
              } as Partial<T>)
            }
            min={1}
            className="w-full border border-neutral-300 px-1 py-0.5 text-xs text-right"
          />
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={getValue(b)}
              onChange={(e) => {
                const updated = [...brackets];
                updated[i] = setValue(updated[i], Number(e.target.value));
                emit(updated);
              }}
              step={valueStep}
              className="w-full border border-neutral-300 px-1 py-0.5 text-xs text-right"
            />
            <span className="text-neutral-400 text-xs shrink-0">{valueSuffix}</span>
          </div>
          {brackets.length > minBrackets && (
            <button
              onClick={() => remove(i)}
              className="text-neutral-400 hover:text-red-600 text-xs"
            >
              x
            </button>
          )}
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs text-neutral-500 hover:text-neutral-800"
      >
        + bæta við tímabili
      </button>
    </div>
  );
}
