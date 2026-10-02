import type { DB, Listing, Snapshot } from './db.ts';
import { addDays, dayRange, today } from './dates.ts';
import type { Store } from './stores/types.ts';

export interface Point {
  users: number | null;
  rating: number | null;
  ratingCount: number | null;
  version: string | null;
}

export interface Change {
  now: number | null;
  then: number | null;
  delta: number | null;
  pct: number | null;
}

export interface ListingSummary {
  id: number;
  store: Store;
  storeId: string;
  name: string | null;
  url: string | null;
  lastError: string | null;
  lastFetchedAt: string | null;
  current: Point | null;
  users: Change;
  rating: Change;
  ratingCount: Change;
  /** Versions released inside the comparison window (oldest first). */
  newVersions: string[];
}

export interface ProductSummary {
  id: number;
  name: string;
  total: { users: Change; rating: Change; ratingCount: Change };
  listings: ListingSummary[];
}

export interface Series {
  days: string[];
  total: { users: (number | null)[]; rating: (number | null)[]; ratingCount: (number | null)[] };
  byListing: { id: number; store: Store; users: (number | null)[]; rating: (number | null)[]; ratingCount: (number | null)[] }[];
}

export function change(now: number | null, then: number | null): Change {
  if (now === null || then === null) return { now, then, delta: null, pct: null };
  const delta = now - then;
  return { now, then, delta, pct: then === 0 ? null : (delta / then) * 100 };
}

/** Sum of the non-null values, or null if every value is null. */
function sum(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

/** Rating across stores, weighted by how many ratings each store has. */
export function weightedRating(points: (Point | null)[]): number | null {
  let weight = 0;
  let total = 0;
  for (const p of points) {
    if (!p || p.rating === null || !p.ratingCount) continue;
    weight += p.ratingCount;
    total += p.rating * p.ratingCount;
  }
  return weight ? total / weight : null;
}

function toPoint(s: Snapshot): Point {
  return { users: s.users, rating: s.rating, ratingCount: s.rating_count, version: s.version };
}

/**
 * Builds a per-day value for each listing, carrying the last known value forward so that a
 * failed fetch (or a listing added later) doesn't look like a sudden drop in the totals.
 */
function forwardFill(listings: Listing[], snapshots: Snapshot[], days: string[]) {
  const byListing = new Map<number, Snapshot[]>();
  for (const s of snapshots) {
    const arr = byListing.get(s.listing_id) ?? [];
    arr.push(s);
    byListing.set(s.listing_id, arr);
  }
  return listings.map((l) => {
    const snaps = byListing.get(l.id) ?? [];
    let i = 0;
    let last: Point | null = null;
    const points = days.map((day) => {
      while (i < snaps.length && snaps[i].day <= day) last = toPoint(snaps[i++]);
      return last;
    });
    return { listing: l, points, snaps };
  });
}

export function productSeries(db: DB, productId: number, days: number, end = today()): Series {
  const listings = db.listListings(productId);
  const range = dayRange(addDays(end, -(days - 1)), end);
  const filled = forwardFill(listings, db.snapshotsFor(listings.map((l) => l.id), end), range);

  return {
    days: range,
    total: {
      users: range.map((_, i) => sum(filled.map((f) => f.points[i]?.users ?? null))),
      rating: range.map((_, i) => weightedRating(filled.map((f) => f.points[i]))),
      ratingCount: range.map((_, i) => sum(filled.map((f) => f.points[i]?.ratingCount ?? null))),
    },
    byListing: filled.map((f) => ({
      id: f.listing.id,
      store: f.listing.store,
      users: f.points.map((p) => p?.users ?? null),
      rating: f.points.map((p) => p?.rating ?? null),
      ratingCount: f.points.map((p) => p?.ratingCount ?? null),
    })),
  };
}

/** Compares each product's state on `end` with its state `windowDays` earlier. */
export function productSummaries(db: DB, windowDays = 7, end = today()): ProductSummary[] {
  const start = addDays(end, -windowDays);
  return db.listProducts().map((product) => {
    const listings = db.listListings(product.id);
    const filled = forwardFill(listings, db.snapshotsFor(listings.map((l) => l.id), end), [start, end]);

    const summaries: ListingSummary[] = filled.map(({ listing, points: [then, now], snaps }) => {
      const versions: string[] = [];
      let prev = then?.version ?? null;
      for (const s of snaps) {
        if (s.day <= start || !s.version) continue;
        if (prev !== null && s.version !== prev && !versions.includes(s.version)) versions.push(s.version);
        prev = s.version;
      }
      return {
        id: listing.id,
        store: listing.store,
        storeId: listing.store_id,
        name: listing.name,
        url: listing.url,
        lastError: listing.last_error,
        lastFetchedAt: listing.last_fetched_at,
        current: now,
        users: change(now?.users ?? null, then?.users ?? null),
        rating: change(now?.rating ?? null, then?.rating ?? null),
        ratingCount: change(now?.ratingCount ?? null, then?.ratingCount ?? null),
        newVersions: versions,
      };
    });

    // Totals only compare listings that existed at both ends of the window, so adding a new
    // store listing mid-week doesn't show up as "growth".
    const both = filled.filter((f) => f.points[0] && f.points[1]);
    const nowAll = filled.map((f) => f.points[1]);
    return {
      id: product.id,
      name: product.name,
      total: {
        users: {
          ...change(sum(both.map((f) => f.points[1]!.users)), sum(both.map((f) => f.points[0]!.users))),
          now: sum(nowAll.map((p) => p?.users ?? null)),
        },
        rating: {
          ...change(weightedRating(both.map((f) => f.points[1])), weightedRating(both.map((f) => f.points[0]))),
          now: weightedRating(nowAll),
        },
        ratingCount: {
          ...change(
            sum(both.map((f) => f.points[1]!.ratingCount)),
            sum(both.map((f) => f.points[0]!.ratingCount)),
          ),
          now: sum(nowAll.map((p) => p?.ratingCount ?? null)),
        },
      },
      listings: summaries,
    };
  });
}
