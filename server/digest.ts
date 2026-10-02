import nodemailer from 'nodemailer';
import { config } from './config.ts';
import type { DB } from './db.ts';
import { addDays, today } from './dates.ts';
import { fmtDelta, fmtNum, fmtPct, fmtRating } from './format.ts';
import { productSummaries, type Change, type ProductSummary } from './stats.ts';
import { STORE_LABELS } from './stores/types.ts';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const GOOD = '#1a7f37';
const BAD = '#cf222e';
const MUTED = '#6e7781';

function deltaHtml(c: Change, digits = 0, showPct = true): string {
  if (c.delta === null) return `<span style="color:${MUTED}">new</span>`;
  const shown = Number(c.delta.toFixed(digits));
  const color = shown > 0 ? GOOD : shown < 0 ? BAD : MUTED;
  const pct = showPct && c.pct !== null ? ` (${fmtPct(c.pct)})` : '';
  return `<span style="color:${color}">${fmtDelta(c.delta, digits)}${pct}</span>`;
}

function productHtml(p: ProductSummary): string {
  const rows = p.listings
    .map((l) => {
      const versions = l.newVersions.length
        ? `<div style="font-size:12px;color:${MUTED}">Released ${l.newVersions.map(esc).join(', ')}</div>`
        : '';
      const error = l.lastError
        ? `<div style="font-size:12px;color:${BAD}">Last fetch failed: ${esc(l.lastError)}</div>`
        : '';
      const label = l.url
        ? `<a href="${esc(l.url)}" style="color:inherit">${STORE_LABELS[l.store]}</a>`
        : STORE_LABELS[l.store];
      return `<tr>
        <td style="padding:8px 0;border-top:1px solid #eaeef2">${label}${versions}${error}</td>
        <td style="padding:8px 0;border-top:1px solid #eaeef2;text-align:right">${
          l.store === 'safari' ? `<span style="color:${MUTED}">n/a</span>` : fmtNum(l.users.now)
        }<br><small>${l.store === 'safari' ? '' : deltaHtml(l.users)}</small></td>
        <td style="padding:8px 0;border-top:1px solid #eaeef2;text-align:right">${fmtRating(l.rating.now)}<br><small>${deltaHtml(l.rating, 2, false)}</small></td>
        <td style="padding:8px 0;border-top:1px solid #eaeef2;text-align:right">${fmtNum(l.ratingCount.now)}<br><small>${deltaHtml(l.ratingCount, 0, false)}</small></td>
      </tr>`;
    })
    .join('');

  return `<div style="margin:0 0 28px">
    <h2 style="margin:0 0 4px;font-size:18px">${esc(p.name)}</h2>
    <table role="presentation" style="width:100%;margin:8px 0 12px;border-collapse:collapse"><tr>
      <td style="padding:12px;background:#f6f8fa;border-radius:8px;width:33%">
        <div style="font-size:12px;color:${MUTED}">Users</div>
        <div style="font-size:22px;font-weight:600">${fmtNum(p.total.users.now)}</div>
        <div style="font-size:13px">${deltaHtml(p.total.users)}</div></td>
      <td style="width:8px"></td>
      <td style="padding:12px;background:#f6f8fa;border-radius:8px;width:33%">
        <div style="font-size:12px;color:${MUTED}">Avg rating</div>
        <div style="font-size:22px;font-weight:600">${fmtRating(p.total.rating.now)}</div>
        <div style="font-size:13px">${deltaHtml(p.total.rating, 2, false)}</div></td>
      <td style="width:8px"></td>
      <td style="padding:12px;background:#f6f8fa;border-radius:8px;width:33%">
        <div style="font-size:12px;color:${MUTED}">Ratings</div>
        <div style="font-size:22px;font-weight:600">${fmtNum(p.total.ratingCount.now)}</div>
        <div style="font-size:13px">${deltaHtml(p.total.ratingCount, 0, false)} new</div></td>
    </tr></table>
    <table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="font-size:12px;color:${MUTED}"><td>Store</td><td style="text-align:right">Users</td><td style="text-align:right">Rating</td><td style="text-align:right">Ratings</td></tr>
      ${rows}
    </table>
  </div>`;
}

export function buildDigest(db: DB, end = today()) {
  const products = productSummaries(db, 7, end).filter((p) => p.listings.length > 0);
  const start = addDays(end, -7);
  const fmtDay = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

  const totalUsers = products.reduce((a, p) => a + (p.total.users.now ?? 0), 0);
  const totalDelta = products.reduce((a, p) => a + (p.total.users.delta ?? 0), 0);
  const subject = `Weekly extension stats: ${fmtNum(totalUsers)} users (${fmtDelta(totalDelta)}) · ${fmtDay(start)}–${fmtDay(end)}`;

  const body = products.length
    ? products.map(productHtml).join('')
    : `<p>No extensions are being tracked yet. <a href="${esc(config.appUrl)}">Add one in the dashboard.</a></p>`;

  const html = `<!doctype html><html><body style="margin:0;background:#ffffff">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2328">
    <div style="font-size:13px;color:${MUTED}">${fmtDay(start)} – ${fmtDay(end)}</div>
    <h1 style="margin:4px 0 24px;font-size:22px">Your weekly extension stats</h1>
    ${body}
    <p style="font-size:12px;color:${MUTED};margin-top:32px">
      Users are what each store reports: Chrome weekly users, Firefox average daily users, Edge active installs.
      The App Store doesn't publish Safari user counts. Changes compare against the same day last week;
      listings added during the week aren't counted as growth.<br><br>
      <a href="${esc(config.appUrl)}" style="color:${MUTED}">Open dashboard</a>
    </p>
  </div></body></html>`;

  return { subject, html };
}

export async function sendDigest(db: DB): Promise<{ subject: string; to: string[] }> {
  if (!config.smtpUrl) throw new Error('SMTP_URL is not set');
  if (!config.digestTo.length) throw new Error('DIGEST_TO is not set');
  const { subject, html } = buildDigest(db);
  await nodemailer.createTransport(config.smtpUrl).sendMail({
    from: config.digestFrom,
    to: config.digestTo,
    subject,
    html,
  });
  db.logDigest(config.digestTo, subject);
  return { subject, to: config.digestTo };
}
