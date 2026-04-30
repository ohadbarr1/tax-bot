# Bank of Israel daily FX rates

Per-currency daily reference rates ("שער יציג") published by the Bank of Israel.
Used by `lib/fx.ts#getFxRate()` to convert foreign-currency amounts to ILS at the
**transaction-date rate** (per סעיף 91(ג) לפקודת מס הכנסה ותקנות מס הכנסה (המרה
למטבע ישראלי)). Annual-mean conversion is **not** legally compliant.

## File layout

One file per currency:

- `usd_ils_daily.json` — USD/ILS
- `eur_ils_daily.json` — EUR/ILS
- `gbp_ils_daily.json` — GBP/ILS

Schema:

```json
{
  "currency": "USD",
  "base": "ILS",
  "source": "Bank of Israel — https://www.boi.org.il/PublicApi/GetExchangeRates",
  "rates": {
    "2024-01-02": 3.627,
    "2024-01-03": 3.605,
    ...
  }
}
```

Keys are ISO `YYYY-MM-DD`. Values are rates expressed as ILS per 1 unit of the
foreign currency. Weekends and Israeli bank holidays are absent — `getFxRate()`
falls back to the most-recent prior business day (sliding back ≤ 7 days).

## Backfill

Run `node scripts/seed-fx-rates.mjs` with network access. The script is
idempotent (merges into the existing file). See the script header for options.

## Current coverage

The committed JSONs ship with a **hand-curated seed** of well-known anchor
dates per year (annual averages, year-end rates) so unit tests pass in CI even
without network. Production deployments **must** run the backfill script before
serving capital-gains calculations to users — otherwise `getFxRate()` will fall
back to the seeded annual mean and emit a warning.
