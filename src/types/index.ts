export type Platform = 'zerodha' | 'groww' | 'mf_central';

export type AssetType = 'equity' | 'mutual_fund' | 'etf';

export type TransactionType =
  | 'buy'
  | 'sell'
  | 'sip'
  | 'dividend'
  | 'switch_in'
  | 'switch_out'
  | 'redemption';

export interface Transaction {
  id: string;
  platform: Platform;
  asset_type: AssetType;
  isin: string;
  symbol: string;
  name: string;
  txn_type: TransactionType;
  date: string;
  units: number;
  price: number;
  amount: number;
  charges: number;
  net_amount: number;
  raw: Record<string, string>;
}

export interface ParseIssue {
  row: number;
  reason: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  transactions: Omit<Transaction, 'id'>[];
  issues: ParseIssue[];
  portfolio_holdings?: MfPortfolioHolding[];
}

export interface ImportSummary {
  imported: number;
  skipped: number;
  invalid: number;
  issues: ParseIssue[];
}

export interface Holding {
  isin: string;
  symbol: string;
  name: string;
  asset_type: AssetType;
  platforms: Platform[];
  scheme_code?: string;
  units_held: number;
  avg_cost: number;
  invested_amount: number;
  current_price: number;
  current_value: number;
  unrealised_pnl: number;
  unrealised_pnl_pct: number;
  ltcg_units: number;
  stcg_units: number;
  unmapped_isin?: boolean;
}

export interface MfPortfolioHolding {
  key: string;
  scheme_name: string;
  folios: string[];
  units: number;
  invested_value: number;
  current_value: number;
  returns: number;
  scheme_code?: string;
  unmatched?: boolean;
}

export interface PriceQuote {
  isin: string;
  symbol: string;
  name?: string;
  price: number;
  previous_close?: number;
  as_of: string;
  source: 'yahoo' | 'amfi';
}

export interface PortfolioInsights {
  total_invested: number;
  total_current_value: number;
  total_unrealised_pnl: number;
  total_unrealised_pnl_pct: number;
  equity_allocation_pct: number;
  mf_allocation_pct: number;
  xirr: number | null;
}
