import type { Holding, MfPortfolioHolding, PriceQuote, Transaction } from '../types';

type PositionState = {
  isin: string;
  symbol: string;
  name: string;
  asset_type: Holding['asset_type'];
  platforms: Set<Holding['platforms'][number]>;
  units_held: number;
  invested_amount: number;
  buyLots: Array<{ date: string; units: number }>;
  unmapped_isin: boolean;
};

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function applyBuy(state: PositionState, txn: Transaction): void {
  state.units_held += txn.units;
  state.invested_amount += txn.net_amount;
  state.buyLots.push({ date: txn.date, units: txn.units });
}

function applySellLike(state: PositionState, txn: Transaction): void {
  if (state.units_held <= 0) return;
  const sellUnits = Math.min(txn.units, state.units_held);
  const avgCost = state.units_held > 0 ? state.invested_amount / state.units_held : 0;
  state.units_held -= sellUnits;
  state.invested_amount -= avgCost * sellUnits;

  let remainingToReduce = sellUnits;
  for (const lot of state.buyLots) {
    if (remainingToReduce <= 0) break;
    const reduced = Math.min(lot.units, remainingToReduce);
    lot.units -= reduced;
    remainingToReduce -= reduced;
  }
  state.buyLots = state.buyLots.filter((lot) => lot.units > 0);
}

function calculateTaxBuckets(
  buyLots: Array<{ date: string; units: number }>,
  asOfDate: string,
): { ltcg: number; stcg: number } {
  const oneYearAgo = new Date(asOfDate);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  let ltcg = 0;
  let stcg = 0;

  buyLots.forEach((lot) => {
    const lotDate = new Date(lot.date);
    if (Number.isNaN(lotDate.getTime())) {
      stcg += lot.units;
      return;
    }
    if (lotDate < oneYearAgo) ltcg += lot.units;
    else stcg += lot.units;
  });

  return { ltcg, stcg };
}

export function deriveHoldings(
  transactions: Transaction[],
  quotes: Map<string, PriceQuote>,
  asOfDate: string,
  mfPortfolioHoldings: MfPortfolioHolding[] = [],
): Holding[] {
  const useMfPortfolio = mfPortfolioHoldings.length > 0;
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
  const positions = new Map<string, PositionState>();
  const lastKnownPriceByIsin = new Map<string, number>();

  sorted.forEach((txn) => {
    if (useMfPortfolio && txn.asset_type === 'mutual_fund') return;
    const key = txn.isin;
    if (!positions.has(key)) {
      positions.set(key, {
        isin: txn.isin,
        symbol: txn.symbol,
        name: txn.name,
        asset_type: txn.asset_type,
        platforms: new Set([txn.platform]),
        units_held: 0,
        invested_amount: 0,
        buyLots: [],
        unmapped_isin: false,
      });
    }
    const state = positions.get(key)!;
    state.platforms.add(txn.platform);
    if (txn.raw._unmapped_isin === 'true' || txn.raw._unmatched_mf === 'true') {
      state.unmapped_isin = true;
    }

    if (txn.txn_type === 'buy' || txn.txn_type === 'sip' || txn.txn_type === 'switch_in') {
      applyBuy(state, txn);
      lastKnownPriceByIsin.set(txn.isin, txn.price);
      return;
    }

    if (txn.txn_type === 'sell' || txn.txn_type === 'redemption' || txn.txn_type === 'switch_out') {
      applySellLike(state, txn);
      lastKnownPriceByIsin.set(txn.isin, txn.price);
    }
  });

  const equityHoldings = Array.from(positions.values())
    .filter((state) => state.units_held > 0.000001)
    .map((state) => {
      const quote = quotes.get(state.isin);
      const fallbackPrice = lastKnownPriceByIsin.get(state.isin) ?? 0;
      const price = quote?.price ?? fallbackPrice;
      const currentValue = state.units_held * price;
      const unrealisedPnl = currentValue - state.invested_amount;
      const avgCost = state.units_held > 0 ? state.invested_amount / state.units_held : 0;
      const { ltcg, stcg } = calculateTaxBuckets(state.buyLots, asOfDate);

      return {
        isin: state.isin,
        symbol: state.symbol,
        name: state.name,
        asset_type: state.asset_type,
        platforms: Array.from(state.platforms),
        units_held: round2(state.units_held),
        avg_cost: round2(avgCost),
        invested_amount: round2(state.invested_amount),
        current_price: round2(price),
        current_value: round2(currentValue),
        unrealised_pnl: round2(unrealisedPnl),
        unrealised_pnl_pct: state.invested_amount > 0 ? round2((unrealisedPnl / state.invested_amount) * 100) : 0,
        ltcg_units: round2(ltcg),
        stcg_units: round2(stcg),
        unmapped_isin: state.unmapped_isin,
      };
    });

  const mfHoldings = mfPortfolioHoldings.map((holding) => {
    const quote = holding.scheme_code ? quotes.get(String(holding.scheme_code)) : undefined;
    const price = quote?.price ?? (holding.units > 0 ? holding.current_value / holding.units : 0);
    const currentValue = holding.units * price;
    const unrealisedPnl = currentValue - holding.invested_value;
    const avgCost = holding.units > 0 ? holding.invested_value / holding.units : 0;

    return {
      isin: holding.key,
      symbol: holding.scheme_name,
      name: holding.scheme_name,
      asset_type: 'mutual_fund',
      platforms: ['mf_central'],
      scheme_code: holding.scheme_code,
      units_held: round2(holding.units),
      avg_cost: round2(avgCost),
      invested_amount: round2(holding.invested_value),
      current_price: round2(price),
      current_value: round2(currentValue),
      unrealised_pnl: round2(unrealisedPnl),
      unrealised_pnl_pct: holding.invested_value > 0 ? round2((unrealisedPnl / holding.invested_value) * 100) : 0,
      ltcg_units: 0,
      stcg_units: 0,
      unmapped_isin: holding.unmatched,
    };
  });

  return [...equityHoldings, ...mfHoldings];
}
