import fs from 'node:fs';
import path from 'node:path';
// node:sqlite is built into Node 22.13+, so there is no native module to compile.
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';
import type { Store } from './stores/types.ts';

export interface Product {
  id: number;
  name: string;
  created_at: string;
}

export interface Listing {
  id: number;
  product_id: number;
  store: Store;
  store_id: string;
  name: string | null;
  url: string | null;
  last_error: string | null;
  last_fetched_at: string | null;
}

export interface Snapshot {
  listing_id: number;
  day: string; // YYYY-MM-DD
  users: number | null;
  rating: number | null;
  rating_count: number | null;
  version: string | null;
  extra: string;
  fetched_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  store TEXT NOT NULL,
  store_id TEXT NOT NULL,
  name TEXT,
  url TEXT,
  last_error TEXT,
  last_fetched_at TEXT,
  UNIQUE (store, store_id)
);
CREATE TABLE IF NOT EXISTS snapshots (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  users INTEGER,
  rating REAL,
  rating_count INTEGER,
  version TEXT,
  extra TEXT NOT NULL DEFAULT '{}',
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (listing_id, day)
);
CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY,
  sent_at TEXT NOT NULL,
  recipients TEXT NOT NULL,
  subject TEXT NOT NULL
);
`;

export type DB = ReturnType<typeof createRepo>;

export function openDb(file = config.databasePath): DB {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return createRepo(db);
}

function createRepo(db: DatabaseSync) {
  const all = <T>(sql: string, ...params: any[]) => db.prepare(sql).all(...params) as unknown as T[];
  const get = <T>(sql: string, ...params: any[]) => db.prepare(sql).get(...params) as unknown as T | undefined;
  const run = (sql: string, ...params: any[]) => db.prepare(sql).run(...params);

  return {
    raw: db,

    listProducts: () => all<Product>('SELECT * FROM products ORDER BY name COLLATE NOCASE'),
    getProduct: (id: number) => get<Product>('SELECT * FROM products WHERE id = ?', id),
    createProduct: (name: string) =>
      get<Product>('INSERT INTO products (name) VALUES (?) RETURNING *', name)!,
    renameProduct: (id: number, name: string) => run('UPDATE products SET name = ? WHERE id = ?', name, id),
    deleteProduct: (id: number) => run('DELETE FROM products WHERE id = ?', id),

    listListings: (productId?: number) =>
      productId === undefined
        ? all<Listing>('SELECT * FROM listings ORDER BY id')
        : all<Listing>('SELECT * FROM listings WHERE product_id = ? ORDER BY id', productId),
    getListing: (id: number) => get<Listing>('SELECT * FROM listings WHERE id = ?', id),
    findListing: (store: Store, storeId: string) =>
      get<Listing>('SELECT * FROM listings WHERE store = ? AND store_id = ?', store, storeId),
    createListing: (productId: number, store: Store, storeId: string) =>
      get<Listing>(
        'INSERT INTO listings (product_id, store, store_id) VALUES (?, ?, ?) RETURNING *',
        productId,
        store,
        storeId,
      )!,
    deleteListing: (id: number) => run('DELETE FROM listings WHERE id = ?', id),
    markListingFetched: (id: number, name: string, url: string, at: string) =>
      run('UPDATE listings SET name = ?, url = ?, last_error = NULL, last_fetched_at = ? WHERE id = ?', name, url, at, id),
    markListingError: (id: number, error: string, at: string) =>
      run('UPDATE listings SET last_error = ?, last_fetched_at = ? WHERE id = ?', error, at, id),

    upsertSnapshot: (s: Snapshot) =>
      run(
        `INSERT INTO snapshots (listing_id, day, users, rating, rating_count, version, extra, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (listing_id, day) DO UPDATE SET
           users = excluded.users, rating = excluded.rating, rating_count = excluded.rating_count,
           version = excluded.version, extra = excluded.extra, fetched_at = excluded.fetched_at`,
        s.listing_id, s.day, s.users, s.rating, s.rating_count, s.version, s.extra, s.fetched_at,
      ),
    /** Snapshots for the given listings with day <= `to`, ordered by day. */
    snapshotsFor: (listingIds: number[], to: string) => {
      if (listingIds.length === 0) return [];
      const marks = listingIds.map(() => '?').join(',');
      return all<Snapshot>(
        `SELECT * FROM snapshots WHERE listing_id IN (${marks}) AND day <= ? ORDER BY day`,
        ...listingIds,
        to,
      );
    },

    logDigest: (recipients: string[], subject: string) =>
      run('INSERT INTO digests (sent_at, recipients, subject) VALUES (?, ?, ?)', new Date().toISOString(), recipients.join(','), subject),
    lastDigest: () => get<{ sent_at: string; subject: string }>('SELECT * FROM digests ORDER BY id DESC LIMIT 1'),
  };
}
