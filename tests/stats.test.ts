import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type DB } from '../server/db.ts';
import { buildDigest } from '../server/digest.ts';
import { productSeries, productSummaries, weightedRating } from '../server/stats.ts';

let db: DB;

function snap(listingId: number, day: string, users: number | null, rating: number | null, ratingCount: number | null, version = '1.0') {
  db.upsertSnapshot({ listing_id: listingId, day, users, rating, rating_count: ratingCount, version, extra: '{}', fetched_at: day });
}

beforeEach(() => {
  db = openDb(':memory:');
});

describe('weightedRating', () => {
  it('weights by rating count', () => {
    const p = (rating: number, ratingCount: number) => ({ users: 0, rating, ratingCount, version: null });
    expect(weightedRating([p(5, 100), p(3, 100)])).toBe(4);
    expect(weightedRating([p(5, 300), p(1, 100)])).toBe(4);
    expect(weightedRating([null])).toBeNull();
  });
});

describe('productSummaries', () => {
  it('aggregates across browsers and breaks down per browser', () => {
    const p = db.createProduct('Tab Tidy');
    const c = db.createListing(p.id, 'chrome', 'a'.repeat(32));
    const f = db.createListing(p.id, 'firefox', 'tab-tidy');
    const s = db.createListing(p.id, 'safari', '123456');
    snap(c.id, '2026-09-24', 1000, 4.5, 100);
    snap(c.id, '2026-10-01', 1100, 4.5, 110, '1.1');
    snap(f.id, '2026-09-24', 200, 4.0, 50);
    snap(f.id, '2026-10-01', 180, 4.0, 50);
    snap(s.id, '2026-09-24', null, 5, 10);
    snap(s.id, '2026-10-01', null, 5, 20);

    const [summary] = productSummaries(db, 7, '2026-10-01');
    expect(summary.total.users).toMatchObject({ now: 1280, then: 1200, delta: 80 });
    expect(summary.total.users.pct).toBeCloseTo(6.667, 2);
    expect(summary.total.ratingCount).toMatchObject({ now: 180, delta: 20 });
    expect(summary.total.rating.now).toBeCloseTo((4.5 * 110 + 4 * 50 + 5 * 20) / 180);

    const chrome = summary.listings.find((l) => l.store === 'chrome')!;
    expect(chrome.users).toMatchObject({ now: 1100, delta: 100, pct: 10 });
    expect(chrome.newVersions).toEqual(['1.1']);
    expect(summary.listings.find((l) => l.store === 'firefox')!.users.delta).toBe(-20);
  });

  it('does not count a listing added mid-window as growth', () => {
    const p = db.createProduct('X');
    const c = db.createListing(p.id, 'chrome', 'a'.repeat(32));
    const e = db.createListing(p.id, 'edge', 'b'.repeat(32));
    snap(c.id, '2026-09-24', 1000, 4, 10);
    snap(c.id, '2026-10-01', 1010, 4, 10);
    snap(e.id, '2026-09-30', 500, 4, 10);
    snap(e.id, '2026-10-01', 500, 4, 10);
    const [summary] = productSummaries(db, 7, '2026-10-01');
    expect(summary.total.users).toMatchObject({ now: 1510, delta: 10 });
  });

  it('carries the last value forward over a failed day', () => {
    const p = db.createProduct('X');
    const c = db.createListing(p.id, 'chrome', 'a'.repeat(32));
    const f = db.createListing(p.id, 'firefox', 'x');
    snap(c.id, '2026-09-29', 1000, 4, 10);
    snap(f.id, '2026-09-29', 100, 4, 10);
    snap(c.id, '2026-09-30', 1000, 4, 10); // firefox fetch failed on the 30th
    snap(c.id, '2026-10-01', 1000, 4, 10);
    snap(f.id, '2026-10-01', 100, 4, 10);
    const series = productSeries(db, p.id, 3, '2026-10-01');
    expect(series.days).toEqual(['2026-09-29', '2026-09-30', '2026-10-01']);
    expect(series.total.users).toEqual([1100, 1100, 1100]);
  });
});

describe('digest', () => {
  it('renders each product with per-browser rows', () => {
    const p = db.createProduct('Tab <Tidy>');
    const c = db.createListing(p.id, 'chrome', 'a'.repeat(32));
    snap(c.id, '2026-09-24', 1000, 4.5, 100);
    snap(c.id, '2026-10-01', 1100, 4.5, 110);
    const { subject, html } = buildDigest(db, '2026-10-01');
    expect(subject).toContain('1,100 users (+100)');
    expect(html).toContain('Tab &lt;Tidy&gt;');
    expect(html).toContain('+10.0%');
  });
});
