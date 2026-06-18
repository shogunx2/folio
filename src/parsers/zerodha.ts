import Papa from 'papaparse';
import type { ParseIssue, ParseResult, Transaction } from '../types';

type ZerodhaRow = {
  symbol: string;
  isin: string;
  trade_date: string;
  exchange: string;
  segment: string;
  series: string;
  trade_type: string;
  auction: string;
  quantity: string;
  price: string;
  trade_id: string;
  order_id: string;
  order_execution_time: string;
};

function parseNumber(raw: string): number | null {
  const parsed = Number(raw.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTradeType(raw: string): Transaction['txn_type'] | null {
  const value = raw.trim().toLowerCase();
  if (value === 'buy') return 'buy';
  if (value === 'sell') return 'sell';
  return null;
}

export function parseZerodhaStatement(arrayBuffer: ArrayBuffer): ParseResult {
  const csvText = new TextDecoder('utf-8').decode(arrayBuffer);
  const parsed = Papa.parse<ZerodhaRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const transactions: Omit<Transaction, 'id'>[] = [];
  const issues: ParseIssue[] = [];

  parsed.data.forEach((row, index) => {
    const tradeType = normalizeTradeType(row.trade_type ?? '');
    const units = parseNumber(row.quantity ?? '');
    const price = parseNumber(row.price ?? '');
    const date = (row.trade_date ?? '').trim();

    if (!row.isin || !row.symbol || !tradeType || units === null || price === null || !date) {
      issues.push({
        row: index + 2,
        reason: 'Invalid Zerodha trade row',
        raw: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])),
      });
      return;
    }

    const amount = Number((units * price).toFixed(6));
    transactions.push({
      platform: 'zerodha',
      asset_type: 'equity',
      isin: row.isin.trim(),
      symbol: row.symbol.trim(),
      name: row.symbol.trim(),
      txn_type: tradeType,
      date,
      units,
      price,
      amount,
      charges: 0,
      net_amount: amount,
      raw: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value ?? ''])),
    });
  });

  return { transactions, issues };
}
