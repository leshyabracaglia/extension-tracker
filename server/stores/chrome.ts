import * as cheerio from 'cheerio';
import { getText, parseCount, type ListingStats, type StoreAdapter } from './types.ts';

// The Chrome Web Store has no public stats API, so we read the public listing page.
// Scraping is inherently best-effort: if Google changes the markup, adjust parseChromeHtml.

export function parseChromeHtml(html: string, id: string): ListingStats {
  const $ = cheerio.load(html);
  const text = $('body').text().replace(/\s+/g, ' ');

  const ogTitle = $('meta[property="og:title"]').attr('content') ?? $('title').text();
  const name = ogTitle.replace(/\s*-\s*Chrome Web Store\s*$/i, '').trim() || id;

  const users = parseCount(text.match(/([\d,.]+\+?[KM]?)\s+users?\b/i)?.[1]);

  let rating: number | null = null;
  const ratingMatch =
    text.match(/(\d(?:\.\d+)?)\s*out of 5/i) ?? text.match(/Average rating[:\s]*(\d(?:\.\d+)?)/i);
  if (ratingMatch) rating = Number(ratingMatch[1]);

  const ratingCount = parseCount(text.match(/([\d,.]+[KM]?)\s+ratings?\b/i)?.[1]);

  // "Version" label is followed by its value in the details section.
  let version: string | null = null;
  $('div, span, li, dt').each((_, el) => {
    if (version) return;
    const $el = $(el);
    if ($el.children().length === 0 && $el.text().trim() === 'Version') {
      const v = ($el.next().text() || $el.parent().next().text()).trim();
      if (/^[\d.]+/.test(v)) version = v;
    }
  });
  version ??= text.match(/Version\s*([\d]+(?:\.[\d]+)+)/)?.[1] ?? null;

  if (users === null && rating === null) {
    throw new Error('Could not find stats on the Chrome Web Store page (markup may have changed)');
  }

  return {
    name,
    url: `https://chromewebstore.google.com/detail/${id}`,
    users,
    rating,
    ratingCount,
    version,
    extra: {},
  };
}

export const chrome: StoreAdapter = {
  parseId(input) {
    const m = input.trim().match(/([a-p]{32})/);
    if (!m) throw new Error('Chrome extension IDs are 32 characters (a–p). Paste the ID or the store URL.');
    return m[1];
  },
  async fetch(id) {
    const html = await getText(`https://chromewebstore.google.com/detail/${id}?hl=en`);
    return parseChromeHtml(html, id);
  },
};
