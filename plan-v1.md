# Finance Dashboard v1 — Build Plan

## What we're building

A personal investment dashboard for tracking stocks and mutual funds across Zerodha, Groww, and MF Central. Local-only, no backend, React + TypeScript, Capacitor-ready for iOS later.

---

## Tech stack


| Layer          | Choice                         |
| -------------- | ------------------------------ |
| Framework      | React 18 + TypeScript          |
| Build tool     | Vite                           |
| Styling        | Tailwind CSS                   |
| Charts         | Recharts                       |
| Storage        | IndexedDB (via `idb` wrapper)  |
| CSV parsing    | PapaParse                      |
| Live prices    | AngelOne WebSocket             |
| MF NAV         | AMFI daily feed (free, public) |
| Mobile (later) | Capacitor                      |


---

## Project structure

```
src/
├── types/
│   └── index.ts              # Transaction, Holding, AssetType, Platform etc.
├── parsers/
│   ├── zerodha.ts            # Zerodha tradebook CSV parser
│   ├── groww.ts              # Groww CSV parser (stocks + MF separate)
│   └── mf.ts                # MF Central statement parser
├── normalizer/
│   └── index.ts              # Calls parsers, validates, deduplicates, stores
├── store/
│   └── db.ts                 # IndexedDB setup and CRUD helpers (idb)
├── derived/
│   ├── holdings.ts           # Derives Holdings from Transaction store
│   └── insights.ts           # XIRR, P&L, allocation, top/worst performers
├── prices/
│   ├── angelone.ts           # AngelOne WebSocket client (live stock prices)
│   └── amfi.ts               # AMFI NAV fetcher (daily, for MF)
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── Header.tsx
│   ├── overview/
│   │   ├── NetWorthCard.tsx
│   │   ├── PnLCard.tsx
│   │   ├── AllocationChart.tsx
│   │   └── XIRRCard.tsx
│   ├── stocks/
│   │   ├── StockTable.tsx
│   │   └── StockDetail.tsx
│   ├── mutualfunds/
│   │   ├── MFTable.tsx
│   │   └── MFDetail.tsx
│   ├── transactions/
│   │   └── TransactionList.tsx
│   └── import/
│       ├── ImportScreen.tsx
│       └── CSVDropzone.tsx
├── pages/
│   ├── Overview.tsx
│   ├── Stocks.tsx
│   ├── MutualFunds.tsx
│   ├── Transactions.tsx
│   └── Import.tsx
├── hooks/
│   ├── useHoldings.ts        # Reads holdings from IndexedDB
│   ├── useLivePrices.ts      # Subscribes to AngelOne WebSocket
│   └── useInsights.ts        # Computes derived metrics
└── App.tsx
```

---

## Data model

### Transaction (immutable ledger)

```ts
interface Transaction {
  id: string;           // SHA-256 hash for deduplication
  platform: 'zerodha' | 'groww' | 'mf_central';
  asset_type: 'equity' | 'mutual_fund' | 'etf';
  isin: string;
  symbol: string;
  name: string;
  txn_type: 'buy' | 'sell' | 'sip' | 'dividend' | 'switch_in' | 'switch_out' | 'redemption';
  date: string;         // ISO 8601
  units: number;
  price: number;
  amount: number;
  charges: number;
  net_amount: number;
  raw: Record<string, string>;
}
```

### Holding (derived, recomputed on demand)

```ts
interface Holding {
  isin: string;
  symbol: string;
  name: string;
  asset_type: 'equity' | 'mutual_fund' | 'etf';
  platforms: string[];
  units_held: number;
  avg_cost: number;
  invested_amount: number;
  current_price: number;    // from AngelOne or AMFI
  current_value: number;
  unrealised_pnl: number;
  unrealised_pnl_pct: number;
  ltcg_units: number;       // held > 1 year
  stcg_units: number;
}
```

---

## Features — v1 scope

### Import screen

- Drag and drop CSV upload
- Platform selector (Zerodha / Groww / MF Central)
- Preview parsed rows before confirming import
- Deduplication on re-import (safe to re-upload same file)
- Import error reporting (malformed rows highlighted)

### Overview page

- Total current value (net worth)
- Total invested amount
- Overall P&L — absolute (₹) and percentage
- XIRR — annualised return across all holdings
- Allocation donut chart — equity vs mutual fund
- Top 3 gainers, top 3 losers

### Stocks page

- Holdings table: name, units, avg cost, LTP, current value, P&L%, day change%
- Sector allocation chart
- Sortable and searchable

### Mutual Funds page

- Holdings table: scheme name, units, avg NAV, current NAV, current value, XIRR
- Fund category breakdown (large cap / mid cap / sectoral etc.)
- SIP vs lump sum split (derived from txn_type)

### Transactions page

- Full transaction history across all platforms
- Filter by platform, asset type, date range
- Search by name or ISIN

---

## Normalizer logic

```
Raw CSV row
  → platform parser (zerodha / groww / cas)
  → validate (required fields, number parsing, date parsing)
  → enrich (ISIN lookup if missing, name normalisation)
  → dedup check (hash exists in IndexedDB? skip)
  → write to IndexedDB transactions store
  → recompute holdings view
```

Dedup key: `platform + isin + date + units + txn_type`

---

## Live prices

### Stocks — AngelOne WebSocket

- On app load, collect all unique NSE symbols from holdings
- Subscribe to LTP feed for those scrips
- On price tick, update holdings in memory (not persisted — re-fetched on next load)
- Show last updated timestamp

### Mutual Funds — AMFI

- Fetch `https://www.amfiindia.com/spages/NAVAll.txt` once daily
- Parse: scheme code → NAV mapping
- Match against holdings by ISIN or scheme code
- Cache in IndexedDB with date key, refresh if stale

---

## Insights calculations


| Metric       | Method                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| P&L          | `current_value - invested_amount`                                            |
| P&L %        | `(P&L / invested_amount) × 100`                                              |
| XIRR         | Newton-Raphson on dated cashflows (buy = negative, current value = positive) |
| Avg cost     | `total_net_invested / units_held` (weighted, includes charges)               |
| LTCG units   | Transactions where `date < today - 1 year` (equity)                          |
| Allocation % | `asset_value / total_value × 100`                                            |


Use the `xirr` npm package or implement Newton-Raphson directly — it's ~30 lines.

---

## Cursor instructions

Do one step, verify it works, then move to the next.

1. **Scaffold** — `npm create vite@latest . -- --template react-ts`, install deps (`idb`, `papaparse`, `recharts`, `tailwindcss`)
2. **Types** — create `src/types/index.ts` with Transaction and Holding interfaces
3. **IndexedDB store** — create `src/store/db.ts` with `addTransactions`, `getAllTransactions`, `clearAll`
4. **Parsers** — implement `zerodha.ts`, `groww.ts`, `mf.ts` one at a time, test each with a real sample CSV row
5. **Normalizer** — wire parsers into `src/normalizer/index.ts`, add validation + dedup
6. **Holdings derivation** — implement `src/derived/holdings.ts`
7. **AMFI NAV fetcher** — implement `src/prices/amfi.ts`
8. **AngelOne WebSocket** — implement `src/prices/angelone.ts`
9. **Insights** — implement XIRR and other metrics in `src/derived/insights.ts`
10. **Import UI** — build `ImportScreen.tsx` with CSV dropzone and preview table
11. **Overview page** — net worth, P&L, XIRR, allocation chart
12. **Stocks page** — holdings table with live prices
13. **MF page** — holdings table with AMFI NAV
14. **Transactions page** — filterable history
15. **Routing + layout** — wire up pages with sidebar nav

---

## Out of scope for v1

- FDs, PPF, gold, bank accounts
- Backend / cloud sync
- Authentication
- Notifications / alerts
- Benchmark comparison (Nifty 50)
- SIP calendar
- Goals tracking

---

## Notes for Cursor

- Always use `idb` for IndexedDB, never raw `indexedDB` API
- All money values in INR, stored as numbers (not strings)
- Dates always stored as ISO 8601 strings (`YYYY-MM-DD`)
- Holdings are never stored — always recomputed from transactions
- AngelOne WebSocket credentials should go in a `.env` file (`VITE_ANGELONE_TOKEN`)
- Do not use `any` type — keep TypeScript strict

