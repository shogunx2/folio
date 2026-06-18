import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from 'recharts';
import './App.css';
import { getPortfolioSnapshot, importAndNormalize, refreshQuotes } from './services/portfolio';
import { warmAmfiSchemeMap } from './services/amfiSchemeMap';
import { warmNseIsinMap } from './services/nseIsinMap';
import type { Holding, Platform, Transaction } from './types';

type Tab = 'home' | 'transactions' | 'import';
type HoldingFilter = 'all' | 'stocks' | 'mf';
type SortKey = 'name' | 'invested' | 'current' | 'pnl_pct' | 'xirr';
type SortDirection = 'asc' | 'desc';
type RangeOption = '1M' | '3M' | '6M' | '1Y' | '3Y' | '5Y' | 'ALL';
type HistoryPoint = { date: string; value: number };
type HistoryState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: HistoryPoint[];
  message?: string;
};

function formatInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactInr(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absValue >= 10000000) return `${sign}₹${(absValue / 10000000).toFixed(1)}Cr`;
  if (absValue >= 100000) return `${sign}₹${(absValue / 100000).toFixed(1)}L`;
  if (absValue >= 1000) return `${sign}₹${(absValue / 1000).toFixed(1)}K`;
  return `${sign}₹${absValue.toFixed(0)}`;
}

function formatPct(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatSignedInr(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}${formatInr(Math.abs(value))}`;
}

function formatUnits(value: number): string {
  const rounded = value.toFixed(3);
  return rounded.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

function formatShortDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatLongDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatValue(value: number, assetType?: Holding['asset_type']): string {
  const maxFractionDigits = assetType === 'mutual_fund' ? 2 : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: maxFractionDigits,
    minimumFractionDigits: assetType === 'mutual_fund' ? 2 : 0,
  }).format(value);
}

function parseMfApiDate(value: string): string | null {
  const parts = value.trim().split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function filterHistoryByRange(data: HistoryPoint[], range: RangeOption): HistoryPoint[] {
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

function xirr(cashflows: Array<{ amount: number; date: Date }>): number | null {
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

function stripParentheticals(value: string): string {
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


function buildFundSubtitle(name: string): string {
  const lower = name.toLowerCase();
  const plan = lower.includes('direct') ? 'Direct' : 'Regular';
  const payout = lower.includes('idcw') || lower.includes('dividend') ? 'IDCW' : 'Growth';
  return `${plan} · ${payout}`;
}

function resolvePillLabel(assetType: string, name: string): string {
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

function formatEquitySymbol(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/, '');
}

function sanitizePlatformFileLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes('groww')) return 'groww';
  if (lower.includes('zerodha')) return 'zerodha';
  if (lower.includes('mfcentral')) return 'mf_central';
  return '';
}

function isSellType(txnType: Transaction['txn_type']): boolean {
  return txnType === 'sell' || txnType === 'switch_out' || txnType === 'redemption';
}

function formatTxnLabel(txnType: Transaction['txn_type']): string {
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

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12.5L12 6l7 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7.5 11v8h9v-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 7h11M8 12h11M8 17h11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="4.5" cy="7" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="4.5" cy="17" r="1.2" fill="currentColor" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15V6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.8 9.2L12 6l3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M5 18.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [filter, setFilter] = useState<HoldingFilter>('all');
  const [platform, setPlatform] = useState<Platform>('groww');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState({
    total_invested: 0,
    total_current_value: 0,
    total_unrealised_pnl: 0,
    total_unrealised_pnl_pct: 0,
    equity_allocation_pct: 0,
    mf_allocation_pct: 0,
    xirr: null as number | null,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Import statements to start building your portfolio.');
  const [isFallbackPricing, setIsFallbackPricing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortState, setSortState] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'name',
    direction: 'asc',
  });
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'idle', data: [] });
  const [range, setRange] = useState<RangeOption>('1Y');
  const [sheetOffset, setSheetOffset] = useState(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sheetDragRef = useRef<{ startY: number; startOffset: number } | null>(null);

  async function loadSnapshot() {
    const snapshot = await getPortfolioSnapshot();
    setTransactions(snapshot.transactions);
    setHoldings(snapshot.holdings);
    setSummary(snapshot.insights);
  }

  useEffect(() => {
    loadSnapshot().catch(() => {
      setMessage('Could not load local portfolio data.');
    });
    warmNseIsinMap();
    warmAmfiSchemeMap();
  }, []);

  useEffect(() => {
    if (!selectedHolding) {
      setHistoryState({ status: 'idle', data: [] });
      return;
    }

    async function fetchHistory() {
      if (selectedHolding.asset_type === 'mutual_fund') {
        if (!selectedHolding.scheme_code) {
          setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
          return;
        }
        setHistoryState({ status: 'loading', data: [] });
        try {
          const response = await fetch(`https://api.mfapi.in/mf/${selectedHolding.scheme_code}`);
          if (!response.ok) {
            setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
            return;
          }
          const payload = (await response.json()) as { data?: Array<{ date: string; nav: string }> };
          const points = (payload.data ?? [])
            .map((row) => {
              const date = parseMfApiDate(row.date);
              const value = Number(row.nav);
              if (!date || !Number.isFinite(value)) return null;
              return { date, value };
            })
            .filter((point): point is HistoryPoint => Boolean(point))
            .reverse();
          setHistoryState({ status: 'ready', data: points });
        } catch {
          setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
        }
        return;
      }

      setHistoryState({ status: 'loading', data: [] });
      try {
        const symbol = formatEquitySymbol(selectedHolding.symbol);
        const response = await fetch(
          `/yahoo-api/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=5y`,
        );
        if (!response.ok) {
          setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
          return;
        }
        const payload = (await response.json()) as {
          chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> };
        };
        const result = payload.chart?.result?.[0];
        const timestamps = result?.timestamp ?? [];
        const closes = result?.indicators?.quote?.[0]?.close ?? [];
        const points = timestamps
          .map((ts, index) => {
            const value = closes[index];
            if (!value || !Number.isFinite(value)) return null;
            const date = new Date(ts * 1000).toISOString().slice(0, 10);
            return { date, value };
          })
          .filter((point): point is HistoryPoint => Boolean(point));
        setHistoryState({ status: 'ready', data: points });
      } catch {
        setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
      }
    }

    fetchHistory();
  }, [selectedHolding]);

  useEffect(() => {
    if (selectedHolding) setSheetOffset(0);
  }, [selectedHolding]);

  useEffect(() => {
    function handleResize() {
      setIsDesktop(window.innerWidth >= 768);
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!selectedHolding) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHolding]);

  const filteredHoldings = useMemo(() => {
    if (filter === 'all') return holdings;
    if (filter === 'stocks') return holdings.filter((holding) => holding.asset_type !== 'mutual_fund');
    return holdings.filter((holding) => holding.asset_type === 'mutual_fund');
  }, [holdings, filter]);

  const displayedHoldings = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? filteredHoldings.filter((holding) => holding.name.toLowerCase().includes(query))
      : filteredHoldings;

    const sorted = [...filtered].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;
      switch (sortState.key) {
        case 'name':
          return a.name.localeCompare(b.name) * direction;
        case 'invested':
          return (a.invested_amount - b.invested_amount) * direction;
        case 'current':
          return (a.current_value - b.current_value) * direction;
        case 'pnl_pct':
          return (a.unrealised_pnl_pct - b.unrealised_pnl_pct) * direction;
        case 'xirr':
          return 0;
        default:
          return 0;
      }
    });

    return sorted;
  }, [filteredHoldings, search, sortState]);

  const holdingTransactions = useMemo(() => {
    if (!selectedHolding) return [];
    const filtered = transactions.filter((txn) => {
      if (selectedHolding.asset_type === 'mutual_fund') {
        return txn.asset_type === 'mutual_fund' && txn.name.toLowerCase() === selectedHolding.name.toLowerCase();
      }
      return txn.isin === selectedHolding.isin || txn.symbol === selectedHolding.symbol;
    });
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedHolding, transactions]);

  const filteredHistory = useMemo(
    () => filterHistoryByRange(historyState.data, range),
    [historyState.data, range],
  );

  const chartHeader = useMemo(() => {
    if (filteredHistory.length === 0) return null;
    const start = filteredHistory[0]?.value ?? 0;
    const end = filteredHistory[filteredHistory.length - 1]?.value ?? 0;
    const delta = end - start;
    const pct = start !== 0 ? (delta / start) * 100 : 0;
    return { current: end, delta, pct };
  }, [filteredHistory]);

  const chartStroke = chartHeader && chartHeader.delta < 0 ? '#d85a30' : '#1D9E75';

  const chartDomain = useMemo(() => {
    if (filteredHistory.length === 0) return undefined;
    const values = filteredHistory.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue;
    const padding = range === 0 ? Math.max(1, maxValue * 0.01) : range * 0.08;
    return [minValue - padding, maxValue + padding] as [number, number];
  }, [filteredHistory]);

  const holdingXirr = useMemo(() => {
    if (!selectedHolding || holdingTransactions.length === 0 || historyState.data.length === 0) return null;
    const cashflows = holdingTransactions.map((txn) => {
      const sign =
        txn.txn_type === 'buy' || txn.txn_type === 'sip' || txn.txn_type === 'switch_in' ? -1 : 1;
      return { amount: sign * txn.net_amount, date: new Date(txn.date) };
    });
    cashflows.push({ amount: selectedHolding.current_value, date: new Date() });
    cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());
    return xirr(cashflows);
  }, [selectedHolding, holdingTransactions, historyState.data.length]);

  function toggleSort(key: SortKey) {
    setSortState((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  }

  function sortIndicator(key: SortKey): string {
    if (sortState.key !== key) return '';
    return sortState.direction === 'asc' ? '↑' : '↓';
  }

  function closeDetail() {
    setSelectedHolding(null);
    setSheetOffset(0);
    setIsDraggingSheet(false);
    sheetDragRef.current = null;
  }

  function onSheetHandlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (isDesktop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingSheet(true);
    sheetDragRef.current = { startY: event.clientY, startOffset: sheetOffset };
  }

  function onSheetHandlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (isDesktop) return;
    if (!isDraggingSheet || !sheetDragRef.current) return;
    const delta = event.clientY - sheetDragRef.current.startY;
    const nextOffset = Math.max(0, sheetDragRef.current.startOffset + delta);
    setSheetOffset(nextOffset);
  }

  function onSheetHandlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (isDesktop) return;
    if (!sheetDragRef.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsDraggingSheet(false);
    sheetDragRef.current = null;
    if (sheetOffset > 120) {
      closeDetail();
    } else {
      setSheetOffset(0);
    }
  }

  async function onPickFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const inferred = sanitizePlatformFileLabel(file.name);
    if (inferred) setPlatform(inferred as Platform);

    setBusy(true);
    setMessage('Importing statement...');
    try {
      const buffer = await file.arrayBuffer();
      const result = await importAndNormalize(inferred ? (inferred as Platform) : platform, buffer);
      setMessage(
        `Imported ${result.imported}, skipped ${result.skipped}, invalid ${result.invalid}${result.invalid > 0 ? ' (check statement format)' : ''}.`,
      );
      await loadSnapshot();
    } catch {
      setMessage('Import failed. Please verify file type and platform.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function onRefreshPrices() {
    setBusy(true);
    setMessage('Refreshing prices...');
    try {
      const result = await refreshQuotes();
      setIsFallbackPricing(result.usedFallback);
      await loadSnapshot();
      setMessage('Prices refreshed.');
    } catch {
      setMessage('Could not refresh prices right now. Showing cached values.');
      setIsFallbackPricing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h1 className="logo">
          <span>fo</span>
          <span>lio</span>
        </h1>
        <button type="button" className="live-badge" onClick={onRefreshPrices} disabled={busy}>
          <span className={isFallbackPricing ? 'live-dot fallback' : 'live-dot'} />
          Live · NSE
        </button>
      </header>

      <p className="status">{message}</p>

      {selectedHolding && (
        <div className="detail-overlay" onClick={closeDetail}>
          <div
            className={isDesktop ? 'detail-sheet is-desktop' : 'detail-sheet'}
            onClick={(event) => event.stopPropagation()}
            style={
              isDesktop
                ? undefined
                : {
                    transform: `translateY(${sheetOffset}px)`,
                    transition: isDraggingSheet ? 'none' : 'transform 180ms ease',
                  }
            }
          >
            <div
              className="sheet-handle"
              style={{ touchAction: 'none' }}
              onPointerDown={onSheetHandlePointerDown}
              onPointerMove={onSheetHandlePointerMove}
              onPointerUp={onSheetHandlePointerUp}
              onPointerCancel={onSheetHandlePointerUp}
            />
            <header className="detail-header">
              <button type="button" className="close-btn" onClick={closeDetail} aria-label="Close">
                X
              </button>
              <button type="button" className="back-btn" onClick={closeDetail}>
                ←
              </button>
              <div>
                <h2 className="detail-title">{stripParentheticals(selectedHolding.name)}</h2>
                <p className="detail-subtitle">
                  {selectedHolding.asset_type === 'mutual_fund'
                    ? buildFundSubtitle(selectedHolding.name)
                    : `NSE · ${formatEquitySymbol(selectedHolding.symbol)}`}
                </p>
              </div>
            </header>

            <section className="detail-summary">
              <div>
                <p className="detail-label">Units held</p>
                <p className="detail-value">{formatUnits(selectedHolding.units_held)}</p>
              </div>
              <div>
                <p className="detail-label">Avg cost</p>
                <p className="detail-value">{formatInr(selectedHolding.avg_cost)}</p>
              </div>
              <div>
                <p className="detail-label">Invested</p>
                <p className="detail-value">{formatInr(selectedHolding.invested_amount)}</p>
              </div>
              <div>
                <p className="detail-label">Current value</p>
                <p className="detail-value">{formatInr(selectedHolding.current_value)}</p>
              </div>
              <div>
                <p className="detail-label">P&amp;L</p>
                <p className={selectedHolding.unrealised_pnl >= 0 ? 'detail-value up' : 'detail-value down'}>
                  {formatSignedInr(selectedHolding.unrealised_pnl)} ({formatPct(selectedHolding.unrealised_pnl_pct)})
                </p>
              </div>
              {holdingXirr !== null && (
                <div>
                  <p className="detail-label">XIRR</p>
                  <p className="detail-value">{formatPct(holdingXirr * 100)}</p>
                </div>
              )}
            </section>

            <section className="detail-chart">
              <div className="detail-chart-header">
                <p className="detail-price">
                  {chartHeader ? formatValue(chartHeader.current, selectedHolding.asset_type) : '--'}
                </p>
                <p className={chartHeader && chartHeader.delta >= 0 ? 'detail-change up' : 'detail-change down'}>
                  {chartHeader
                    ? `${formatSignedInr(chartHeader.delta)} (${formatPct(chartHeader.pct)}) since ${range}`
                    : '--'}
                </p>
              </div>
              <div className="range-pills">
                {(['1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as RangeOption[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={range === option ? 'range-pill active' : 'range-pill'}
                    onClick={() => setRange(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              {historyState.status === 'error' && (
                <p className="empty">{historyState.message ?? 'Historical data unavailable'}</p>
              )}
              {historyState.status !== 'error' && filteredHistory.length === 0 && (
                <p className="empty">Loading history...</p>
              )}
              {filteredHistory.length > 0 && (
                <div className="chart-wrap">
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={filteredHistory}>
                      <YAxis hide domain={chartDomain} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const point = payload[0].payload as HistoryPoint;
                          const label = formatLongDate(point.date);
                          const value = formatValue(point.value, selectedHolding.asset_type);
                          const prefix = selectedHolding.asset_type === 'mutual_fund' ? 'NAV ' : '';
                          return (
                            <div className="chart-tooltip">
                              {prefix}{value} · {label}
                            </div>
                          );
                        }}
                        cursor={{ stroke: '#333', strokeWidth: 1 }}
                      />
                      <Line type="monotone" dataKey="value" stroke={chartStroke} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="detail-transactions">
              <h3 className="section-label">Transactions</h3>
              {holdingTransactions.length === 0 ? (
                <p className="empty">
                  Transaction history unavailable — import complete history for full details
                </p>
              ) : (
                <div className="transaction-list">
                  {holdingTransactions.map((txn) => (
                    <div key={txn.id} className="transaction-row">
                      <div>
                        <p className="title">{formatShortDate(txn.date)}</p>
                        <p className={isSellType(txn.txn_type) ? 'down' : 'up'}>{formatTxnLabel(txn.txn_type)}</p>
                      </div>
                      <div className="right">
                        <p className="title">{formatUnits(txn.units)}</p>
                        <p className="subtext">{formatInr(txn.price)}</p>
                      </div>
                      <div className="right">
                        <p className="title">{formatInr(txn.net_amount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <main className="content">
        {tab === 'home' && (
          <>
            <section className="stats-grid">
              <article className="card">
                <h2 className="section-label">Net Worth</h2>
                <p className="value">{formatCompactInr(summary.total_current_value)}</p>
              </article>
              <article className="card">
                <h2 className="section-label">Invested</h2>
                <p className="value">{formatCompactInr(summary.total_invested)}</p>
              </article>
              <article className="card">
                <h2 className="section-label">Total P&amp;L</h2>
                <p className={`value ${summary.total_unrealised_pnl >= 0 ? 'up' : 'down'}`}>
                  {formatCompactInr(summary.total_unrealised_pnl)}
                </p>
                <p className={summary.total_unrealised_pnl >= 0 ? 'up subtext' : 'down subtext'}>
                  {formatPct(summary.total_unrealised_pnl_pct)}
                </p>
              </article>
              <article className="card">
                <h2 className="section-label">XIRR</h2>
                <p className="value">{summary.xirr === null ? '--' : formatPct(summary.xirr * 100)}</p>
              </article>
            </section>

            <section className="card">
              <div className="row-between">
                <h2 className="section-label">Allocation</h2>
              </div>
              <div className="allocation-wrap">
                <svg className="donut" viewBox="0 0 120 120" aria-hidden="true">
                  <circle cx="60" cy="60" r="46" className="donut-track" />
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    className="donut-segment equity-stroke"
                    style={
                      {
                        '--seg': `${summary.equity_allocation_pct}`,
                        '--off': '0',
                      } as React.CSSProperties
                    }
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    className="donut-segment mf-stroke"
                    style={
                      {
                        '--seg': `${summary.mf_allocation_pct}`,
                        '--off': `${summary.equity_allocation_pct}`,
                      } as React.CSSProperties
                    }
                  />
                </svg>
                <div className="legend">
                  <p>
                    <span className="dot equity" />
                    Equity {summary.equity_allocation_pct.toFixed(0)}%
                  </p>
                  <p>
                    <span className="dot mf" />
                    Mutual funds {summary.mf_allocation_pct.toFixed(0)}%
                  </p>
                </div>
              </div>
            </section>

            <section className="card">
              <div className="row-between">
                <h2 className="section-label">Holdings</h2>
                <div className="chips">
                  <button className={filter === 'all' ? 'chip active' : 'chip'} onClick={() => setFilter('all')}>
                    All
                  </button>
                  <button
                    className={filter === 'stocks' ? 'chip active' : 'chip'}
                    onClick={() => setFilter('stocks')}
                  >
                    Stocks
                  </button>
                  <button className={filter === 'mf' ? 'chip active' : 'chip'} onClick={() => setFilter('mf')}>
                    MF
                  </button>
                </div>
              </div>
              <div className="holdings-search">
                <input
                  type="search"
                  placeholder="Search holdings"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="table-wrap">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      <th>
                        <button type="button" className="sort-btn" onClick={() => toggleSort('name')}>
                          Name <span className="sort-indicator">{sortIndicator('name')}</span>
                        </button>
                      </th>
                      <th>Type</th>
                      <th>Units</th>
                      <th>
                        <button type="button" className="sort-btn" onClick={() => toggleSort('invested')}>
                          Invested <span className="sort-indicator">{sortIndicator('invested')}</span>
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-btn" onClick={() => toggleSort('current')}>
                          Current <span className="sort-indicator">{sortIndicator('current')}</span>
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-btn" onClick={() => toggleSort('pnl_pct')}>
                          P&amp;L <span className="sort-indicator">{sortIndicator('pnl_pct')}</span>
                        </button>
                      </th>
                      <th>
                        <button type="button" className="sort-btn" onClick={() => toggleSort('xirr')}>
                          XIRR <span className="sort-indicator">{sortIndicator('xirr')}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedHoldings.length === 0 && (
                      <tr>
                        <td colSpan={7} className="empty">
                          No holdings yet.
                        </td>
                      </tr>
                    )}
                    {displayedHoldings.map((holding) => (
                      <tr
                        key={holding.isin}
                        className="holding-row"
                        onClick={() => setSelectedHolding(holding)}
                      >
                        <td>
                          <p className="title">
                            {stripParentheticals(holding.name)}
                            {holding.unmapped_isin && <span className="unmapped-dot" aria-hidden="true" />}
                          </p>
                          <p className="subtext holding-subtext">
                            {holding.asset_type === 'mutual_fund'
                              ? buildFundSubtitle(holding.name)
                              : `NSE · ${formatEquitySymbol(holding.symbol)}`}
                          </p>
                        </td>
                        <td>
                          <span className={holding.asset_type === 'mutual_fund' ? 'type-pill mf-pill' : 'type-pill eq-pill'}>
                            {resolvePillLabel(holding.asset_type, holding.name)}
                          </span>
                        </td>
                        <td className="units-cell">{formatUnits(holding.units_held)}</td>
                        <td>{formatInr(holding.invested_amount)}</td>
                        <td>{formatInr(holding.current_value)}</td>
                        <td className={holding.unrealised_pnl >= 0 ? 'up' : 'down'}>
                          <div className="pnl-cell">
                            <span className="pnl-value">{formatSignedInr(holding.unrealised_pnl)}</span>
                            <span className="pnl-subtext">{formatPct(holding.unrealised_pnl_pct)}</span>
                          </div>
                        </td>
                        <td className={holding.unrealised_pnl >= 0 ? 'up' : 'down'}>--</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {tab === 'transactions' && (
          <section className="card">
            <h2 className="section-label">Transactions</h2>
            <div className="list">
              {transactions.length === 0 && <p className="empty">No transactions imported yet.</p>}
              {transactions.map((transaction) => (
                <article key={transaction.id} className="list-item">
                  <div>
                    <p className="title">{transaction.name}</p>
                    <p className="subtext">
                      {transaction.platform} · {transaction.date}
                    </p>
                  </div>
                  <div className="right">
                    <p className={transaction.txn_type === 'sell' || transaction.txn_type === 'redemption' ? 'down' : 'up'}>
                      {transaction.txn_type.toUpperCase()}
                    </p>
                    <p className="subtext">{formatInr(transaction.net_amount)}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {tab === 'import' && (
          <section className="card import-card">
            <h2 className="section-label">Import Statement</h2>
            <p className="subtext">Select platform and upload CSV/XLSX statement.</p>
            <div className="chips">
              <button
                type="button"
                className={platform === 'groww' ? 'chip active' : 'chip'}
                onClick={() => setPlatform('groww')}
              >
                Groww
              </button>
              <button
                type="button"
                className={platform === 'zerodha' ? 'chip active' : 'chip'}
                onClick={() => setPlatform('zerodha')}
              >
                Zerodha
              </button>
              <button
                type="button"
                className={platform === 'mf_central' ? 'chip active' : 'chip'}
                onClick={() => setPlatform('mf_central')}
              >
                MF Central
              </button>
            </div>
            <label htmlFor="statement-file" className="upload-btn">
              Choose file
            </label>
            <input
              id="statement-file"
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx"
              onChange={onPickFile}
              disabled={busy}
            />
          </section>
        )}
      </main>

      <nav className="bottom-nav">
        <button type="button" className={tab === 'home' ? 'nav-btn active' : 'nav-btn'} onClick={() => setTab('home')}>
          <HomeIcon />
        </button>
        <button
          type="button"
          className={tab === 'transactions' ? 'nav-btn active' : 'nav-btn'}
          onClick={() => setTab('transactions')}
        >
          <ListIcon />
        </button>
        <button
          type="button"
          className={tab === 'import' ? 'nav-btn active' : 'nav-btn'}
          onClick={() => setTab('import')}
        >
          <UploadIcon />
        </button>
      </nav>
    </div>
  );
}

export default App;
