# Lánareiknivél — verðtryggð húsnæðislán

Interactive calculator for Icelandic CPI-indexed (verðtryggð) mortgages, live at
**https://lanareiknivel.solberg.club**.

- Month-by-month schedules for any number of loans: jafngreiðslur or jafnar
  afborganir, rate steps, extra-principal plans by year, séreignarsparnaður
  applied to principal with the program's annual cap
- Real CPI history (Hagstofa VIS01004, *vísitala neysluverðs til
  verðtryggingar*) followed by a bracketed inflation path, shown as three
  scenarios (bjartsýn / grunn / varúð)
- Yearly tables, milestones (peak balance, 50% repaid, payoff), and a debt /
  property-value / equity chart with nominal and real-terms views
- All state lives in the URL fragment, so any configuration is a shareable link

The same engine is available as stdlib-only Python scripts for agents and
terminals in [jokull/fjarmalalaesi](https://github.com/jokull/fjarmalalaesi)
(`lanareiknivel.py`, verified field-exact against this code, and
`portfolio.py`, which reconstructs a loan's history exactly from a bank's
payment export).

## Develop

```bash
bun install
bun run dev      # http://localhost:5173
bun run build    # dist/
```

## Your own debt/equity history

`src/data/debt-equity.json` ships with **synthetic example data**. To chart your
own loans, build it from your bank's payment history and the HMS housing price
index:

```bash
bun scripts/build-debt-equity.ts loans.json property.json
```

See the header of `scripts/build-debt-equity.ts` for the input shapes. Note the
bank's payment table states amounts in base-index kronur — see
`references/verdtrygging.md` §10 in the fjarmalalaesi repo for the exact
reconstruction. The workbook upload in the chart is parsed entirely in the
browser; nothing is sent anywhere.

## Model

Per month, per loan: `indexed = balance × CPI[m+1]/CPI[m]`; interest on the
indexed balance; annuity payment recalculated on the indexed balance over the
remaining term; `balance' = indexed − principal − extra − séreign`. Amounts are
rounded to whole kronur monthly, projected CPI to 0.1. Scenarios derive from the
base inflation path: −0.5pp (floor 2.0) and +0.7pp (cap 6.0).

MIT
