import Fuse from 'fuse.js';
import { getMeta, putMeta } from '../store/db';

type AmfiSchemeCache = {
  updated_at: string;
  name_to_scheme: Record<string, { scheme_code: string; isin: string | null; nav: number }>;
  scheme_to_nav: Record<string, { nav: number; date: string }>;
};

type NameToSchemeMap = Record<string, { scheme_code: string; isin: string | null; nav: number }>;

const CACHE_KEY = 'amfi_scheme_cache';
const AMFI_URL = '/amfi-nav/spages/NAVAll.txt';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const STRIP_PHRASES = ['direct', 'growth', 'plan', 'option', 'formerly', 'erstwhile'] as const;
const MATCH_THRESHOLD = 0.35;

export function normalizeAmfiSchemeName(value: string): string {
  let normalized = value.toLowerCase();
  normalized = normalized.replace(/\([^)]*\)/g, ' ');
  STRIP_PHRASES.forEach((phrase) => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, 'g'), ' ');
  });
  normalized = normalized.replace(/[^a-z0-9\s]/g, ' ');
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

function isFresh(cache: AmfiSchemeCache | undefined): boolean {
  if (!cache) return false;
  const updatedAt = new Date(cache.updated_at).getTime();
  if (!Number.isFinite(updatedAt)) return false;
  return Date.now() - updatedAt < MAX_AGE_MS;
}

function parseAmfiLine(line: string): {
  scheme_code: string;
  isin: string | null;
  scheme_name: string;
  nav: number;
  date: string;
} | null {
  const parts = line.split(';');
  if (parts.length < 6) return null;
  const schemeCode = parts[0]?.trim();
  const isin = parts[1]?.trim() || null;
  const schemeName = parts[3]?.trim();
  const navRaw = parts[4]?.trim();
  const dateRaw = parts[5]?.trim();
  if (!schemeCode || !schemeName || !navRaw || !dateRaw) return null;
  const nav = Number(navRaw);
  if (!Number.isFinite(nav)) return null;
  const dateParts = dateRaw.split('-');
  if (dateParts.length !== 3) return null;
  const [dd, mon, yyyy] = dateParts;
  return {
    scheme_code: schemeCode,
    isin,
    scheme_name: schemeName,
    nav,
    date: `${yyyy}-${mon}-${dd}`,
  };
}

async function fetchAmfiNavText(): Promise<string> {
  const response = await fetch(AMFI_URL);
  if (!response.ok) {
    throw new Error(`AMFI fetch failed: ${response.status}`);
  }
  return response.text();
}

async function buildAmfiSchemeCache(): Promise<AmfiSchemeCache> {
  const text = await fetchAmfiNavText();
  const lines = text.split('\n');
  const nameToScheme: NameToSchemeMap = {};
  const schemeToNav: Record<string, { nav: number; date: string }> = {};

  lines.forEach((line) => {
    const parsed = parseAmfiLine(line);
    if (!parsed) return;
    const normalizedName = normalizeAmfiSchemeName(parsed.scheme_name);
    if (normalizedName) {
      nameToScheme[normalizedName] = {
        scheme_code: parsed.scheme_code,
        isin: parsed.isin,
        nav: parsed.nav,
      };
    }
    schemeToNav[parsed.scheme_code] = { nav: parsed.nav, date: parsed.date };
  });

  return {
    updated_at: new Date().toISOString(),
    name_to_scheme: nameToScheme,
    scheme_to_nav: schemeToNav,
  };
}

export async function getAmfiSchemeData(): Promise<{
  nameToScheme: NameToSchemeMap;
  schemeToNav: Record<string, { nav: number; date: string }>;
}> {
  const cached = await getMeta<AmfiSchemeCache>(CACHE_KEY);
  if (isFresh(cached)) {
    return { nameToScheme: cached.name_to_scheme, schemeToNav: cached.scheme_to_nav };
  }

  try {
    const cache = await buildAmfiSchemeCache();
    await putMeta(CACHE_KEY, cache);
    return { nameToScheme: cache.name_to_scheme, schemeToNav: cache.scheme_to_nav };
  } catch (error) {
    if (cached) {
      return { nameToScheme: cached.name_to_scheme, schemeToNav: cached.scheme_to_nav };
    }
    throw error;
  }
}

export function matchAmfiSchemeName(normalized: string, nameToScheme: NameToSchemeMap): string | null {
  if (!normalized) return null;
  const directMatch = nameToScheme[normalized];
  if (directMatch) return directMatch.scheme_code;

  const entries = Object.entries(nameToScheme).map(([name, value]) => ({
    name,
    scheme_code: value.scheme_code,
  }));
  if (entries.length === 0) return null;

  const fuse = new Fuse(entries, {
    keys: ['name'],
    threshold: MATCH_THRESHOLD,
  });
  const matches = fuse.search(normalized, { limit: 1 });
  const best = matches[0];
  if (!best || best.score === undefined || best.score > MATCH_THRESHOLD) {
    return null;
  }
  return best.item.scheme_code;
}

export async function warmAmfiSchemeMap(): Promise<void> {
  try {
    await getAmfiSchemeData();
  } catch {
    // Best-effort cache warmup.
  }
}
