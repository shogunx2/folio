import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getPortfolioSnapshot, importAndNormalize, refreshQuotes } from '../services/portfolio';
import { warmAmfiSchemeMap } from '../services/amfiSchemeMap';
import { warmNseIsinMap } from '../services/nseIsinMap';
import type { Holding, Platform, Transaction } from '../types';
import {
  filterHistoryByRange,
  formatEquitySymbol,
  parseMfApiDate,
  sanitizePlatformFileLabel,
  xirr,
} from './format';
import type {
  HistoryPoint,
  HistoryState,
  HoldingFilter,
  RangeOption,
  RecentImport,
  SortDirection,
  SortKey,
  Tab,
  TxnPlatformFilter,
} from './format';

const THEME_KEY = 'folio-theme';
const ACCENT_GAIN = '#00A862';
const ACCENT_LOSS = '#E11D2E';

function readInitialDark(): boolean {
  if (typeof window === 'undefined') return false;
  const stored = window.localStorage.getItem(THEME_KEY);
  if (stored === 'dark') return true;
  if (stored === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export type PortfolioVM = ReturnType<typeof usePortfolio>;

export function usePortfolio() {
  const [tab, setTab] = useState<Tab>('home');
  const [filter, setFilter] = useState<HoldingFilter>('all');
  const [platform, setPlatform] = useState<Platform>('groww');
  const [txnPlatform, setTxnPlatform] = useState<TxnPlatformFilter>('all');
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
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('Import statements to start building your portfolio.');
  const [isFallbackPricing, setIsFallbackPricing] = useState(false);
  const [search, setSearch] = useState('');
  const [sortState, setSortState] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'current',
    direction: 'desc',
  });
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({ status: 'idle', data: [] });
  const [range, setRange] = useState<RangeOption>('1Y');
  const [sheetOffset, setSheetOffset] = useState(0);
  const [isDraggingSheet, setIsDraggingSheet] = useState(false);
  const [recentImports, setRecentImports] = useState<RecentImport[]>([]);
  const [dark, setDark] = useState<boolean>(readInitialDark);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sheetDragRef = useRef<{ startY: number; startOffset: number } | null>(null);

  const loadSnapshot = useCallback(async () => {
    const snapshot = await getPortfolioSnapshot();
    setTransactions(snapshot.transactions);
    setHoldings(snapshot.holdings);
    setSummary(snapshot.insights);
  }, []);

  useEffect(() => {
    loadSnapshot().catch(() => {
      setMessage('Could not load local portfolio data.');
    });
    warmNseIsinMap();
    warmAmfiSchemeMap();
  }, [loadSnapshot]);

  // Theme: drive data-theme on <html> and persist preference.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  const toggleTheme = useCallback(() => setDark((value) => !value), []);

  // Per-holding price history (MF via mfapi.in, equities via Yahoo proxy).
  useEffect(() => {
    if (!selectedHolding) {
      setHistoryState({ status: 'idle', data: [] });
      return;
    }
    let cancelled = false;

    async function fetchHistory(holding: Holding) {
      if (holding.asset_type === 'mutual_fund') {
        if (!holding.scheme_code) {
          if (!cancelled) setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
          return;
        }
        setHistoryState({ status: 'loading', data: [] });
        try {
          const response = await fetch(`https://api.mfapi.in/mf/${holding.scheme_code}`);
          if (!response.ok) {
            if (!cancelled) setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
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
          if (!cancelled) setHistoryState({ status: 'ready', data: points });
        } catch {
          if (!cancelled) setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
        }
        return;
      }

      setHistoryState({ status: 'loading', data: [] });
      try {
        const symbol = formatEquitySymbol(holding.symbol);
        const response = await fetch(
          `/yahoo-api/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=5y`,
        );
        if (!response.ok) {
          if (!cancelled) setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
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
        if (!cancelled) setHistoryState({ status: 'ready', data: points });
      } catch {
        if (!cancelled) setHistoryState({ status: 'error', data: [], message: 'Historical data unavailable' });
      }
    }

    fetchHistory(selectedHolding);
    return () => {
      cancelled = true;
    };
  }, [selectedHolding]);

  useEffect(() => {
    if (selectedHolding) setSheetOffset(0);
  }, [selectedHolding]);

  const closeDetail = useCallback(() => {
    setSelectedHolding(null);
    setSheetOffset(0);
    setIsDraggingSheet(false);
    sheetDragRef.current = null;
  }, []);

  useEffect(() => {
    if (!selectedHolding) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeDetail();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHolding, closeDetail]);

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

    return [...filtered].sort((a, b) => {
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
        default:
          return 0;
      }
    });
  }, [filteredHoldings, search, sortState]);

  const holdingsCount = filteredHoldings.length;

  const filteredTransactions = useMemo(() => {
    const list = txnPlatform === 'all'
      ? transactions
      : transactions.filter((txn) => txn.platform === txnPlatform);
    return [...list].sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, txnPlatform]);

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

  const chartStroke = chartHeader && chartHeader.delta < 0 ? ACCENT_LOSS : ACCENT_GAIN;

  const chartDomain = useMemo(() => {
    if (filteredHistory.length === 0) return undefined;
    const values = filteredHistory.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const spread = maxValue - minValue;
    const padding = spread === 0 ? Math.max(1, maxValue * 0.01) : spread * 0.08;
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

  const toggleSort = useCallback((key: SortKey) => {
    setSortState((current) => {
      if (current.key === key) {
        return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  }, []);

  const openHolding = useCallback((holding: Holding) => {
    setRange('1Y');
    setSelectedHolding(holding);
  }, []);

  const onSheetHandlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingSheet(true);
    setSheetOffset((offset) => {
      sheetDragRef.current = { startY: event.clientY, startOffset: offset };
      return offset;
    });
  }, []);

  const onSheetHandlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!sheetDragRef.current) return;
    const delta = event.clientY - sheetDragRef.current.startY;
    setSheetOffset(Math.max(0, sheetDragRef.current.startOffset + delta));
  }, []);

  const onSheetHandlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!sheetDragRef.current) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      setIsDraggingSheet(false);
      sheetDragRef.current = null;
      setSheetOffset((offset) => {
        if (offset > 120) {
          closeDetail();
          return 0;
        }
        return 0;
      });
    },
    [closeDetail],
  );

  const importFile = useCallback(
    async (file: File) => {
      const inferred = sanitizePlatformFileLabel(file.name);
      if (inferred) setPlatform(inferred as Platform);
      const usedPlatform = inferred ? (inferred as Platform) : platform;

      setBusy(true);
      setMessage('Importing statement…');
      try {
        const buffer = await file.arrayBuffer();
        const result = await importAndNormalize(usedPlatform, buffer);
        setMessage(
          `Imported ${result.imported}, skipped ${result.skipped}, invalid ${result.invalid}${result.invalid > 0 ? ' (check statement format)' : ''}.`,
        );
        setRecentImports((current) =>
          [{ id: `${Date.now()}`, platform: usedPlatform, rows: result.imported, at: Date.now() }, ...current].slice(0, 5),
        );
        await loadSnapshot();
      } catch {
        setMessage('Import failed. Please verify file type and platform.');
      } finally {
        setBusy(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [platform, loadSnapshot],
  );

  const onPickFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) void importFile(file);
    },
    [importFile],
  );

  const onRefreshPrices = useCallback(async () => {
    setRefreshing(true);
    setBusy(true);
    setMessage('Refreshing prices…');
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
      setRefreshing(false);
    }
  }, [loadSnapshot]);

  return {
    // navigation + theme
    tab,
    setTab,
    dark,
    toggleTheme,
    // home filters
    filter,
    setFilter,
    search,
    setSearch,
    sortState,
    toggleSort,
    // import + activity filters
    platform,
    setPlatform,
    txnPlatform,
    setTxnPlatform,
    // data
    holdings,
    transactions,
    summary,
    displayedHoldings,
    holdingsCount,
    filteredTransactions,
    recentImports,
    // status
    busy,
    refreshing,
    message,
    isFallbackPricing,
    // detail sheet
    selectedHolding,
    openHolding,
    closeDetail,
    historyState,
    range,
    setRange,
    filteredHistory,
    chartHeader,
    chartStroke,
    chartDomain,
    holdingXirr,
    holdingTransactions,
    sheetOffset,
    isDraggingSheet,
    onSheetHandlePointerDown,
    onSheetHandlePointerMove,
    onSheetHandlePointerUp,
    // actions
    fileInputRef,
    onPickFile,
    importFile,
    onRefreshPrices,
  };
}
