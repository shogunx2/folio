import type { PriceQuote } from '../types';

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
      };
    }>;
  };
};

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
  Referer: 'https://finance.yahoo.com',
} as const;

type QuoteFetchResult = {
  quote: PriceQuote | null;
  usedFallback: boolean;
};

type QuoteBatchResult = {
  quotes: Map<string, PriceQuote>;
  usedFallback: boolean;
};

async function fetchJson(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { headers: YAHOO_HEADERS });
  } catch {
    return null;
  }
}

function normalizeYahooSymbol(symbol: string): string {
  return symbol.replace(/\.(NS|BO)$/, '');
}

async function fetchYahooChart(symbol: string): Promise<QuoteFetchResult> {
  const normalizedSymbol = normalizeYahooSymbol(symbol);
  const proxyUrl = `/yahoo-api/v8/finance/chart/${encodeURIComponent(
    normalizedSymbol,
  )}.NS?range=1d&interval=1d`;

  const response = await fetchJson(proxyUrl);
  if (!response || !response.ok) return { quote: null, usedFallback: false };

  const payload = (await response.json()) as YahooChartResponse;
  const meta = payload.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice || !Number.isFinite(meta.regularMarketPrice)) {
    return { quote: null, usedFallback: false };
  }

  return {
    quote: {
      isin: normalizedSymbol,
      symbol: normalizedSymbol,
      price: meta.regularMarketPrice,
      previous_close: meta.previousClose,
      as_of: new Date().toISOString().slice(0, 10),
      source: 'yahoo',
    },
    usedFallback: false,
  };
}

export async function fetchYahooQuotes(symbols: string[]): Promise<QuoteBatchResult> {
  const uniqueSymbols = Array.from(new Set(symbols.filter(Boolean)));
  const quotes = await Promise.all(uniqueSymbols.map((symbol) => fetchYahooChart(symbol)));
  const result = new Map<string, PriceQuote>();
  let usedFallback = false;

  quotes.forEach((quote) => {
    if (!quote.quote) return;
    if (quote.usedFallback) usedFallback = true;
    result.set(quote.quote.symbol, quote.quote);
  });

  return { quotes: result, usedFallback };
}
