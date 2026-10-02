import { config } from '../config.ts';
import { getText, num, type ListingStats, type StoreAdapter } from './types.ts';

// Safari extensions ship through the App Store. The iTunes lookup API is public but
// exposes ratings and versions only — Apple does not publish install or user counts.

export function parseSafariJson(json: any): ListingStats {
  const app = json?.results?.[0];
  if (!app) throw new Error('App Store lookup returned no results for this ID');
  return {
    name: app.trackName,
    url: app.trackViewUrl,
    users: null,
    rating: num(app.averageUserRating),
    ratingCount: num(app.userRatingCount),
    version: app.version ?? null,
    extra: {},
  };
}

export const safari: StoreAdapter = {
  parseId(input) {
    const s = input.trim();
    const m = s.match(/\/id(\d+)/) ?? s.match(/^(?:id)?(\d+)$/);
    if (!m) throw new Error('Paste the numeric App Store ID or the apps.apple.com URL.');
    return m[1];
  },
  async fetch(id) {
    const body = await getText(`https://itunes.apple.com/lookup?id=${id}&country=${config.safariCountry}`);
    return parseSafariJson(JSON.parse(body));
  },
};
