import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMfCentralStatement } from './mfcentral';

describe('parseMfCentralStatement', () => {
  it('parses transaction sheet into mutual fund transactions', () => {
    const file = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/mfcentral.xlsx');
    const result = parseMfCentralStatement(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

    expect(result.issues).toHaveLength(0);
    expect(result.transactions).toHaveLength(4);

    expect(result.transactions[0]).toMatchObject({
      platform: 'mf_central',
      asset_type: 'mutual_fund',
      txn_type: 'buy',
      date: '2026-03-13',
      price: 113.97,
      units: 43.869,
      amount: 4999.75,
    });

    expect(result.transactions[1].isin.startsWith('MFC_')).toBe(true);
  });
});
