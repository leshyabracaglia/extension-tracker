import fs from 'node:fs';
import type { DB } from './db.ts';
import { adapters, STORES, type Store } from './stores/index.ts';

/**
 * extensions.json lets you declare what to track without using the dashboard (handy when the
 * tracker runs from GitHub Actions). Syncing only adds things: removing an entry from the file
 * leaves its history in the database.
 *
 * { "extensions": [ { "name": "Tab Tidy", "listings": { "chrome": "<id or URL>", "firefox": "<slug>" } } ] }
 */
export interface ExtensionsFile {
  extensions: { name: string; listings: Partial<Record<Store, string | string[]>> }[];
}

export function syncFromFile(db: DB, file = 'extensions.json'): string[] {
  if (!fs.existsSync(file)) return [];
  const config = JSON.parse(fs.readFileSync(file, 'utf8')) as ExtensionsFile;
  const log: string[] = [];

  for (const ext of config.extensions ?? []) {
    let product = db.listProducts().find((p) => p.name === ext.name);
    if (!product) {
      product = db.createProduct(ext.name);
      log.push(`added extension ${ext.name}`);
    }
    for (const [store, value] of Object.entries(ext.listings ?? {}) as [Store, string | string[]][]) {
      if (!STORES.includes(store)) {
        log.push(`${ext.name}: unknown store "${store}" (use ${STORES.join(', ')})`);
        continue;
      }
      for (const raw of [value].flat().filter(Boolean)) {
        let storeId: string;
        try {
          storeId = adapters[store].parseId(raw);
        } catch (err) {
          log.push(`${ext.name}: ${store} "${raw}": ${(err as Error).message}`);
          continue;
        }
        if (db.findListing(store, storeId)) continue;
        db.createListing(product.id, store, storeId);
        log.push(`${ext.name}: tracking ${store} ${storeId}`);
      }
    }
  }
  return log;
}
