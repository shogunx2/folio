import * as XLSX from 'xlsx';
import type { MfPortfolioHolding, ParseIssue, ParseResult, Transaction } from '../types';

type Row = string[];

const TXN_HEADER = ['Scheme Name', 'Transaction Description', 'Date', 'NAV', 'Units', 'Amount'] as const;
const PORTFOLIO_HEADER = [
  'Scheme Name',
  'AMC Name',
  'Category',
  'Folio No.',
  'Invested Value',
  'Current Value',
  'Returns',
  'Units',
] as const;

function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(/,/g, '');
  if (!normalized) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function parseMfDate(raw: string): string | null {
  const match = raw.trim().toUpperCase().match(/^(\d{2})-([A-Z]{3})-(\d{4})$/);
  if (!match) return null;
  const months: Record<string, string> = {
    JAN: '01',
    FEB: '02',
    MAR: '03',
    APR: '04',
    MAY: '05',
    JUN: '06',
    JUL: '07',
    AUG: '08',
    SEP: '09',
    OCT: '10',
    NOV: '11',
    DEC: '12',
  };
  const [, dd, mon, yyyy] = match;
  const mm = months[mon];
  if (!mm) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function rowMatchesHeader(row: Row, header: readonly string[]): boolean {
  return header.every((col, index) => (row[index] ?? '').trim() === col);
}

function inferTxnType(description: string): Transaction['txn_type'] {
  const value = description.toLowerCase();
  if (value.includes('switch in')) return 'switch_in';
  if (value.includes('switch out')) return 'switch_out';
  if (value.includes('redemption') || value.includes('redeem')) return 'redemption';
  if (value.includes('dividend')) return 'dividend';
  if (value.includes('sip')) return 'sip';
  return 'buy';
}

function buildSchemeFolioMap(rows: Row[]): Map<string, string> {
  const schemeToFolio = new Map<string, string>();
  let inPortfolioSection = false;

  rows.forEach((row) => {
    if (rowMatchesHeader(row, PORTFOLIO_HEADER)) {
      inPortfolioSection = true;
      return;
    }
    if (!inPortfolioSection) return;
    if (!row[0] || !row[3]) return;
    schemeToFolio.set(row[0].trim(), row[3].trim());
  });

  return schemeToFolio;
}

function normalizeSchemeKey(value: string): string {
  let normalized = value.toLowerCase();
  normalized = normalized.replace(/\([^)]*\)/g, ' ');
  normalized = normalized.replace(/\b(formerly|erstwhile)\b/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function parsePortfolioHoldings(rows: Row[]): MfPortfolioHolding[] {
  let inPortfolioSection = false;
  const merged = new Map<string, MfPortfolioHolding>();

  rows.forEach((row) => {
    if (rowMatchesHeader(row, PORTFOLIO_HEADER)) {
      inPortfolioSection = true;
      return;
    }
    if (!inPortfolioSection) return;
    if (!row[0]) return;

    const schemeName = row[0]?.trim();
    const folio = row[3]?.trim();
    const investedValue = parseNumber(row[4] ?? '');
    const currentValue = parseNumber(row[5] ?? '');
    const returnsValue = parseNumber(row[6] ?? '');
    const units = parseNumber(row[7] ?? '');

    if (!schemeName || investedValue === null || currentValue === null || returnsValue === null || units === null) return;
    if (investedValue <= 0) return;

    const key = normalizeSchemeKey(schemeName);
    if (!key) return;

    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        key,
        scheme_name: schemeName,
        folios: folio ? [folio] : [],
        units,
        invested_value: investedValue,
        current_value: currentValue,
        returns: returnsValue,
      });
      return;
    }

    if (folio && !existing.folios.includes(folio)) {
      existing.folios.push(folio);
    }
    existing.units += units;
    existing.invested_value += investedValue;
    existing.current_value += currentValue;
    existing.returns += returnsValue;
  });

  return Array.from(merged.values());
}

export function parseMfCentralStatement(arrayBuffer: ArrayBuffer): ParseResult {
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const txnSheet = workbook.Sheets['Transaction Details'];
  const portfolioSheet = workbook.Sheets['Portfolio Details'];
  if (!txnSheet) {
    return {
      transactions: [],
      issues: [{ row: 0, reason: 'Missing "Transaction Details" sheet', raw: {} }],
    };
  }

  const txnRows = XLSX.utils.sheet_to_json<Row>(txnSheet, {
    header: 1,
    raw: false,
    defval: '',
  });
  const portfolioRows = portfolioSheet
    ? XLSX.utils.sheet_to_json<Row>(portfolioSheet, { header: 1, raw: false, defval: '' })
    : [];
  const schemeToFolio = buildSchemeFolioMap(portfolioRows);
  const portfolioHoldings = parsePortfolioHoldings(portfolioRows);

  const issues: ParseIssue[] = [];
  const transactions: Omit<Transaction, 'id'>[] = [];
  let inTxnSection = false;

  for (let i = 0; i < txnRows.length; i += 1) {
    const row = txnRows[i];
    if (!row.some((cell) => String(cell).trim() !== '')) continue;

    if (rowMatchesHeader(row, TXN_HEADER)) {
      inTxnSection = true;
      continue;
    }
    if (!inTxnSection) continue;
    if (!row[0]) continue;

    const [schemeNameRaw, descriptionRaw, dateRaw, navRaw, unitsRaw, amountRaw] = row;
    const schemeName = schemeNameRaw.trim();
    const folio = schemeToFolio.get(schemeName) ?? 'unknown';
    const isin = `MFC_${folio}_${schemeName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 40)}`;
    const date = parseMfDate(dateRaw ?? '');
    const units = parseNumber(unitsRaw ?? '');
    const nav = parseNumber(navRaw ?? '');
    const amount = parseNumber(amountRaw ?? '');

    if (!schemeName || !date || units === null || nav === null || amount === null) {
      issues.push({
        row: i + 1,
        reason: 'Invalid MF Central transaction row',
        raw: {
          'Scheme Name': schemeNameRaw ?? '',
          'Transaction Description': descriptionRaw ?? '',
          Date: dateRaw ?? '',
          NAV: navRaw ?? '',
          Units: unitsRaw ?? '',
          Amount: amountRaw ?? '',
        },
      });
      continue;
    }

    const txnType = inferTxnType(descriptionRaw ?? '');
    transactions.push({
      platform: 'mf_central',
      asset_type: 'mutual_fund',
      isin,
      symbol: schemeName,
      name: schemeName,
      txn_type: txnType,
      date,
      units,
      price: nav,
      amount,
      charges: 0,
      net_amount: amount,
      raw: {
        'Scheme Name': schemeNameRaw ?? '',
        'Transaction Description': descriptionRaw ?? '',
        Date: dateRaw ?? '',
        NAV: navRaw ?? '',
        Units: unitsRaw ?? '',
        Amount: amountRaw ?? '',
      },
    });
  }

  return { transactions, issues, portfolio_holdings: portfolioHoldings };
}
