# EV Session Analytics

Classifies EV charging sessions per the business spec (v2.0 FINAL) and reports KPIs and trends.

- `packages/core` — rule engine, file ingest/aggregation, KPI and trend maths (pure TypeScript, shared by web and API)
- `apps/web` — React front end

```
pnpm install
pnpm test        # unit tests + golden test (needs fixtures/private/Data_raw.xlsx, git-ignored)
```
