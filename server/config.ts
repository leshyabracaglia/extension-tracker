import 'dotenv/config';

const env = process.env;

export const config = {
  databasePath: env.DATABASE_PATH || './data/tracker.db',
  port: Number(env.PORT || 3000),
  appPassword: env.APP_PASSWORD || '',
  fetchCron: env.FETCH_CRON || '0 6 * * *',
  digestCron: env.DIGEST_CRON || '0 9 * * 1',
  timezone: env.TZ || 'UTC',
  smtpUrl: env.SMTP_URL || '',
  digestFrom: env.DIGEST_FROM || 'Extension Tracker <digest@localhost>',
  digestTo: (env.DIGEST_TO || '').split(',').map((s) => s.trim()).filter(Boolean),
  appUrl: env.APP_URL || `http://localhost:${env.PORT || 3000}`,
  safariCountry: env.SAFARI_COUNTRY || 'us',
};
