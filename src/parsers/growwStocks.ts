import * as XLSX from 'xlsx';
import type { ParseIssue, ParseResult, Transaction } from '../types';

const REALISED_HEADER = [
  'Stock name',
  'ISIN',
  'Quantity',
  'Buy date',
  'Buy price',
  'Buy value',
  'Sell date',
  'Sell price',
  'Sell value',
  'Realised P&L',
  'Remark',
] as const;

const UNREALISED_HEADER = [
  'Stock name',
  'ISIN',
  'Quantity',
  'Buy date',
  'Buy price',
  'Buy value',
  'Closing date',
  'Closing price',
  'Closing value',
  'Unrealised P&L',
  'Remark',
] as const;

type Row = string[];

function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/,/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function toIsoDate(raw: string): string | null {
  const match = raw.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

function toRawMap(header: readonly string[], row: Row): Record<string, string> {
  return Object.fromEntries(header.map((key, i) => [key, row[i] ?? '']));
}

function rowMatchesHeader(row: Row, header: readonly string[]): boolean {
  return header.every((col, index) => (row[index] ?? '').trim() === col);
}

function buildBaseTransaction(
  name: string,
  isin: string,
  rowRaw: Record<string, string>,
  nseIsinMap?: Record<string, string>,
): Pick<Transaction, 'platform' | 'asset_type' | 'isin' | 'symbol' | 'name' | 'raw'> {
  const mappedSymbol = nseIsinMap?.[isin];
  if (!mappedSymbol && nseIsinMap) {
    console.warn(`[folio] unmapped ISIN: ${isin}`);
    rowRaw = { ...rowRaw, _unmapped_isin: 'true' };
  }
  return {
    platform: 'groww',
    asset_type: 'equity',
    isin,
    symbol: mappedSymbol ? `${mappedSymbol}.NS` : name,
    name,
    raw: rowRaw,
  };
}

function parseRealisedRow(
  row: Row,
  rowIndex: number,
  issues: ParseIssue[],
  nseIsinMap?: Record<string, string>,
): Omit<Transaction, 'id'>[] {
  const raw = toRawMap(REALISED_HEADER, row);
  const [name, isin, quantityRaw, buyDateRaw, buyPriceRaw, buyValueRaw, sellDateRaw, sellPriceRaw, sellValueRaw] =
    row;

  const quantity = parseNumber(quantityRaw ?? '');
  const buyPrice = parseNumber(buyPriceRaw ?? '');
  const buyValue = parseNumber(buyValueRaw ?? '');
  const sellPrice = parseNumber(sellPriceRaw ?? '');
  const sellValue = parseNumber(sellValueRaw ?? '');
  const buyDate = toIsoDate(buyDateRaw ?? '');
  const sellDate = toIsoDate(sellDateRaw ?? '');

  if (
    !name ||
    !isin ||
    quantity === null ||
    buyPrice === null ||
    buyValue === null ||
    sellPrice === null ||
    sellValue === null ||
    !buyDate ||
    !sellDate
  ) {
    issues.push({
      row: rowIndex + 1,
      reason: 'Invalid realised trade row',
      raw,
    });
    return [];
  }

  const base = buildBaseTransaction(name, isin, raw, nseIsinMap);
  return [
    {
      ...base,
      txn_type: 'buy',
      date: buyDate,
      units: quantity,
      price: buyPrice,
      amount: buyValue,
      charges: 0,
      net_amount: buyValue,
    },
    {
      ...base,
      txn_type: 'sell',
      date: sellDate,
      units: quantity,
      price: sellPrice,
      amount: sellValue,
      charges: 0,
      net_amount: sellValue,
    },
  ];
}

function parseUnrealisedRow(
  row: Row,
  rowIndex: number,
  issues: ParseIssue[],
  nseIsinMap?: Record<string, string>,
): Omit<Transaction, 'id'>[] {
  const raw = toRawMap(UNREALISED_HEADER, row);
  const [name, isin, quantityRaw, buyDateRaw, buyPriceRaw, buyValueRaw] = row;

  const quantity = parseNumber(quantityRaw ?? '');
  const buyPrice = parseNumber(buyPriceRaw ?? '');
  const buyValue = parseNumber(buyValueRaw ?? '');
  const buyDate = toIsoDate(buyDateRaw ?? '');

  if (!name || !isin || quantity === null || buyPrice === null || buyValue === null || !buyDate) {
    issues.push({
      row: rowIndex + 1,
      reason: 'Invalid unrealised trade row',
      raw,
    });
    return [];
  }

  const base = buildBaseTransaction(name, isin, raw, nseIsinMap);
  return [
    {
      ...base,
      txn_type: 'buy',
      date: buyDate,
      units: quantity,
      price: buyPrice,
      amount: buyValue,
      charges: 0,
      net_amount: buyValue,
    },
  ];
}

export function parseGrowwStocksStatement(arrayBuffer: ArrayBuffer, nseIsinMap?: Record<string, string>): ParseResult {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const worksheet = workbook.Sheets['Trade Level'];
  if (!worksheet) {
    return {
      transactions: [],
      issues: [{ row: 0, reason: 'Missing "Trade Level" sheet', raw: {} }],
    };
  }

  const rows = XLSX.utils.sheet_to_json<Row>(worksheet, {
    header: 1,
    raw: false,
    defval: '',
  });

  const issues: ParseIssue[] = [];
  const transactions: Omit<Transaction, 'id'>[] = [];

  let section: 'realised' | 'unrealised' | null = null;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.some((cell) => String(cell).trim() !== '')) continue;

    if (rowMatchesHeader(row, REALISED_HEADER)) {
      section = 'realised';
      continue;
    }
    if (rowMatchesHeader(row, UNREALISED_HEADER)) {
      section = 'unrealised';
      continue;
    }

    if (section === 'realised' && row[0] && row[1]) {
      transactions.push(...parseRealisedRow(row, i, issues, nseIsinMap));
    } else if (section === 'unrealised' && row[0] && row[1]) {
      transactions.push(...parseUnrealisedRow(row, i, issues, nseIsinMap));
    }
  }

  return { transactions, issues };
}
