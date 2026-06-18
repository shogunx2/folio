import { readFileSync } from 'node:fs';
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { importStatement } from './index';
import { clearAll, getAllTransactions } from '../store/db';

describe('importStatement', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('imports groww statement and deduplicates on re-import', async () => {
    const file = readFileSync(
      '/Users/ayushnema/Development/folio/sampleCSV/growwStocks.xlsx',
    );
    const fileBuffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);

    const firstImport = await importStatement('groww', fileBuffer);
    expect(firstImport.imported).toBe(3);
    expect(firstImport.skipped).toBe(0);
    expect(firstImport.invalid).toBe(0);

    const secondImport = await importStatement('groww', fileBuffer);
    expect(secondImport.imported).toBe(0);
    expect(secondImport.skipped).toBe(3);
    expect(secondImport.invalid).toBe(0);

    const allTransactions = await getAllTransactions();
    expect(allTransactions).toHaveLength(3);
    expect(new Set(allTransactions.map((txn) => txn.id)).size).toBe(3);
  });

  it('imports zerodha and mfcentral files with expected counts', async () => {
    const zerodhaFile = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/zerodha.csv');
    const mfcentralFile = readFileSync('/Users/ayushnema/Development/folio/sampleCSV/mfcentral.xlsx');

    const zerodhaResult = await importStatement(
      'zerodha',
      zerodhaFile.buffer.slice(zerodhaFile.byteOffset, zerodhaFile.byteOffset + zerodhaFile.byteLength),
    );
    expect(zerodhaResult.imported).toBe(8);
    expect(zerodhaResult.invalid).toBe(0);

    const mfResult = await importStatement(
      'mf_central',
      mfcentralFile.buffer.slice(mfcentralFile.byteOffset, mfcentralFile.byteOffset + mfcentralFile.byteLength),
    );
    expect(mfResult.imported).toBe(4);
    expect(mfResult.invalid).toBe(0);

    const allTransactions = await getAllTransactions();
    expect(allTransactions).toHaveLength(12);
  });
});
