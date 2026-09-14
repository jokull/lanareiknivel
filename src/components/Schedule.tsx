import { useMemo, useState } from "react";
import type { LoanInput, MonthResult } from "../types";
import { fmtISKShort } from "../utils/format";
import { detectMilestones, milestonesForYear, type Milestone } from "../milestones";

interface LoanScheduleData {
  loan: LoanInput;
  scenarios: [MonthResult[], MonthResult[], MonthResult[]];
}

interface Props {
  loanSchedules: LoanScheduleData[];
}

interface YearGroup {
  year: number;
  monthIndices: number[];
}

function groupMonthsByYear(months: MonthResult[]): YearGroup[] {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < months.length; i++) {
    const year = parseInt(months[i].month.split("-")[0]);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year)!.push(i);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, indices]) => ({ year, monthIndices: indices }));
}

function getMonthAt(schedule: MonthResult[], idx: number): MonthResult | null {
  return idx < schedule.length ? schedule[idx] : null;
}

function sumRange(
  schedule: MonthResult[],
  indices: number[],
  field: keyof Pick<
    MonthResult,
    "payment" | "interest" | "principalRepaid" | "indexation" | "extra" | "pension"
  >
): number {
  return indices.reduce((s, i) => {
    const m = getMonthAt(schedule, i);
    return s + (m ? m[field] : 0);
  }, 0);
}

function endBalanceForRange(
  schedule: MonthResult[],
  indices: number[]
): number {
  const lastIdx = indices[indices.length - 1];
  const m = getMonthAt(schedule, lastIdx);
  return m ? m.balance : 0;
}

export function Schedule({ loanSchedules }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const maxMonths = Math.max(
    ...loanSchedules.map((ls) => ls.scenarios[1].length)
  );
  if (maxMonths === 0) return null;

  const longestBase = loanSchedules.reduce(
    (longest, ls) =>
      ls.scenarios[1].length > longest.length ? ls.scenarios[1] : longest,
    loanSchedules[0].scenarios[1]
  );
  const yearGroups = groupMonthsByYear(longestBase);

  const toggleYear = (year: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const hasMultipleLoans = loanSchedules.length > 1;
  const milestones = useMemo(() => detectMilestones(loanSchedules), [loanSchedules]);

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold">Greiðsluskrá</h2>
      <div className="overflow-x-auto">
        <table className="text-xs w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-neutral-400">
              <th className="text-left py-1 pr-2 sticky left-0 bg-white" rowSpan={2}>
                Tímabil
              </th>
              {loanSchedules.map((ls) => (
                <th
                  key={ls.loan.id}
                  className="text-center py-1 px-1 border-l-2 border-neutral-300"
                  colSpan={5}
                >
                  {ls.loan.name}
                </th>
              ))}
              {hasMultipleLoans && (
                <th
                  className="text-center py-1 px-1 border-l-2 border-neutral-600"
                  colSpan={2}
                >
                  Samtals
                </th>
              )}
            </tr>
            <tr className="border-b border-neutral-300 text-neutral-500">
              {loanSchedules.map((ls) => (
                <SubHeaders key={ls.loan.id} />
              ))}
              {hasMultipleLoans && (
                <>
                  <th className="text-right py-1 px-1 border-l-2 border-neutral-600">
                    Greiðsla
                  </th>
                  <th className="text-right py-1 px-1">Eftirst. B/G/V</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {yearGroups.map((yg) => {
              const isExpanded = expanded.has(yg.year);
              return (
                <YearRows
                  key={yg.year}
                  yearGroup={yg}
                  loanSchedules={loanSchedules}
                  isExpanded={isExpanded}
                  onToggle={() => toggleYear(yg.year)}
                  hasMultipleLoans={hasMultipleLoans}
                  milestones={milestonesForYear(milestones, yg.year)}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SubHeaders() {
  return (
    <>
      <th className="text-right py-1 px-1 border-l-2 border-neutral-300">
        Verðbætur
      </th>
      <th className="text-right py-1 px-1">Greiðsla</th>
      <th className="text-right py-1 px-1">Vextir</th>
      <th className="text-right py-1 px-1">Afborgun</th>
      <th className="text-right py-1 px-1">Eftirst. B/G/V</th>
    </>
  );
}

const MILESTONE_COLORS: Record<Milestone["color"], string> = {
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  neutral: "bg-neutral-100 text-neutral-600",
};

function MilestoneBadges({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) return null;
  return (
    <>
      {milestones.map((m, i) => (
        <span
          key={i}
          className={`inline-block ml-2 px-1.5 py-0 rounded text-[10px] font-normal ${MILESTONE_COLORS[m.color]}`}
        >
          {m.loanName}: {m.label}
        </span>
      ))}
    </>
  );
}

function YearRows({
  yearGroup,
  loanSchedules,
  isExpanded,
  onToggle,
  hasMultipleLoans,
  milestones,
}: {
  yearGroup: YearGroup;
  loanSchedules: LoanScheduleData[];
  isExpanded: boolean;
  onToggle: () => void;
  hasMultipleLoans: boolean;
  milestones: Milestone[];
}) {
  const { year, monthIndices } = yearGroup;

  const yearRow = (
    <tr
      key={`y-${year}`}
      className="border-b border-neutral-200 bg-neutral-50 cursor-pointer hover:bg-neutral-100 font-bold"
      onClick={onToggle}
    >
      <td className="py-1 pr-2 sticky left-0 bg-neutral-50">
        <span className="text-neutral-400 mr-1">{isExpanded ? "v" : ">"}</span>
        {year}
        <MilestoneBadges milestones={milestones} />
      </td>
      {loanSchedules.map((ls) => {
        const base = ls.scenarios[1];
        const totalIdx = sumRange(base, monthIndices, "indexation");
        const totalPmt = sumRange(base, monthIndices, "payment")
          + sumRange(base, monthIndices, "extra")
          + sumRange(base, monthIndices, "pension");
        const totalInt = sumRange(base, monthIndices, "interest");
        const totalPrinc = sumRange(base, monthIndices, "principalRepaid");
        const endOpt = endBalanceForRange(ls.scenarios[0], monthIndices);
        const endBase = endBalanceForRange(ls.scenarios[1], monthIndices);
        const endCon = endBalanceForRange(ls.scenarios[2], monthIndices);
        return (
          <LoanYearCells
            key={ls.loan.id}
            totalIdx={totalIdx}
            totalPmt={totalPmt}
            totalInt={totalInt}
            totalPrinc={totalPrinc}
            endOpt={endOpt}
            endBase={endBase}
            endCon={endCon}
          />
        );
      })}
      {hasMultipleLoans && (
        <CombinedYearCells
          loanSchedules={loanSchedules}
          monthIndices={monthIndices}
        />
      )}
    </tr>
  );

  const monthRows = isExpanded
    ? monthIndices.map((mi, rowIdx) => (
        <tr
          key={`m-${mi}`}
          className={`border-b border-neutral-100 ${
            rowIdx % 2 === 0 ? "bg-white" : "bg-neutral-50/50"
          } hover:bg-blue-50/30`}
        >
          <td className="py-0.5 pr-2 pl-4 sticky left-0 bg-inherit text-neutral-500">
            {loanSchedules[0]?.scenarios[1][mi]?.month ?? ""}
          </td>
          {loanSchedules.map((ls) => {
            const opt = getMonthAt(ls.scenarios[0], mi);
            const base = getMonthAt(ls.scenarios[1], mi);
            const con = getMonthAt(ls.scenarios[2], mi);
            return (
              <LoanMonthCells
                key={ls.loan.id}
                opt={opt}
                base={base}
                con={con}
              />
            );
          })}
          {hasMultipleLoans && (
            <CombinedMonthCells loanSchedules={loanSchedules} monthIdx={mi} />
          )}
        </tr>
      ))
    : [];

  return (
    <>
      {yearRow}
      {monthRows}
    </>
  );
}

function LoanYearCells({
  totalIdx,
  totalPmt,
  totalInt,
  totalPrinc,
  endOpt,
  endBase,
  endCon,
}: {
  totalIdx: number;
  totalPmt: number;
  totalInt: number;
  totalPrinc: number;
  endOpt: number;
  endBase: number;
  endCon: number;
}) {
  const dead = totalPmt === 0 && totalIdx === 0 && endBase === 0;
  if (dead) {
    return (
      <>
        <td className="border-l-2 border-neutral-300" colSpan={5}></td>
      </>
    );
  }
  return (
    <>
      <td className="text-right py-1 px-1 border-l-2 border-neutral-300">
        {fmtISKShort(totalIdx)}
      </td>
      <td className="text-right py-1 px-1">{fmtISKShort(totalPmt)}</td>
      <td className="text-right py-1 px-1">{fmtISKShort(totalInt)}</td>
      <td className="text-right py-1 px-1">{fmtISKShort(totalPrinc)}</td>
      <td className="text-right py-1 px-1 text-[10px]">
        <span className="text-green-700">{fmtISKShort(endOpt)}</span>
        {" / "}
        {fmtISKShort(endBase)}
        {" / "}
        <span className="text-red-700">{fmtISKShort(endCon)}</span>
      </td>
    </>
  );
}

function LoanMonthCells({
  opt,
  base,
  con,
}: {
  opt: MonthResult | null;
  base: MonthResult | null;
  con: MonthResult | null;
}) {
  if (!base)
    return (
      <>
        <td className="border-l-2 border-neutral-300" colSpan={5}></td>
      </>
    );
  return (
    <>
      <td className="text-right py-0.5 px-1 border-l-2 border-neutral-300">
        {fmtISKShort(base.indexation)}
      </td>
      <td className="text-right py-0.5 px-1">
        {fmtISKShort(base.payment + base.extra + base.pension)}
      </td>
      <td className="text-right py-0.5 px-1">{fmtISKShort(base.interest)}</td>
      <td className="text-right py-0.5 px-1">
        {fmtISKShort(base.principalRepaid)}
      </td>
      <td className="text-right py-0.5 px-1 text-[10px]">
        <span className="text-green-700">
          {fmtISKShort(opt?.balance ?? 0)}
        </span>
        {" / "}
        {fmtISKShort(base.balance)}
        {" / "}
        <span className="text-red-700">{fmtISKShort(con?.balance ?? 0)}</span>
      </td>
    </>
  );
}

function CombinedYearCells({
  loanSchedules,
  monthIndices,
}: {
  loanSchedules: LoanScheduleData[];
  monthIndices: number[];
}) {
  const totalPmt = loanSchedules.reduce(
    (s, ls) =>
      s +
      sumRange(ls.scenarios[1], monthIndices, "payment") +
      sumRange(ls.scenarios[1], monthIndices, "extra") +
      sumRange(ls.scenarios[1], monthIndices, "pension"),
    0
  );
  const endOpt = loanSchedules.reduce(
    (s, ls) => s + endBalanceForRange(ls.scenarios[0], monthIndices),
    0
  );
  const endBase = loanSchedules.reduce(
    (s, ls) => s + endBalanceForRange(ls.scenarios[1], monthIndices),
    0
  );
  const endCon = loanSchedules.reduce(
    (s, ls) => s + endBalanceForRange(ls.scenarios[2], monthIndices),
    0
  );

  if (totalPmt === 0 && endBase === 0) {
    return (
      <>
        <td className="border-l-2 border-neutral-600" colSpan={2}></td>
      </>
    );
  }

  return (
    <>
      <td className="text-right py-1 px-1 border-l-2 border-neutral-600 font-bold">
        {fmtISKShort(totalPmt)}
      </td>
      <td className="text-right py-1 px-1 text-[10px] font-bold">
        <span className="text-green-700">{fmtISKShort(endOpt)}</span>
        {" / "}
        {fmtISKShort(endBase)}
        {" / "}
        <span className="text-red-700">{fmtISKShort(endCon)}</span>
      </td>
    </>
  );
}

function CombinedMonthCells({
  loanSchedules,
  monthIdx,
}: {
  loanSchedules: LoanScheduleData[];
  monthIdx: number;
}) {
  const totalPmt = loanSchedules.reduce((s, ls) => {
    const m = getMonthAt(ls.scenarios[1], monthIdx);
    return s + (m ? m.payment + m.extra + m.pension : 0);
  }, 0);
  const endOpt = loanSchedules.reduce((s, ls) => {
    const m = getMonthAt(ls.scenarios[0], monthIdx);
    return s + (m?.balance ?? 0);
  }, 0);
  const endBase = loanSchedules.reduce((s, ls) => {
    const m = getMonthAt(ls.scenarios[1], monthIdx);
    return s + (m?.balance ?? 0);
  }, 0);
  const endCon = loanSchedules.reduce((s, ls) => {
    const m = getMonthAt(ls.scenarios[2], monthIdx);
    return s + (m?.balance ?? 0);
  }, 0);

  if (totalPmt === 0 && endBase === 0) {
    return (
      <>
        <td className="border-l-2 border-neutral-600" colSpan={2}></td>
      </>
    );
  }

  return (
    <>
      <td className="text-right py-0.5 px-1 border-l-2 border-neutral-600">
        {fmtISKShort(totalPmt)}
      </td>
      <td className="text-right py-0.5 px-1 text-[10px]">
        <span className="text-green-700">{fmtISKShort(endOpt)}</span>
        {" / "}
        {fmtISKShort(endBase)}
        {" / "}
        <span className="text-red-700">{fmtISKShort(endCon)}</span>
      </td>
    </>
  );
}
