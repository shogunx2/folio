import { describe, expect, it } from 'vitest';
import { computePortfolioInsights } from './insights';
import type { Holding, Transaction } from '../types';

describe('computePortfolioInsights', () => {
  it('computes totals, allocation and xirr', () => {
    const transactions: Transaction[] = [
      {
        id: '1',
        platform: 'zerodha',
        asset_type: 'equity',
        isin: 'INE1',
        symbol: 'AAA',
        name: 'AAA',
        txn_type: 'buy',
        date: '2025-01-01',
        units: 10,
        price: 100,
        amount: 1000,
        charges: 0,
        net_amount: 1000,
        raw: {},
      },
      {
        id: '2',
        platform: 'mf_central',
        asset_type: 'mutual_fund',
        isin: 'MFC_1',
        symbol: 'MF1',
        name: 'MF1',
        txn_type: 'buy',
        date: '2025-02-01',
        units: 20,
        price: 50,
        amount: 1000,
        charges: 0,
        net_amount: 1000,
        raw: {},
      },
    ];

    const holdings: Holding[] = [
      {
        isin: 'INE1',
        symbol: 'AAA',
        name: 'AAA',
        asset_type: 'equity',
        platforms: ['zerodha'],
        units_held: 10,
        avg_cost: 100,
        invested_amount: 1000,
        current_price: 120,
        current_value: 1200,
        unrealised_pnl: 200,
        unrealised_pnl_pct: 20,
        ltcg_units: 10,
        stcg_units: 0,
      },
      {
        isin: 'MFC_1',
        symbol: 'MF1',
        name: 'MF1',
        asset_type: 'mutual_fund',
        platforms: ['mf_central'],
        units_held: 20,
        avg_cost: 50,
        invested_amount: 1000,
        current_price: 52,
        current_value: 1040,
        unrealised_pnl: 40,
        unrealised_pnl_pct: 4,
        ltcg_units: 20,
        stcg_units: 0,
      },
    ];

    const insights = computePortfolioInsights(transactions, holdings, '2026-03-01');
    expect(insights.total_invested).toBe(2000);
    expect(insights.total_current_value).toBe(2240);
    expect(insights.total_unrealised_pnl).toBe(240);
    expect(insights.equity_allocation_pct).toBe(53.57);
    expect(insights.mf_allocation_pct).toBe(46.43);
    expect(insights.xirr).not.toBeNull();
  });
});
