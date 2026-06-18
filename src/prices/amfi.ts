import type { PriceQuote } from '../types';

const AMFI_URL = '/amfi-nav/spages/NAVAll.txt';

function parseLine(line: string): { schemeCode: string; nav: number; date: string } | null {
  const parts = line.split(';');
  if (parts.length < 6) return null;
  const schemeCode = parts[0]?.trim();
  const navRaw = parts[4]?.trim();
  const dateRaw = parts[5]?.trim();
  if (!schemeCode || !navRaw || !dateRaw) return null;
  const nav = Number(navRaw);
  if (!Number.isFinite(nav)) return null;
  const dateParts = dateRaw.split('-');
  if (dateParts.length !== 3) return null;
  const [dd, mm, yyyy] = dateParts;
  return {
    schemeCode,
    nav,
    date: `${yyyy}-${mm}-${dd}`,
  };
}

export async function fetchAmfiNavMap(): Promise<Map<string, PriceQuote>> {
  const response = await fetch(AMFI_URL);
  if (!response.ok) {
    throw new Error(`AMFI fetch failed: ${response.status}`);
  }
  const text = await response.text();
  const lines = text.split('\n');
  const result = new Map<string, PriceQuote>();

  lines.forEach((line) => {
    const parsed = parseLine(line);
    if (!parsed) return;
    result.set(parsed.schemeCode, {
      isin: parsed.schemeCode,
      symbol: parsed.schemeCode,
      price: parsed.nav,
      as_of: parsed.date,
      source: 'amfi',
    });
  });

  return result;
}
