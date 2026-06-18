import { describe, expect, it } from 'vitest';
import { deriveHoldings } from './holdings';
import type { PriceQuote, Transaction } from '../types';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? 'id',
    platform: partial.platform ?? 'zerodha',
    asset_type: partial.asset_type ?? 'equity',
    isin: partial.isin ?? 'INE123',
    symbol: partial.symbol ?? 'ABC',
    name: partial.name ?? 'ABC LTD',
    txn_type: partial.txn_type ?? 'buy',
    date: partial.date ?? '2026-01-01',
    units: partial.units ?? 1,
    price: partial.price ?? 100,
    amount: partial.amount ?? 100,
    charges: partial.charges ?? 0,
    net_amount: partial.net_amount ?? 100,
    raw: partial.raw ?? {},
  };
}

describe('deriveHoldings', () => {
  it('derives units, avg cost and pnl after buy/sell', () => {
    const transactions: Transaction[] = [
      tx({ id: '1', txn_type: 'buy', units: 10, price: 100, amount: 1000, net_amount: 1000, date: '2025-01-10' }),
      tx({ id: '2', txn_type: 'buy', units: 5, price: 120, amount: 600, net_amount: 600, date: '2025-06-01' }),
      tx({ id: '3', txn_type: 'sell', units: 3, price: 130, amount: 390, net_amount: 390, date: '2026-01-05' }),
    ];
    const quotes = new Map<string, PriceQuote>([
      [
        'INE123',
        {
          isin: 'INE123',
          symbol: 'ABC',
          price: 150,
          as_of: '2026-03-01',
          source: 'yahoo',
        },
      ],
    ]);

    const holdings = deriveHoldings(transactions, quotes, '2026-03-01');
    expect(holdings).toHaveLength(1);
    expect(holdings[0]).toMatchObject({
      isin: 'INE123',
      units_held: 12,
      avg_cost: 106.67,
      invested_amount: 1280,
      current_price: 150,
      current_value: 1800,
      unrealised_pnl: 520,
    });
  });
});
