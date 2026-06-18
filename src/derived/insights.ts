import type { Holding, PortfolioInsights, Transaction } from '../types';

type Cashflow = { amount: number; date: Date };

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

function xnpv(rate: number, cashflows: Cashflow[]): number {
  const start = cashflows[0].date;
  return cashflows.reduce((acc, flow) => {
    const years = daysBetween(start, flow.date) / 365;
    return acc + flow.amount / (1 + rate) ** years;
  }, 0);
}

function xirr(cashflows: Cashflow[]): number | null {
  if (cashflows.length < 2) return null;
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

export function computePortfolioInsights(
  transactions: Transaction[],
  holdings: Holding[],
  asOfDate: string,
): PortfolioInsights {
  const totalInvested = holdings.reduce((acc, h) => acc + h.invested_amount, 0);
  const totalCurrentValue = holdings.reduce((acc, h) => acc + h.current_value, 0);
  const totalUnrealisedPnl = totalCurrentValue - totalInvested;

  const equityValue = holdings
    .filter((holding) => holding.asset_type === 'equity' || holding.asset_type === 'etf')
    .reduce((acc, h) => acc + h.current_value, 0);
  const mfValue = holdings
    .filter((holding) => holding.asset_type === 'mutual_fund')
    .reduce((acc, h) => acc + h.current_value, 0);

  const cashflows: Cashflow[] = transactions.map((txn) => {
    const sign =
      txn.txn_type === 'buy' || txn.txn_type === 'sip' || txn.txn_type === 'switch_in' ? -1 : 1;
    return { amount: sign * txn.net_amount, date: new Date(txn.date) };
  });
  cashflows.push({ amount: totalCurrentValue, date: new Date(asOfDate) });
  cashflows.sort((a, b) => a.date.getTime() - b.date.getTime());

  const xirrValue = xirr(cashflows);

  return {
    total_invested: Number(totalInvested.toFixed(2)),
    total_current_value: Number(totalCurrentValue.toFixed(2)),
    total_unrealised_pnl: Number(totalUnrealisedPnl.toFixed(2)),
    total_unrealised_pnl_pct: totalInvested > 0 ? Number(((totalUnrealisedPnl / totalInvested) * 100).toFixed(2)) : 0,
    equity_allocation_pct: totalCurrentValue > 0 ? Number(((equityValue / totalCurrentValue) * 100).toFixed(2)) : 0,
    mf_allocation_pct: totalCurrentValue > 0 ? Number(((mfValue / totalCurrentValue) * 100).toFixed(2)) : 0,
    xirr: xirrValue,
  };
}
