import { getText, num, type ListingStats, type StoreAdapter } from './types.ts';

// addons.mozilla.org has a public JSON API: https://addons-server.readthedocs.io/en/latest/topics/api/addons.html

export function parseFirefoxJson(json: any): ListingStats {
  return {
    name: typeof json.name === 'string' ? json.name : (json.name?.['en-US'] ?? Object.values(json.name ?? {})[0] ?? json.slug),
    url: json.url ?? `https://addons.mozilla.org/firefox/addon/${json.slug}/`,
    users: num(json.average_daily_users),
    rating: num(json.ratings?.average),
    ratingCount: num(json.ratings?.count),
    version: json.current_version?.version ?? null,
    extra: { weeklyDownloads: num(json.weekly_downloads), reviewCount: num(json.ratings?.text_count) },
  };
}

export const firefox: StoreAdapter = {
  parseId(input) {
    const s = input.trim();
    const m = s.match(/addons\.mozilla\.org\/(?:[\w-]+\/)?(?:firefox|android)\/addon\/([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
    if (!s || s.includes('/')) throw new Error('Paste the add-on slug, numeric ID, GUID, or its addons.mozilla.org URL.');
    return s;
  },
  async fetch(id) {
    const body = await getText(`https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(id)}/?lang=en-US`);
    return parseFirefoxJson(JSON.parse(body));
  },
};
