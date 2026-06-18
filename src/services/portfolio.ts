import { computePortfolioInsights } from '../derived/insights';
import { deriveHoldings } from '../derived/holdings';
import { importStatement } from '../normalizer';
import { fetchAmfiNavMap } from '../prices/amfi';
import { fetchYahooQuotes } from '../prices/yahoo';
import { getAmfiSchemeData, matchAmfiSchemeName, normalizeAmfiSchemeName } from './amfiSchemeMap';
import { getNseIsinMap } from '../services/nseIsinMap';
import { getAllMfPortfolioHoldings, getAllQuotes, getAllTransactions, putQuotes } from '../store/db';
import type { Holding, ImportSummary, Platform, PortfolioInsights, PriceQuote, Transaction } from '../types';

function toQuoteMap(quotes: PriceQuote[]): Map<string, PriceQuote> {
  return new Map(quotes.map((quote) => [quote.isin, quote]));
}

function isLikelyTicker(symbol: string): boolean {
  return /^[A-Z0-9.&-]+(\.(NS|BO))?$/.test(symbol) && !symbol.includes(' ');
}

function normalizeYahooSymbol(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/, '');
}

function isQuoteFresh(quote: PriceQuote, asOfDate: string): boolean {
  return quote.source === 'yahoo' && quote.as_of === asOfDate;
}

function getMfSchemeCodes(transactions: Transaction[]): string[] {
  return transactions
    .filter((txn) => txn.asset_type === 'mutual_fund')
    .map((txn) => txn.isin)
    .filter((isin) => !isin.startsWith('MFC_'));
}

export async function importAndNormalize(platform: Platform, fileBuffer: ArrayBuffer): Promise<ImportSummary> {
  return importStatement(platform, fileBuffer);
}

export async function refreshQuotes(): Promise<{ quotes: Map<string, PriceQuote>; usedFallback: boolean }> {
  const today = new Date().toISOString().slice(0, 10);
  const transactions = await getAllTransactions();
  const cachedQuotes = await getAllQuotes();
  const equityTransactions = transactions.filter((txn) => txn.asset_type === 'equity' || txn.asset_type === 'etf');
  const isinToSymbol = new Map<string, string>();
  let nseIsinMap: Record<string, string> | undefined;
  try {
    nseIsinMap = await getNseIsinMap();
  } catch {
    nseIsinMap = undefined;
  }

  equityTransactions.forEach((txn) => {
    if (isLikelyTicker(txn.symbol) && !isinToSymbol.has(txn.isin)) {
      isinToSymbol.set(txn.isin, normalizeYahooSymbol(txn.symbol));
    }
  });

  equityTransactions.forEach((txn) => {
    if (isinToSymbol.has(txn.isin)) return;
    const mappedSymbol = nseIsinMap?.[txn.isin];
    if (mappedSymbol) {
      isinToSymbol.set(txn.isin, normalizeYahooSymbol(mappedSymbol));
    }
  });

  const cachedSymbolToQuote = new Map<string, PriceQuote>();
  cachedQuotes.forEach((quote) => {
    if (!isQuoteFresh(quote, today)) return;
    cachedSymbolToQuote.set(quote.symbol, quote);
  });

  const equitySymbols = Array.from(new Set(Array.from(isinToSymbol.values()))).filter(
    (symbol) => !cachedSymbolToQuote.has(symbol),
  );
  const mfCodes = Array.from(new Set(getMfSchemeCodes(transactions)));
  const mfCentralTransactions = transactions.filter(
    (txn) => txn.asset_type === 'mutual_fund' && txn.isin.startsWith('MFC_'),
  );

  const [yahooResult, amfiMap] = await Promise.all([
    fetchYahooQuotes(equitySymbols),
    fetchAmfiNavMap().catch(() => new Map<string, PriceQuote>()),
  ]);
  const yahooQuotes = new Map<string, PriceQuote>([...cachedSymbolToQuote, ...yahooResult.quotes]);
  const usedFallback = yahooResult.usedFallback;

  const quoteBucket = new Map<string, PriceQuote>();
  yahooQuotes.forEach((quote, symbol) => {
    const matchingTxns = equityTransactions.filter((txn) => isinToSymbol.get(txn.isin) === symbol);
    matchingTxns.forEach((txn) => quoteBucket.set(txn.isin, { ...quote, isin: txn.isin, symbol: txn.symbol }));
  });
  mfCodes.forEach((schemeCode) => {
    const quote = amfiMap.get(schemeCode);
    if (quote) quoteBucket.set(schemeCode, quote);
  });

  if (mfCentralTransactions.length > 0 && amfiMap.size > 0) {
    const { nameToScheme } = await getAmfiSchemeData();
    mfCentralTransactions.forEach((txn) => {
      const schemeCodeFromRaw = txn.raw._mf_scheme_code;
      const normalized = normalizeAmfiSchemeName(txn.name);
      const schemeCode =
        (typeof schemeCodeFromRaw === 'string' && schemeCodeFromRaw) ||
        matchAmfiSchemeName(normalized, nameToScheme);
      if (!schemeCode) return;
      const quote = amfiMap.get(String(schemeCode));
      if (!quote) return;
      quoteBucket.set(txn.isin, {
        ...quote,
        isin: txn.isin,
        symbol: txn.symbol,
      });
    });
  }

  await putQuotes(Array.from(quoteBucket.values()));
  return { quotes: quoteBucket, usedFallback };
}

export async function getPortfolioSnapshot(asOfDate = new Date().toISOString().slice(0, 10)): Promise<{
  transactions: Transaction[];
  holdings: Holding[];
  insights: PortfolioInsights;
}> {
  const transactions = await getAllTransactions();
  const mfPortfolioHoldings = await getAllMfPortfolioHoldings();
  const quotes = toQuoteMap(await getAllQuotes());
  const holdings = deriveHoldings(transactions, quotes, asOfDate, mfPortfolioHoldings);
  const insights = computePortfolioInsights(transactions, holdings, asOfDate);
  return { transactions, holdings, insights };
}
