import { getText, num, type ListingStats, type StoreAdapter } from './types.ts';

// Edge Add-ons serves listing details as JSON to its own storefront.

export function parseEdgeJson(json: any, id: string): ListingStats {
  if (!json || !json.name) throw new Error('Edge Add-ons returned no listing for this ID');
  return {
    name: json.name,
    url: `https://microsoftedge.microsoft.com/addons/detail/${id}`,
    users: num(json.activeInstallCount),
    rating: num(json.averageRating),
    ratingCount: num(json.ratingCount),
    version: json.version ?? null,
    extra: {},
  };
}

export const edge: StoreAdapter = {
  parseId(input) {
    const m = input.trim().match(/([a-p]{32})/);
    if (!m) throw new Error('Edge add-on IDs are 32 characters (a–p). Paste the ID or the store URL.');
    return m[1];
  },
  async fetch(id) {
    const body = await getText(`https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/${id}?hl=en-US&gl=US`);
    return parseEdgeJson(JSON.parse(body), id);
  },
};
