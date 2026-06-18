import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { importAndNormalize, getPortfolioSnapshot } from './portfolio';
import { clearAll, clearQuotes, putQuotes } from '../store/db';
import type { PriceQuote } from '../types';

describe('portfolio service', () => {
  beforeEach(async () => {
    await clearAll();
    await clearQuotes();
  });

  it('returns portfolio snapshot using imported transactions and cached quotes', async () => {
    const growwFile = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/growwStocks.xlsx');
    const zerodhaFile = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/zerodha.csv');
    const mfFile = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/mfcentral.xlsx');

    await importAndNormalize(
      'groww',
      growwFile.buffer.slice(growwFile.byteOffset, growwFile.byteOffset + growwFile.byteLength),
    );
    await importAndNormalize(
      'zerodha',
      zerodhaFile.buffer.slice(zerodhaFile.byteOffset, zerodhaFile.byteOffset + zerodhaFile.byteLength),
    );
    await importAndNormalize('mf_central', mfFile.buffer.slice(mfFile.byteOffset, mfFile.byteOffset + mfFile.byteLength));

    const quotes: PriceQuote[] = [
      { isin: 'INE399L01023', symbol: 'ADANI TOTAL GAS LIMITED', price: 650, as_of: '2026-05-20', source: 'yahoo' },
      { isin: 'INF204KB17I5', symbol: 'GOLDBEES', price: 110, as_of: '2026-05-20', source: 'yahoo' },
    ];
    await putQuotes(quotes);

    const snapshot = await getPortfolioSnapshot('2026-05-20');
    expect(snapshot.transactions.length).toBeGreaterThan(10);
    expect(snapshot.holdings.length).toBeGreaterThan(1);
    expect(snapshot.insights.total_current_value).toBeGreaterThan(0);
  });
});
