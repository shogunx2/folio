import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import './mobile.css';
import { usePortfolio } from './usePortfolio';
import {
  CloseIcon,
  HomeIcon,
  ListIcon,
  MoonIcon,
  RefreshIcon,
  SunIcon,
  UploadIcon,
} from './icons';
import {
  RANGE_OPTIONS,
  buildFundSubtitle,
  formatCompactInr,
  formatEquitySymbol,
  formatInr,
  formatLongDate,
  formatPct,
  formatRelative,
  formatShortDate,
  formatSignedInr,
  formatTxnLabel,
  formatUnits,
  formatValue,
  holdingSubtitle,
  isBuyType,
  isSellType,
  platformLabel,
  resolvePillLabel,
  stripParentheticals,
} from './format';
import type { HistoryPoint, HoldingFilter, RangeOption, Tab, TxnPlatformFilter } from './format';
import type { Platform, Transaction } from '../types';

const HOLDING_FILTERS: Array<{ key: HoldingFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'mf', label: 'Funds' },
];

const TXN_FILTERS: Array<{ key: TxnPlatformFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'groww', label: 'Groww' },
  { key: 'zerodha', label: 'Zerodha' },
  { key: 'mf_central', label: 'MF Central' },
];

const IMPORT_SOURCES: Array<{ key: Platform; label: string; note: string }> = [
  { key: 'groww', label: 'Groww', note: 'Stocks & mutual funds' },
  { key: 'zerodha', label: 'Zerodha', note: 'Tradebook / holdings' },
  { key: 'mf_central', label: 'MF Central', note: 'Consolidated MF statement' },
];

function pnlClass(value: number): string {
  return value >= 0 ? 'gain' : 'loss';
}

function txnTagClass(txn: Transaction): string {
  if (isSellType(txn.txn_type)) return 'tag-loss';
  if (txn.txn_type === 'sip') return 'tag-accent';
  return 'tag-ink';
}

export default function MobileApp() {
  const vm = usePortfolio();

  return (
    <div className="folio">
      <div className="folio-page" data-tab={vm.tab}>
        <header className="folio-top">
          <h1 className="wordmark">folio</h1>
          <div className="top-actions">
            <button type="button" className="icon-btn" onClick={vm.toggleTheme} aria-label="Toggle theme">
              {vm.dark ? <SunIcon /> : <MoonIcon />}
            </button>
            <button
              type="button"
              className={`live-pill${vm.refreshing ? ' is-refreshing' : ''}${vm.isFallbackPricing ? ' is-fallback' : ''}`}
              onClick={vm.onRefreshPrices}
              disabled={vm.busy}
            >
              <span className="live-dot" />
              LIVE · NSE
              <span className={`live-spin${vm.refreshing ? ' spinning' : ''}`}>
                <RefreshIcon />
              </span>
            </button>
          </div>
        </header>

        <main className="folio-main" key={vm.tab}>
          {vm.tab === 'home' && <HomeView vm={vm} />}
          {vm.tab === 'transactions' && <ActivityView vm={vm} />}
          {vm.tab === 'import' && <ImportView vm={vm} />}
        </main>
      </div>

      {vm.selectedHolding && <DetailSheet vm={vm} />}

      <TabBar tab={vm.tab} setTab={vm.setTab} />
    </div>
  );
}

function HomeView({ vm }: { vm: ReturnType<typeof usePortfolio> }) {
  const { summary } = vm;
  const eqWeight = Math.max(summary.equity_allocation_pct, 0);
  const mfWeight = Math.max(summary.mf_allocation_pct, 0);

  return (
    <div className="view fade-up">
      <section className="networth">
        <p className="eyebrow">NET WORTH</p>
        <p className="networth-value">{formatCompactInr(summary.total_current_value)}</p>
        <p className={`networth-pnl ${pnlClass(summary.total_unrealised_pnl)}`}>
          {formatSignedInr(summary.total_unrealised_pnl)} · {formatPct(summary.total_unrealised_pnl_pct)} all time
        </p>
      </section>

      <section className="stat-pair">
        <div className="stat">
          <p className="eyebrow">INVESTED</p>
          <p className="stat-value">{formatCompactInr(summary.total_invested)}</p>
        </div>
        <div className="stat">
          <p className="eyebrow">XIRR</p>
          <p className="stat-value accent">{summary.xirr === null ? '—' : formatPct(summary.xirr * 100)}</p>
        </div>
      </section>

      <section className="allocation">
        <p className="eyebrow">ALLOCATION</p>
        <div className="alloc-bar">
          {eqWeight > 0 && <span className="alloc-seg seg-equity" style={{ flex: eqWeight }} />}
          {mfWeight > 0 && <span className="alloc-seg seg-funds" style={{ flex: mfWeight }} />}
          {eqWeight === 0 && mfWeight === 0 && <span className="alloc-seg seg-empty" style={{ flex: 1 }} />}
        </div>
        <div className="alloc-legend">
          <span className="legend-item">
            <span className="swatch swatch-equity" />
            Equity <b>{summary.equity_allocation_pct.toFixed(0)}%</b>
          </span>
          <span className="legend-item">
            <span className="swatch swatch-funds" />
            Funds <b>{summary.mf_allocation_pct.toFixed(0)}%</b>
          </span>
        </div>
      </section>

      <section className="holdings">
        <div className="holdings-head">
          <h2 className="serif-title">
            Holdings <span className="count">{vm.holdingsCount}</span>
          </h2>
          <div className="sort-menu">
            <span className="sort-label">SORT</span>
            <select
              className="sort-select"
              value={`${vm.sortState.key}:${vm.sortState.direction}`}
              onChange={(event) => {
                const [key] = event.target.value.split(':');
                vm.toggleSort(key as typeof vm.sortState.key);
              }}
            >
              <option value="current:desc">Value</option>
              <option value="pnl_pct:desc">P&amp;L %</option>
              <option value="invested:desc">Invested</option>
              <option value="name:asc">Name</option>
            </select>
          </div>
        </div>

        <div className="chip-row">
          {HOLDING_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`chip${vm.filter === item.key ? ' active' : ''}`}
              onClick={() => vm.setFilter(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="search"
          placeholder="Search holdings"
          value={vm.search}
          onChange={(event) => vm.setSearch(event.target.value)}
        />

        <div className="holding-list">
          {vm.displayedHoldings.length === 0 && (
            <p className="empty">No holdings yet — import a statement to begin.</p>
          )}
          {vm.displayedHoldings.map((holding) => (
            <button
              key={holding.isin}
              type="button"
              className="holding-row"
              onClick={() => vm.openHolding(holding)}
            >
              <div className="holding-left">
                <p className="holding-name">
                  {stripParentheticals(holding.name)}
                  {holding.unmapped_isin && <span className="unmapped-dot" aria-hidden="true" />}
                </p>
                <p className="holding-sub">
                  <span className="type-tag">{resolvePillLabel(holding.asset_type, holding.name)}</span>
                  {holdingSubtitle(holding)}
                </p>
              </div>
              <div className="holding-right">
                <p className="holding-value">{formatInr(holding.current_value)}</p>
                <p className={`holding-pnl ${pnlClass(holding.unrealised_pnl)}`}>
                  {formatPct(holding.unrealised_pnl_pct)}
                </p>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActivityView({ vm }: { vm: ReturnType<typeof usePortfolio> }) {
  return (
    <div className="view fade-up">
      <header className="page-head">
        <h2 className="page-title">Activity</h2>
        <p className="page-desc">Every buy, sell and SIP across your linked brokers.</p>
      </header>

      <div className="chip-row">
        {TXN_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`chip${vm.txnPlatform === item.key ? ' active' : ''}`}
            onClick={() => vm.setTxnPlatform(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="txn-list">
        {vm.filteredTransactions.length === 0 && <p className="empty">No transactions imported yet.</p>}
        {vm.filteredTransactions.map((txn) => (
          <div key={txn.id} className="txn-row">
            <span className="txn-date">{formatShortDate(txn.date)}</span>
            <div className="txn-mid">
              <p className="txn-name">{stripParentheticals(txn.name)}</p>
              <p className="txn-meta">
                <span className={txnTagClass(txn)}>{formatTxnLabel(txn.txn_type)}</span>
                <span className="dot-sep">·</span>
                {platformLabel(txn.platform)}
              </p>
            </div>
            <div className="txn-right">
              <p className={`txn-amount ${isSellType(txn.txn_type) ? 'loss' : isBuyType(txn.txn_type) ? '' : 'gain'}`}>
                {isSellType(txn.txn_type) ? '−' : '+'}
                {formatInr(txn.net_amount)}
              </p>
              <p className="txn-units">{formatUnits(txn.units)} units</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ImportView({ vm }: { vm: ReturnType<typeof usePortfolio> }) {
  const active = IMPORT_SOURCES.find((source) => source.key === vm.platform) ?? IMPORT_SOURCES[0];

  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void vm.importFile(file);
  }

  return (
    <div className="view fade-up">
      <header className="page-head">
        <h2 className="page-title">Import</h2>
        <p className="page-desc">Bring in CSV or XLSX statements from your brokers.</p>
      </header>

      <p className="eyebrow">SOURCE</p>
      <div className="source-list">
        {IMPORT_SOURCES.map((source) => (
          <button
            key={source.key}
            type="button"
            className={`source-row${vm.platform === source.key ? ' active' : ''}`}
            onClick={() => vm.setPlatform(source.key)}
          >
            <div>
              <p className="source-label">{source.label}</p>
              <p className="source-note">{source.note}</p>
            </div>
            <span className={`radio${vm.platform === source.key ? ' on' : ''}`} />
          </button>
        ))}
      </div>

      <label
        className="dropzone"
        htmlFor="statement-file"
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        <span className="drop-icon">
          <UploadIcon size={22} />
        </span>
        <p className="drop-title">Drop your {active.label} file</p>
        <p className="drop-sub">CSV or XLSX · up to 10 MB</p>
        <span className="choose-btn">{vm.busy ? 'Working…' : 'Choose file'}</span>
        <input
          id="statement-file"
          ref={vm.fileInputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={vm.onPickFile}
          disabled={vm.busy}
          hidden
        />
      </label>

      {vm.message && <p className="import-status">{vm.message}</p>}

      {vm.recentImports.length > 0 && (
        <section className="recent">
          <p className="eyebrow">RECENT IMPORTS</p>
          <div className="recent-list">
            {vm.recentImports.map((item) => (
              <div key={item.id} className="recent-row">
                <span className="recent-label">{platformLabel(item.platform)}</span>
                <span className="recent-time">{formatRelative(item.at)}</span>
                <span className="recent-rows">+{item.rows}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function DetailSheet({ vm }: { vm: ReturnType<typeof usePortfolio> }) {
  const holding = vm.selectedHolding;
  if (!holding) return null;

  return (
    <div className="scrim" onClick={vm.closeDetail}>
      <div
        className="sheet"
        onClick={(event) => event.stopPropagation()}
        style={{
          transform: `translateY(${vm.sheetOffset}px)`,
          transition: vm.isDraggingSheet ? 'none' : undefined,
        }}
      >
        <div
          className="sheet-handle-zone"
          style={{ touchAction: 'none' }}
          onPointerDown={vm.onSheetHandlePointerDown}
          onPointerMove={vm.onSheetHandlePointerMove}
          onPointerUp={vm.onSheetHandlePointerUp}
          onPointerCancel={vm.onSheetHandlePointerUp}
        >
          <span className="sheet-handle" />
        </div>

        <div className="sheet-body">
          <header className="sheet-head">
            <div>
              <h2 className="sheet-title">{stripParentheticals(holding.name)}</h2>
              <p className="sheet-sub">
                <span className="type-tag">{resolvePillLabel(holding.asset_type, holding.name)}</span>
                {holding.asset_type === 'mutual_fund'
                  ? buildFundSubtitle(holding.name)
                  : `NSE · ${formatEquitySymbol(holding.symbol)}`}
              </p>
            </div>
            <button type="button" className="close-btn" onClick={vm.closeDetail} aria-label="Close">
              <CloseIcon />
            </button>
          </header>

          <section className="price-block">
            <p className="price-value">{formatInr(holding.current_value)}</p>
            <p className={`price-pnl ${pnlClass(holding.unrealised_pnl)}`}>
              {formatSignedInr(holding.unrealised_pnl)} · {formatPct(holding.unrealised_pnl_pct)}
            </p>
          </section>

          <Chart vm={vm} />

          <div className="range-row">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`range-btn${vm.range === option ? ' active' : ''}`}
                onClick={() => vm.setRange(option as RangeOption)}
              >
                {option}
              </button>
            ))}
          </div>

          <section className="stat-grid">
            <div className="grid-cell">
              <p className="eyebrow">UNITS</p>
              <p className="cell-value">{formatUnits(holding.units_held)}</p>
            </div>
            <div className="grid-cell">
              <p className="eyebrow">AVG COST</p>
              <p className="cell-value">{formatInr(holding.avg_cost)}</p>
            </div>
            <div className="grid-cell">
              <p className="eyebrow">INVESTED</p>
              <p className="cell-value">{formatInr(holding.invested_amount)}</p>
            </div>
            <div className="grid-cell">
              <p className="eyebrow">XIRR</p>
              <p className="cell-value accent">
                {vm.holdingXirr === null ? '—' : formatPct(vm.holdingXirr * 100)}
              </p>
            </div>
          </section>

          <section className="sheet-txns">
            <h3 className="serif-title">Transactions</h3>
            {vm.holdingTransactions.length === 0 ? (
              <p className="empty">Transaction history unavailable — import complete history for full details.</p>
            ) : (
              <div className="txn-list compact">
                {vm.holdingTransactions.map((txn) => (
                  <div key={txn.id} className="txn-row">
                    <span className="txn-date">{formatShortDate(txn.date)}</span>
                    <div className="txn-mid">
                      <p className="txn-meta">
                        <span className={txnTagClass(txn)}>{formatTxnLabel(txn.txn_type)}</span>
                        <span className="dot-sep">·</span>
                        {formatInr(txn.price)}
                      </p>
                    </div>
                    <div className="txn-right">
                      <p className="txn-amount">{formatInr(txn.net_amount)}</p>
                      <p className="txn-units">{formatUnits(txn.units)} units</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Chart({ vm }: { vm: ReturnType<typeof usePortfolio> }) {
  const holding = vm.selectedHolding;
  if (!holding) return null;

  if (vm.historyState.status === 'error') {
    return <p className="chart-empty">{vm.historyState.message ?? 'Historical data unavailable'}</p>;
  }
  if (vm.filteredHistory.length === 0) {
    return <p className="chart-empty">Loading history…</p>;
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={vm.filteredHistory} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
          <YAxis hide domain={vm.chartDomain} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as HistoryPoint;
              const label = formatLongDate(point.date);
              const value = formatValue(point.value, holding.asset_type);
              const prefix = holding.asset_type === 'mutual_fund' ? 'NAV ' : '';
              return (
                <div className="chart-tooltip">
                  {prefix}
                  {value} · {label}
                </div>
              );
            }}
            cursor={{ stroke: 'var(--hair)', strokeWidth: 1 }}
          />
          <Line type="monotone" dataKey="value" stroke={vm.chartStroke} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function TabBar({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const tabs: Array<{ key: Tab; icon: React.ReactNode; label: string }> = [
    { key: 'home', icon: <HomeIcon />, label: 'Home' },
    { key: 'transactions', icon: <ListIcon />, label: 'Activity' },
    { key: 'import', icon: <UploadIcon />, label: 'Import' },
  ];

  return (
    <nav className="tabbar">
      <div className="tabbar-spec" aria-hidden="true" />
      {tabs.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`tab${tab === item.key ? ' active' : ''}`}
          onClick={() => setTab(item.key)}
          aria-label={item.label}
        >
          {item.icon}
        </button>
      ))}
    </nav>
  );
}
