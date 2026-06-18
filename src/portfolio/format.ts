import type { Holding, Transaction } from '../types';

export type Tab = 'home' | 'transactions' | 'import';
export type HoldingFilter = 'all' | 'stocks' | 'mf';
export type SortKey = 'name' | 'invested' | 'current' | 'pnl_pct';
export type SortDirection = 'asc' | 'desc';
export type RangeOption = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';
export type TxnPlatformFilter = 'all' | 'groww' | 'zerodha' | 'mf_central';

export type HistoryPoint = { date: string; value: number };
export type HistoryState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: HistoryPoint[];
  message?: string;
};

export type RecentImport = {
  id: string;
  platform: string;
  rows: number;
  at: number;
};

export const RANGE_OPTIONS: RangeOption[] = ['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'];

export function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactInr(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absValue >= 10000000) return `${sign}₹${(absValue / 10000000).toFixed(2)}Cr`;
  if (absValue >= 100000) return `${sign}₹${(absValue / 100000).toFixed(2)}L`;
  if (absValue >= 1000) return `${sign}₹${(absValue / 1000).toFixed(1)}K`;
  return `${sign}₹${absValue.toFixed(0)}`;
}

export function formatPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatSignedInr(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatInr(Math.abs(value))}`;
}

export function formatUnits(value: number): string {
  const rounded = value.toFixed(3);
  return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

export function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function formatLongDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRelative(at: number): string {
  const diff = Date.now() - at;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function formatValue(value: number, assetType?: Holding['asset_type']): string {
  const maxFractionDigits = assetType === 'mutual_fund' ? 2 : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: assetType === 'mutual_fund' ? 2 : 0,
  }).format(value);
}

export function parseMfApiDate(value: string): string | null {
  const parts = value.trim().split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

export function filterHistoryByRange(data: HistoryPoint[], range: RangeOption): HistoryPoint[] {
  if (range === 'ALL') return data;
  const now = new Date();
  const cutoff = new Date(now);
  if (range === '1M') cutoff.setMonth(cutoff.getMonth() - 1);
  if (range === '3M') cutoff.setMonth(cutoff.getMonth() - 3);
  if (range === '6M') cutoff.setMonth(cutoff.getMonth() - 6);
  if (range === '1Y') cutoff.setFullYear(cutoff.getFullYear() - 1);
  if (range === '3Y') cutoff.setFullYear(cutoff.getFullYear() - 3);
  if (range === '5Y') cutoff.setFullYear(cutoff.getFullYear() - 5);
  return data.filter((point) => new Date(point.date) >= cutoff);
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function xnpv(rate: number, cashflows: Array<{ amount: number; date: Date }>): number {
  const start = cashflows[0].date;
  return cashflows.reduce((acc, flow) => {
    const years = daysBetween(start, flow.date) / 365;
    return acc + flow.amount / (1 + rate) ** years;
  }, 0);
}

export function xirr(cashflows: Array<{ amount: number; date: Date }>): number | null {
  if (cashflows.length < 2) return null;
  const hasPositive = cashflows.some((flow) => flow.amount > 0);
  const hasNegative = cashflows.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;
  let rate = 0.1;
  const maxIterations = 100;
  const tolerance = 1e-7;

  for (let i = 0; i < maxIterations; i += 1) {
    const value = xnpv(rate, cashflows);
    const derivative = (xnpv(rate + 1e-6, cashflows) - value) / 1e-6;
    if (Math.abs(derivative) < 1e-12) break;
    const nextRate = rate - value / derivative;
    if (!Number.isFinite(nextRate) || nextRate <= -0.999999) break;
    if (Math.abs(nextRate - rate) < tolerance) return Number(nextRate.toFixed(6));
    rate = nextRate;
  }
  return null;
}

export function stripParentheticals(value: string): string {
  let cleaned = value.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();

  const suffixPatterns: RegExp[] = [
    /\s-\s*(direct|regular)\s*plan\s*-\s*(growth option|growth|idcw option|idcw|dividend option|dividend)$/i,
    /\s-\s*(direct|regular)\s*(growth option|growth|idcw option|idcw|dividend option|dividend)$/i,
    /\s-\s*(direct|regular)\s*(growth option|growth|idcw option|idcw|dividend option|dividend)\s*plan$/i,
    /\s*(direct|regular)\s*plan\s*(growth option|growth|idcw option|idcw|dividend option|dividend)$/i,
    /\s*(direct|regular)\s*(growth option|growth|idcw option|idcw|dividend option|dividend)$/i,
    /\s*(direct|regular)\s*(growth option|growth|idcw option|idcw|dividend option|dividend)\s*plan$/i,
    /\s-\s*(growth option|growth|idcw option|idcw|dividend option|dividend)$/i,
    /\s*(growth option|growth|idcw option|idcw|dividend option|dividend)$/i,
    /\s*(growth option|growth|idcw option|idcw|dividend option|dividend)\s*plan$/i,
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of suffixPatterns) {
      if (pattern.test(cleaned)) {
        cleaned = cleaned.replace(pattern, '').replace(/\s+/g, ' ').trim();
        changed = true;
      }
    }
  }
  return cleaned.replace(/\s*-\s*$/, '').trim();
}

export function buildFundSubtitle(name: string): string {
  const lower = name.toLowerCase();
  const plan = lower.includes('direct') ? 'Direct' : 'Regular';
  const payout = lower.includes('idcw') || lower.includes('dividend') ? 'IDCW' : 'Growth';
  return `${plan} · ${payout}`;
}

export function resolvePillLabel(assetType: string, name: string): string {
  if (assetType === 'mutual_fund') {
    const lower = name.toLowerCase();
    if (lower.includes('idcw') || lower.includes('dividend')) return 'IDCW';
    if (lower.includes('direct')) return 'MF';
    return 'MF-R';
  }
  if (assetType === 'etf') return 'ETF';
  if (assetType === 'equity') return 'EQ';
  if (assetType === 'commodity') return 'COMM';
  if (assetType === 'options') return 'OPT';
  if (assetType === 'futures') return 'FUT';
  if (assetType === 'reit') return 'REIT';
  if (assetType === 'invit') return 'InvIT';
  return assetType.toUpperCase();
}

export function formatEquitySymbol(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/, '');
}

export function holdingSubtitle(holding: Holding): string {
  return holding.asset_type === 'mutual_fund'
    ? buildFundSubtitle(holding.name)
    : `NSE · ${formatEquitySymbol(holding.symbol)}`;
}

export function sanitizePlatformFileLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes('groww')) return 'groww';
  if (lower.includes('zerodha')) return 'zerodha';
  if (lower.includes('mfcentral')) return 'mf_central';
  return '';
}

export function isSellType(txnType: Transaction['txn_type']): boolean {
  return txnType === 'sell' || txnType === 'switch_out' || txnType === 'redemption';
}

export function isBuyType(txnType: Transaction['txn_type']): boolean {
  return txnType === 'buy' || txnType === 'switch_in';
}

export function formatTxnLabel(txnType: Transaction['txn_type']): string {
  switch (txnType) {
    case 'buy':
      return 'Buy';
    case 'sell':
      return 'Sell';
    case 'sip':
      return 'SIP';
    case 'dividend':
      return 'Dividend';
    case 'switch_in':
      return 'Switch in';
    case 'switch_out':
      return 'Switch out';
    case 'redemption':
      return 'Redemption';
    default:
      return txnType;
  }
}

export const PLATFORM_LABELS: Record<string, string> = {
  groww: 'Groww',
  zerodha: 'Zerodha',
  mf_central: 'MF Central',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}
