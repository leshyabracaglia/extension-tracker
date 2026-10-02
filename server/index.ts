import cron from 'node-cron';
import { createApp } from './app.ts';
import { collectAll } from './collect.ts';
import { config } from './config.ts';
import { openDb } from './db.ts';
import { sendDigest } from './digest.ts';

const db = openDb();

async function runCollect() {
  const results = await collectAll(db);
  const failed = results.filter((r) => !r.ok);
  console.log(`[fetch] ${results.length - failed.length}/${results.length} listings updated`);
  for (const f of failed) console.warn(`[fetch] listing ${f.listingId}: ${f.error}`);
}

cron.schedule(config.fetchCron, () => void runCollect().catch(console.error), { timezone: config.timezone });

cron.schedule(
  config.digestCron,
  async () => {
    try {
      // Make sure the email reflects today's numbers.
      await runCollect();
      const { subject, to } = await sendDigest(db);
      console.log(`[digest] sent "${subject}" to ${to.join(', ')}`);
    } catch (err) {
      console.error('[digest] failed:', err);
    }
  },
  { timezone: config.timezone },
);

createApp(db).listen(config.port, () => {
  console.log(`Extension Tracker on http://localhost:${config.port}`);
  console.log(`Fetching "${config.fetchCron}", digest "${config.digestCron}" (${config.timezone})`);
});
