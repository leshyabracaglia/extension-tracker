export type Store = 'chrome' | 'firefox' | 'edge' | 'safari';

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
  current: { users: number | null; rating: number | null; ratingCount: number | null; version: string | null } | null;
  users: Change;
  rating: Change;
  ratingCount: Change;
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

export interface Settings {
  emailConfigured: boolean;
  digestTo: string[];
  digestCron: string;
  fetchCron: string;
  timezone: string;
  lastDigest: { sent_at: string; subject: string } | null;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  summary: (window: number) => request<{ products: ProductSummary[] }>('GET', `/api/summary?window=${window}`),
  series: (id: number, days: number) => request<Series>('GET', `/api/products/${id}/series?days=${days}`),
  settings: () => request<Settings>('GET', '/api/settings'),
  createProduct: (name: string) => request<{ id: number }>('POST', '/api/products', { name }),
  renameProduct: (id: number, name: string) => request('PATCH', `/api/products/${id}`, { name }),
  deleteProduct: (id: number) => request('DELETE', `/api/products/${id}`),
  addListing: (productId: number, store: Store, storeId: string) =>
    request('POST', `/api/products/${productId}/listings`, { store, storeId }),
  deleteListing: (id: number) => request('DELETE', `/api/listings/${id}`),
  refresh: () => request<{ ok: boolean }[]>('POST', '/api/refresh'),
  sendDigest: () => request<{ subject: string; to: string[] }>('POST', '/api/digest/send'),
};

export const STORE_LABELS: Record<Store, string> = { chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', safari: 'Safari' };
export const STORES: Store[] = ['chrome', 'firefox', 'edge', 'safari'];

export const STORE_HINTS: Record<Store, string> = {
  chrome: 'Extension ID or chromewebstore.google.com URL',
  firefox: 'Add-on slug, GUID, or addons.mozilla.org URL',
  edge: 'Add-on ID or microsoftedge.microsoft.com URL',
  safari: 'App Store ID or apps.apple.com URL',
};
