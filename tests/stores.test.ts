import { describe, expect, it } from 'vitest';
import { chrome, parseChromeHtml } from '../server/stores/chrome.ts';
import { edge, parseEdgeJson } from '../server/stores/edge.ts';
import { firefox, parseFirefoxJson } from '../server/stores/firefox.ts';
import { parseSafariJson, safari } from '../server/stores/safari.ts';
import { parseCount } from '../server/stores/types.ts';

const CHROME_ID = 'cjpalhdlnbpafiamejdnhcphjbkeiagm';

describe('parseCount', () => {
  it('handles the formats stores use', () => {
    expect(parseCount('1,234')).toBe(1234);
    expect(parseCount('10,000+')).toBe(10000);
    expect(parseCount('28.6K')).toBe(28600);
    expect(parseCount('1.2M')).toBe(1200000);
    expect(parseCount('abc')).toBeNull();
  });
});

describe('ID parsing', () => {
  it('accepts IDs and store URLs', () => {
    expect(chrome.parseId(`https://chromewebstore.google.com/detail/ublock-origin/${CHROME_ID}?hl=en`)).toBe(CHROME_ID);
    expect(chrome.parseId(CHROME_ID)).toBe(CHROME_ID);
    expect(() => chrome.parseId('nope')).toThrow();
    expect(firefox.parseId('https://addons.mozilla.org/en-US/firefox/addon/ublock-origin/')).toBe('ublock-origin');
    expect(firefox.parseId('uBlock0@raymondhill.net')).toBe('uBlock0@raymondhill.net');
    expect(edge.parseId('https://microsoftedge.microsoft.com/addons/detail/ublock-origin/odfafepnkmbhccpbejgmiehpchacaeak')).toBe(
      'odfafepnkmbhccpbejgmiehpchacaeak',
    );
    expect(safari.parseId('https://apps.apple.com/us/app/1password-for-safari/id1569813296?mt=12')).toBe('1569813296');
    expect(safari.parseId('1569813296')).toBe('1569813296');
  });
});

describe('Chrome Web Store page', () => {
  // Shape modeled on the public listing page.
  const html = `<html><head><meta property="og:title" content="Tab Tidy - Chrome Web Store"></head><body>
    <h1>Tab Tidy</h1>
    <div><span>4.6</span><span>out of 5 stars</span></div>
    <p>1.2K ratings</p>
    <div>Extension</div><div>Productivity</div><div>12,345 users</div>
    <section><div>Version</div><div>2.4.1</div><div>Updated</div><div>September 20, 2026</div></section>
  </body></html>`;

  it('extracts users, rating, count and version', () => {
    expect(parseChromeHtml(html, CHROME_ID)).toEqual({
      name: 'Tab Tidy',
      url: `https://chromewebstore.google.com/detail/${CHROME_ID}`,
      users: 12345,
      rating: 4.6,
      ratingCount: 1200,
      version: '2.4.1',
      extra: {},
    });
  });

  it('fails loudly when the markup has no stats', () => {
    expect(() => parseChromeHtml('<html><body>Item not found</body></html>', CHROME_ID)).toThrow(/markup/);
  });
});

describe('Firefox AMO API', () => {
  it('maps the addon response', () => {
    const stats = parseFirefoxJson({
      slug: 'tab-tidy',
      name: 'Tab Tidy',
      url: 'https://addons.mozilla.org/en-US/firefox/addon/tab-tidy/',
      average_daily_users: 4321,
      weekly_downloads: 210,
      ratings: { average: 4.4123, count: 88, text_count: 30 },
      current_version: { version: '2.4.0' },
    });
    expect(stats).toMatchObject({ name: 'Tab Tidy', users: 4321, rating: 4.4123, ratingCount: 88, version: '2.4.0' });
    expect(stats.extra).toEqual({ weeklyDownloads: 210, reviewCount: 30 });
  });
});

describe('Edge Add-ons', () => {
  it('maps the product details response', () => {
    expect(parseEdgeJson({ name: 'Tab Tidy', activeInstallCount: 999, averageRating: 4.1, ratingCount: 12, version: '2.4.1' }, 'x')).toMatchObject({
      users: 999,
      rating: 4.1,
      ratingCount: 12,
      version: '2.4.1',
    });
  });
});

describe('App Store lookup', () => {
  it('maps ratings and leaves users empty', () => {
    expect(
      parseSafariJson({
        results: [{ trackName: 'Tab Tidy', trackViewUrl: 'https://apps.apple.com/app/id1', averageUserRating: 4.8, userRatingCount: 40, version: '2.4' }],
      }),
    ).toMatchObject({ users: null, rating: 4.8, ratingCount: 40, version: '2.4' });
    expect(() => parseSafariJson({ results: [] })).toThrow();
  });
});
