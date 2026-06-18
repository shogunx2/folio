import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGrowwStocksStatement } from './growwStocks';

describe('parseGrowwStocksStatement', () => {
  it('parses realised and unrealised rows into normalized transactions', () => {
    const file = readFileSync(
      '/Users/ayushnema/Development/folio/sampleCSV/growwStocks.xlsx',
    );
    const result = parseGrowwStocksStatement(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    );

    expect(result.issues).toHaveLength(0);
    expect(result.transactions).toHaveLength(3);

    expect(result.transactions[0]).toMatchObject({
      platform: 'groww',
      asset_type: 'equity',
      isin: 'INE109A01011',
      txn_type: 'buy',
      date: '2026-03-16',
      units: 4,
      price: 237.9,
      amount: 951.6,
      net_amount: 951.6,
    });

    expect(result.transactions[1]).toMatchObject({
      platform: 'groww',
      asset_type: 'equity',
      isin: 'INE109A01011',
      txn_type: 'sell',
      date: '2026-04-20',
      units: 4,
      price: 300,
      amount: 1200,
      net_amount: 1200,
    });

    expect(result.transactions[2]).toMatchObject({
      platform: 'groww',
      asset_type: 'equity',
      isin: 'INE399L01023',
      txn_type: 'buy',
      date: '2026-03-16',
      units: 3,
      price: 582.05,
      amount: 1746.15,
      net_amount: 1746.15,
    });
  });
});
