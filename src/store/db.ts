import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { MfPortfolioHolding, PriceQuote, Transaction } from '../types';

interface PortfolioDB extends DBSchema {
  transactions: {
    key: string;
    value: Transaction;
  };
  quotes: {
    key: string;
    value: PriceQuote;
  };
  mf_portfolio: {
    key: string;
    value: MfPortfolioHolding;
  };
  meta: {
    key: string;
    value: { key: string; value: unknown };
  };
}

const DB_NAME = 'folio-db';
const DB_VERSION = 3;
const TRANSACTION_STORE = 'transactions';
const QUOTE_STORE = 'quotes';
const MF_PORTFOLIO_STORE = 'mf_portfolio';
const META_STORE = 'meta';

async function getDb() {
  return openDB<PortfolioDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(TRANSACTION_STORE)) {
        db.createObjectStore(TRANSACTION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(QUOTE_STORE)) {
        db.createObjectStore(QUOTE_STORE, { keyPath: 'isin' });
      }
      if (!db.objectStoreNames.contains(MF_PORTFOLIO_STORE)) {
        db.createObjectStore(MF_PORTFOLIO_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    },
  });
}

export async function addTransactions(transactions: Transaction[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(TRANSACTION_STORE, 'readwrite');
  await Promise.all(transactions.map((transaction) => tx.store.put(transaction)));
  await tx.done;
}

export async function getAllTransactions(): Promise<Transaction[]> {
  const db = await getDb();
  return db.getAll(TRANSACTION_STORE);
}

export async function clearAll(): Promise<void> {
  const db = await getDb();
  await db.clear(TRANSACTION_STORE);
}

export async function hasTransactionId(id: string): Promise<boolean> {
  const db = await getDb();
  const transaction = await db.get(TRANSACTION_STORE, id);
  return Boolean(transaction);
}

export async function putQuotes(quotes: PriceQuote[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(QUOTE_STORE, 'readwrite');
  await Promise.all(quotes.map((quote) => tx.store.put(quote)));
  await tx.done;
}

export async function getAllQuotes(): Promise<PriceQuote[]> {
  const db = await getDb();
  return db.getAll(QUOTE_STORE);
}

export async function clearQuotes(): Promise<void> {
  const db = await getDb();
  await db.clear(QUOTE_STORE);
}

export async function putMfPortfolioHoldings(holdings: MfPortfolioHolding[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(MF_PORTFOLIO_STORE, 'readwrite');
  await Promise.all(holdings.map((holding) => tx.store.put(holding)));
  await tx.done;
}

export async function getAllMfPortfolioHoldings(): Promise<MfPortfolioHolding[]> {
  const db = await getDb();
  return db.getAll(MF_PORTFOLIO_STORE);
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const entry = await db.get(META_STORE, key);
  if (!entry) return undefined;
  return entry.value as T;
}

export async function putMeta<T>(key: string, value: T): Promise<void> {
  const db = await getDb();
  await db.put(META_STORE, { key, value });
}
