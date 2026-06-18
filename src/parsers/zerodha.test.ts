import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseZerodhaStatement } from './zerodha';

describe('parseZerodhaStatement', () => {
  it('parses trades csv into normalized buy/sell transactions', () => {
    const file = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/zerodha.csv');
    const result = parseZerodhaStatement(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

    expect(result.issues).toHaveLength(0);
    expect(result.transactions).toHaveLength(8);

    expect(result.transactions[0]).toMatchObject({
      platform: 'zerodha',
      asset_type: 'equity',
      symbol: 'GOLDBEES',
      isin: 'INF204KB17I5',
      txn_type: 'buy',
      date: '2025-12-04',
      units: 110,
      price: 106.040001,
      amount: 11664.40011,
    });

    expect(result.transactions[2]).toMatchObject({
      symbol: 'TCS',
      txn_type: 'sell',
      date: '2026-03-20',
      units: 80,
      price: 2373.5,
    });
  });
});
