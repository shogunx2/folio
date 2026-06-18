import Papa from 'papaparse';
import { getMeta, putMeta } from '../store/db';

type NseIsinMapCache = {
  updated_at: string;
  map: Record<string, string>;
};

type EquityRow = {
  SYMBOL?: string;
  'ISIN NUMBER'?: string;
};

const NSE_CSV_URL = '/nse-csv/content/equities/EQUITY_L.csv';
const CACHE_KEY = 'nse_isin_map';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isFresh(cache: NseIsinMapCache | undefined): boolean {
  if (!cache) return false;
  const updatedAt = new Date(cache.updated_at).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt < MAX_AGE_MS;
}

async function fetchNseIsinMap(): Promise<Record<string, string>> {
  const response = await fetch(NSE_CSV_URL);
  if (!response.ok) {
    throw new Error(`NSE ISIN map fetch failed: ${response.status}`);
  }
  const csvText = await response.text();
  const parsed = Papa.parse<EquityRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.replace(/^\uFEFF/, '').trim().toUpperCase(),
  });
  const map: Record<string, string> = {};
  parsed.data.forEach((row) => {
    const isin = row['ISIN NUMBER']?.trim().toUpperCase();
    const symbol = row.SYMBOL?.trim().toUpperCase();
    if (!isin || !symbol) return;
    map[isin] = symbol;
  });
  return map;
}

export async function getNseIsinMap(): Promise<Record<string, string>> {
  const cached = await getMeta<NseIsinMapCache>(CACHE_KEY);
  if (cached && isFresh(cached)) {
    return cached.map;
  }

  try {
    const map = await fetchNseIsinMap();
    await putMeta(CACHE_KEY, { updated_at: new Date().toISOString(), map });
    return map;
  } catch (error) {
    if (cached?.map) return cached.map;
    throw error;
  }
}

export async function warmNseIsinMap(): Promise<void> {
  try {
    await getNseIsinMap();
  } catch {
    // Best-effort cache warmup.
  }
}
