import { parseByPlatform } from '../parsers';
import { getAmfiSchemeData, matchAmfiSchemeName, normalizeAmfiSchemeName } from '../services/amfiSchemeMap';
import { getNseIsinMap } from '../services/nseIsinMap';
import { addTransactions, hasTransactionId, putMfPortfolioHoldings } from '../store/db';
import type { ImportSummary, Transaction } from '../types';

function dedupSourceKey(txn: Omit<Transaction, 'id'>): string {
  return [
    txn.platform,
    txn.isin,
    txn.date,
    txn.txn_type,
    String(txn.units),
    String(txn.net_amount),
  ].join('|');
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  if (typeof crypto !== 'undefined' && crypto.subtle?.digest) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  // Fallback for environments without Web Crypto (e.g., older mobile browsers).
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i];
    hash = (hash * 0x01000193) >>> 0;
  }
  return `fnv1a_${hash.toString(16).padStart(8, '0')}`;
}

export async function importStatement(
  platform: 'groww' | 'zerodha' | 'mf_central',
  fileBuffer: ArrayBuffer,
): Promise<ImportSummary> {
  const nseIsinMap = platform === 'groww' ? await getNseIsinMap().catch(() => undefined) : undefined;
  const parsed = parseByPlatform({ platform, file: fileBuffer, nseIsinMap });
  let mappedTransactions = parsed.transactions;

  if (platform === 'mf_central') {
    const { nameToScheme } = await getAmfiSchemeData();
    const normalizedToCode = new Map<string, string>();
    const uniqueNames = Array.from(new Set(parsed.transactions.map((txn) => txn.name)));

    for (const name of uniqueNames) {
      const normalized = normalizeAmfiSchemeName(name);
      const schemeCode = matchAmfiSchemeName(normalized, nameToScheme);
      if (schemeCode) {
        normalizedToCode.set(normalized, schemeCode);
      }
    }

    mappedTransactions = parsed.transactions.map((txn) => {
      const normalized = normalizeAmfiSchemeName(txn.name);
      const schemeCode = normalizedToCode.get(normalized) ?? matchAmfiSchemeName(normalized, nameToScheme);

      if (schemeCode && normalized) {
        return { ...txn, raw: { ...txn.raw, _mf_scheme_code: String(schemeCode) } };
      }
      console.warn(`[folio] unmatched MF: ${txn.name}`);
      return { ...txn, raw: { ...txn.raw, _unmatched_mf: 'true' } };
    });

    if (parsed.portfolio_holdings && parsed.portfolio_holdings.length > 0) {
      const mappedHoldings = parsed.portfolio_holdings.map((holding) => {
        const normalized = normalizeAmfiSchemeName(holding.scheme_name);
        const schemeCode = matchAmfiSchemeName(normalized, nameToScheme);
        if (!schemeCode) {
          console.warn(`[folio] unmatched MF: ${holding.scheme_name}`);
          return { ...holding, unmatched: true };
        }
        return { ...holding, scheme_code: schemeCode };
      });
      await putMfPortfolioHoldings(mappedHoldings);
    }
  }
  const toInsert: Transaction[] = [];
  let skipped = 0;

  for (const txn of mappedTransactions) {
    const id = await sha256(dedupSourceKey(txn));
    const exists = await hasTransactionId(id);
    if (exists) {
      skipped += 1;
      continue;
    }
    toInsert.push({ ...txn, id });
  }

  if (toInsert.length > 0) {
    await addTransactions(toInsert);
  }

  return {
    imported: toInsert.length,
    skipped,
    invalid: parsed.issues.length,
    issues: parsed.issues,
  };
}
