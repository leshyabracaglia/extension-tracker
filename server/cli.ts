import fs from 'node:fs';
import { collectAll } from './collect.ts';
import { openDb } from './db.ts';
import { addDays, today } from './dates.ts';
import type { DB } from './db.ts';
import { buildDigest, sendDigest } from './digest.ts';
import type { Store } from './stores/types.ts';

const [cmd, ...flags] = process.argv.slice(2);
const db = openDb();

if (cmd === 'fetch') {
  const results = await collectAll(db);
  for (const r of results) console.log(`listing ${r.listingId}: ${r.ok ? 'ok' : r.error}`);
} else if (cmd === 'digest' && flags.includes('--preview')) {
  const { subject, html } = buildDigest(db);
  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/digest-preview.html', html);
  console.log(`Subject: ${subject}\nWrote data/digest-preview.html`);
} else if (cmd === 'digest') {
  const { subject, to } = await sendDigest(db);
  console.log(`Sent "${subject}" to ${to.join(', ')}`);
} else if (cmd === 'demo') {
  if (db.listProducts().length) throw new Error('Database already has data; point DATABASE_PATH at an empty file for the demo.');
  seedDemo(db);
  console.log('Seeded 120 days of demo data.');
} else {
  console.log('Usage: tsx server/cli.ts fetch | digest [--preview] | demo');
  process.exitCode = 1;
}

/** Fills an empty database with made-up history so you can see the dashboard before real data accumulates. */
function seedDemo(db: DB) {
  const plan: [string, [Store, string, number, number, number, number][]][] = [
    ['Tab Tidy', [
      ['chrome', 'a'.repeat(32), 18000, 0.004, 4.6, 410],
      ['firefox', 'tab-tidy', 3100, 0.002, 4.4, 95],
      ['edge', 'b'.repeat(32), 1200, 0.006, 4.5, 22],
      ['safari', '1000000001', 0, 0, 4.8, 60],
    ]],
    ['Quiet Reader', [
      ['chrome', 'c'.repeat(32), 5200, -0.001, 4.2, 130],
      ['firefox', 'quiet-reader', 2400, 0.003, 4.5, 70],
    ]],
  ];
  const end = today();
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const [name, listings] of plan) {
    const product = db.createProduct(name);
    for (const [store, storeId, users0, growth, rating, ratings0] of listings) {
      const l = db.createListing(product.id, store, storeId);
      db.markListingFetched(l.id, name, '#', new Date().toISOString());
      let users = users0;
      let ratingCount = ratings0;
      for (let i = 119; i >= 0; i--) {
        users = Math.round(users * (1 + growth + (rand() - 0.5) * 0.01));
        if (rand() < 0.3) ratingCount += 1;
        const day = addDays(end, -i);
        db.upsertSnapshot({
          listing_id: l.id, day,
          users: store === 'safari' ? null : users,
          rating: Math.round((rating + (rand() - 0.5) * 0.04) * 100) / 100,
          rating_count: ratingCount,
          version: i > 3 ? '2.3.0' : '2.4.0',
          extra: '{}', fetched_at: day,
        });
      }
    }
  }
}
