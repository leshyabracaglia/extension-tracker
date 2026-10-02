import type { DB, Listing } from './db.ts';
import { today } from './dates.ts';
import { adapters } from './stores/index.ts';

export interface CollectResult {
  listingId: number;
  ok: boolean;
  error?: string;
}

export async function collectListing(db: DB, listing: Listing): Promise<CollectResult> {
  const at = new Date().toISOString();
  try {
    const stats = await adapters[listing.store].fetch(listing.store_id);
    db.upsertSnapshot({
      listing_id: listing.id,
      day: today(),
      users: stats.users,
      rating: stats.rating,
      rating_count: stats.ratingCount,
      version: stats.version,
      extra: JSON.stringify(stats.extra),
      fetched_at: at,
    });
    db.markListingFetched(listing.id, stats.name, stats.url, at);
    return { listingId: listing.id, ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    db.markListingError(listing.id, error, at);
    return { listingId: listing.id, ok: false, error };
  }
}

/** Fetches every listing. Runs a few at a time so we stay polite to the stores. */
export async function collectAll(db: DB, concurrency = 3): Promise<CollectResult[]> {
  const queue = [...db.listListings()];
  const results: CollectResult[] = [];
  const worker = async () => {
    for (let l = queue.shift(); l; l = queue.shift()) results.push(await collectListing(db, l));
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}
