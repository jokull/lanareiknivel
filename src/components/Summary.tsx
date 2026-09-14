import type { MonthResult } from "../types";
import { fmtISKShort } from "../utils/format";

interface LoanScheduleData {
  loan: { id: string; name: string; balance: number };
  scenarios: [MonthResult[], MonthResult[], MonthResult[]];
}

interface Props {
  loanSchedules: LoanScheduleData[];
}

function totalPaid(schedule: MonthResult[]): number {
  return schedule.reduce(
    (s, m) => s + m.payment + m.extra + m.pension,
    0
  );
}

function payoffMonth(schedule: MonthResult[]): string {
  for (const m of schedule) {
    if (m.balance <= 0) return m.month;
  }
  return schedule.length > 0
    ? ">" + schedule[schedule.length - 1].month
    : "–";
}

export function Summary({ loanSchedules }: Props) {
  const combinedPaid = [0, 1, 2].map((si) =>
    loanSchedules.reduce((s, ls) => s + totalPaid(ls.scenarios[si]), 0)
  );

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-bold">Yfirlit</h2>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="border-b border-neutral-300">
              <th className="text-left py-1 pr-2">Lán</th>
              <th className="text-right py-1 px-2">Eftirst.</th>
              <th className="text-right py-1 px-2">Uppgr.</th>
              <th className="text-right py-1 px-2">Greitt (Bjartsýn)</th>
              <th className="text-right py-1 px-2">Greitt (Grunn)</th>
              <th className="text-right py-1 px-2">Greitt (Varúð)</th>
            </tr>
          </thead>
          <tbody>
            {loanSchedules.map((ls) => (
              <tr key={ls.loan.id} className="border-b border-neutral-100">
                <td className="py-1 pr-2">{ls.loan.name}</td>
                <td className="text-right py-1 px-2">
                  {fmtISKShort(ls.loan.balance)}
                </td>
                <td className="text-right py-1 px-2">
                  {payoffMonth(ls.scenarios[1])}
                </td>
                <td className="text-right py-1 px-2 text-green-700">
                  {fmtISKShort(totalPaid(ls.scenarios[0]))}
                </td>
                <td className="text-right py-1 px-2">
                  {fmtISKShort(totalPaid(ls.scenarios[1]))}
                </td>
                <td className="text-right py-1 px-2 text-red-700">
                  {fmtISKShort(totalPaid(ls.scenarios[2]))}
                </td>
              </tr>
            ))}
            {loanSchedules.length > 1 && (
              <tr className="border-t border-neutral-300 font-bold">
                <td className="py-1 pr-2">Samtals</td>
                <td className="text-right py-1 px-2">
                  {fmtISKShort(
                    loanSchedules.reduce((s, ls) => s + ls.loan.balance, 0)
                  )}
                </td>
                <td className="text-right py-1 px-2"></td>
                <td className="text-right py-1 px-2 text-green-700">
                  {fmtISKShort(combinedPaid[0])}
                </td>
                <td className="text-right py-1 px-2">
                  {fmtISKShort(combinedPaid[1])}
                </td>
                <td className="text-right py-1 px-2 text-red-700">
                  {fmtISKShort(combinedPaid[2])}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
