import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { fmtDelta, fmtNum, fmtPct, fmtRating } from '../../server/format.ts';
import {
  api,
  STORE_HINTS,
  STORE_LABELS,
  STORES,
  type Change,
  type ProductSummary,
  type Series,
  type Settings,
  type Store,
} from './api.ts';
import { StatsChart, type Metric, type View } from './Chart.tsx';

const WINDOWS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

function useHashRoute(): [number | null, (id: number | null) => void] {
  const read = () => {
    const m = location.hash.match(/^#\/product\/(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const [id, setId] = useState(read);
  useEffect(() => {
    const onHash = () => setId(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return [id, (next) => (location.hash = next === null ? '' : `#/product/${next}`)];
}

export function App() {
  const [window_, setWindow] = useState(7);
  const [products, setProducts] = useState<ProductSummary[] | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, select] = useHashRoute();

  const load = useCallback(async () => {
    try {
      const [s, cfg] = await Promise.all([api.summary(window_), api.settings()]);
      setProducts(s.products);
      setSettings(cfg);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [window_]);

  useEffect(() => void load(), [load]);

  const act = async (label: string, fn: () => Promise<unknown>, success?: string) => {
    setBusy(label);
    setNotice(null);
    try {
      await fn();
      if (success) setNotice(success);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const product = products?.find((p) => p.id === selected) ?? null;

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#" onClick={() => select(null)}>
          Extension Tracker
        </a>
        <div className="topbar-actions">
          <Segmented
            value={window_}
            onChange={setWindow}
            options={WINDOWS.map((w) => ({ value: w.days, label: w.label }))}
            ariaLabel="Comparison window"
          />
          <button disabled={!!busy} onClick={() => act('refresh', api.refresh, 'Fetched the latest numbers from every store.')}>
            {busy === 'refresh' ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error} <button className="link" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
      {notice && <div className="banner">{notice}</div>}

      {!products ? (
        <p className="muted">Loading…</p>
      ) : product ? (
        <ProductDetail
          key={product.id}
          product={product}
          windowDays={window_}
          busy={busy}
          onBack={() => select(null)}
          act={act}
          onDeleted={() => select(null)}
        />
      ) : (
        <Overview products={products} windowDays={window_} onOpen={select} act={act} busy={busy} settings={settings} />
      )}
    </div>
  );
}

type Act = (label: string, fn: () => Promise<unknown>, success?: string) => Promise<void>;

function Overview({
  products,
  windowDays,
  onOpen,
  act,
  busy,
  settings,
}: {
  products: ProductSummary[];
  windowDays: number;
  onOpen: (id: number) => void;
  act: Act;
  busy: string | null;
  settings: Settings | null;
}) {
  const [name, setName] = useState('');
  const totalUsers = products.reduce((a, p) => a + (p.total.users.now ?? 0), 0);
  const totalDelta = products.some((p) => p.total.users.delta !== null)
    ? products.reduce((a, p) => a + (p.total.users.delta ?? 0), 0)
    : null;
  const totalThen = products.reduce((a, p) => a + (p.total.users.then ?? 0), 0);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    let id = 0;
    await act('create', async () => {
      id = (await api.createProduct(name.trim())).id;
    });
    setName('');
    if (id) onOpen(id);
  };

  return (
    <>
      {products.length > 1 && (
        <section className="tiles">
          <Tile label="Users across all extensions" value={fmtNum(totalUsers)} change={{ now: totalUsers, then: totalThen, delta: totalDelta, pct: totalDelta !== null && totalThen ? (totalDelta / totalThen) * 100 : null }} windowDays={windowDays} />
        </section>
      )}

      <section className="card-list">
        {products.map((p) => (
          <button key={p.id} className="product-card" onClick={() => onOpen(p.id)}>
            <div className="product-card-head">
              <h2>{p.name}</h2>
              <div className="store-dots">
                {p.listings.map((l) => (
                  <StoreTag key={l.id} store={l.store} error={!!l.lastError} />
                ))}
              </div>
            </div>
            {p.listings.length === 0 ? (
              <p className="muted">No store listings yet. Open it to add one.</p>
            ) : (
              <div className="mini-stats">
                <MiniStat label="Users" value={fmtNum(p.total.users.now)} change={p.total.users} />
                <MiniStat label="Rating" value={fmtRating(p.total.rating.now)} change={p.total.rating} digits={2} noPct />
                <MiniStat label="Ratings" value={fmtNum(p.total.ratingCount.now)} change={p.total.ratingCount} noPct />
              </div>
            )}
          </button>
        ))}
      </section>

      <form className="inline-form" onSubmit={create}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Extension name, e.g. Tab Tidy"
          aria-label="New extension name"
        />
        <button type="submit" className="primary" disabled={!!busy || !name.trim()}>
          Add extension
        </button>
      </form>

      <DigestPanel settings={settings} act={act} busy={busy} />
    </>
  );
}

function DigestPanel({ settings, act, busy }: { settings: Settings | null; act: Act; busy: string | null }) {
  if (!settings) return null;
  return (
    <section className="panel">
      <h3>Weekly email digest</h3>
      {settings.emailConfigured ? (
        <p className="muted">
          Sends to {settings.digestTo.join(', ')} on schedule <code>{settings.digestCron}</code> ({settings.timezone}).
          {settings.lastDigest && <> Last sent {new Date(settings.lastDigest.sent_at).toLocaleString()}.</>}
        </p>
      ) : (
        <p className="muted">
          Set <code>SMTP_URL</code> and <code>DIGEST_TO</code> in your <code>.env</code> to turn on the weekly email.
        </p>
      )}
      <div className="row">
        <a className="button" href="/api/digest/preview" target="_blank" rel="noreferrer">
          Preview email
        </a>
        <button
          disabled={!settings.emailConfigured || !!busy}
          onClick={() => act('digest', api.sendDigest, `Digest sent to ${settings.digestTo.join(', ')}.`)}
        >
          {busy === 'digest' ? 'Sending…' : 'Send now'}
        </button>
      </div>
    </section>
  );
}

function ProductDetail({
  product,
  windowDays,
  busy,
  onBack,
  act,
  onDeleted,
}: {
  product: ProductSummary;
  windowDays: number;
  busy: string | null;
  onBack: () => void;
  act: Act;
  onDeleted: () => void;
}) {
  const [metric, setMetric] = useState<Metric>('users');
  const [view, setView] = useState<View>('total');
  const [days, setDays] = useState(90);
  const [series, setSeries] = useState<Series | null>(null);
  const [store, setStore] = useState<Store>('chrome');
  const [storeId, setStoreId] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(product.name);

  const listingsKey = product.listings.map((l) => `${l.id}:${l.lastFetchedAt}`).join(',');
  useEffect(() => {
    api.series(product.id, days).then(setSeries, () => setSeries(null));
  }, [product.id, days, listingsKey]);

  const addListing = async (e: FormEvent) => {
    e.preventDefault();
    await act('add-listing', () => api.addListing(product.id, store, storeId), `Now tracking ${STORE_LABELS[store]}.`);
    setStoreId('');
  };

  return (
    <>
      <div className="detail-head">
        <button className="link" onClick={onBack}>← All extensions</button>
        {renaming ? (
          <form
            className="inline-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await act('rename', () => api.renameProduct(product.id, name));
              setRenaming(false);
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label="Extension name" />
            <button type="submit" className="primary">Save</button>
            <button type="button" onClick={() => setRenaming(false)}>Cancel</button>
          </form>
        ) : (
          <div className="title-row">
            <h1>{product.name}</h1>
            <button className="link" onClick={() => setRenaming(true)}>Rename</button>
          </div>
        )}
      </div>

      <section className="tiles">
        <Tile label="Users, all browsers" value={fmtNum(product.total.users.now)} change={product.total.users} windowDays={windowDays} />
        <Tile label="Average rating" value={fmtRating(product.total.rating.now)} change={product.total.rating} windowDays={windowDays} digits={2} noPct />
        <Tile label="Ratings" value={fmtNum(product.total.ratingCount.now)} change={product.total.ratingCount} windowDays={windowDays} noPct />
      </section>

      <section className="panel">
        <div className="chart-controls">
          <Segmented
            value={metric}
            onChange={setMetric}
            ariaLabel="Metric"
            options={[
              { value: 'users', label: 'Users' },
              { value: 'rating', label: 'Rating' },
              { value: 'ratingCount', label: 'Ratings' },
            ]}
          />
          <Segmented
            value={view}
            onChange={setView}
            ariaLabel="Breakdown"
            options={[
              { value: 'total', label: 'Combined' },
              { value: 'browser', label: 'By browser' },
            ]}
          />
          <Segmented
            value={days}
            onChange={setDays}
            ariaLabel="Chart range"
            options={[
              { value: 30, label: '30d' },
              { value: 90, label: '90d' },
              { value: 365, label: '1y' },
            ]}
          />
        </div>
        {series ? <StatsChart series={series} metric={metric} view={view} /> : <div className="chart-empty">Loading…</div>}
      </section>

      <section className="panel">
        <h3>By browser</h3>
        {product.listings.length === 0 ? (
          <p className="muted">Add a store listing below to start tracking.</p>
        ) : (
          <div className="table-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Store</th>
                  <th className="num">Users</th>
                  <th className="num">Rating</th>
                  <th className="num">Ratings</th>
                  <th>Version</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {product.listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="store-cell">
                        <StoreTag store={l.store} error={!!l.lastError} />
                        <div>
                          {l.url ? <a href={l.url} target="_blank" rel="noreferrer">{l.name ?? l.storeId}</a> : (l.name ?? l.storeId)}
                          {l.lastError && <div className="error-text">Last fetch failed: {l.lastError}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      {l.store === 'safari' ? <span className="muted" title="Apple doesn't publish install counts">n/a</span> : fmtNum(l.users.now)}
                      {l.store !== 'safari' && <DeltaText change={l.users} />}
                    </td>
                    <td className="num">
                      {fmtRating(l.rating.now)}
                      <DeltaText change={l.rating} digits={2} noPct />
                    </td>
                    <td className="num">
                      {fmtNum(l.ratingCount.now)}
                      <DeltaText change={l.ratingCount} noPct />
                    </td>
                    <td>
                      {l.current?.version ?? '—'}
                      {l.newVersions.length > 0 && <span className="pill">new</span>}
                    </td>
                    <td className="num">
                      <button
                        className="link danger"
                        disabled={!!busy}
                        onClick={() => confirm(`Stop tracking ${STORE_LABELS[l.store]}? Its history will be deleted.`) && act('remove', () => api.deleteListing(l.id))}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form className="inline-form add-listing" onSubmit={addListing}>
          <select value={store} onChange={(e) => setStore(e.target.value as Store)} aria-label="Store">
            {STORES.map((s) => (
              <option key={s} value={s}>{STORE_LABELS[s]}</option>
            ))}
          </select>
          <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder={STORE_HINTS[store]} aria-label="Store ID or URL" />
          <button type="submit" className="primary" disabled={!!busy || !storeId.trim()}>
            {busy === 'add-listing' ? 'Checking…' : 'Add listing'}
          </button>
        </form>
      </section>

      <div className="danger-zone">
        <button
          className="link danger"
          onClick={() =>
            confirm(`Delete ${product.name} and all its history?`) &&
            act('delete', () => api.deleteProduct(product.id)).then(onDeleted)
          }
        >
          Delete this extension
        </button>
      </div>
    </>
  );
}

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StoreTag({ store, error }: { store: Store; error?: boolean }) {
  return (
    <span className={`store-tag ${error ? 'has-error' : ''}`} title={error ? `${STORE_LABELS[store]}: last fetch failed` : STORE_LABELS[store]}>
      <span className="dot" style={{ background: `var(--${store})` }} />
      {STORE_LABELS[store]}
      {error && ' ⚠'}
    </span>
  );
}

function DeltaText({ change, digits = 0, noPct }: { change: Change; digits?: number; noPct?: boolean }) {
  if (change.delta === null) return null;
  const shown = Number(change.delta.toFixed(digits));
  const dir = shown > 0 ? 'up' : shown < 0 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  return (
    <div className={`delta ${dir}`}>
      {arrow} {fmtDelta(change.delta, digits)}
      {!noPct && change.pct !== null && ` (${fmtPct(change.pct)})`}
    </div>
  );
}

function MiniStat({ label, value, change, digits, noPct }: { label: string; value: string; change: Change; digits?: number; noPct?: boolean }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mini-value">{value}</div>
      <DeltaText change={change} digits={digits} noPct={noPct} />
    </div>
  );
}

function Tile({
  label,
  value,
  change,
  windowDays,
  digits,
  noPct,
}: {
  label: string;
  value: ReactNode;
  change: Change;
  windowDays: number;
  digits?: number;
  noPct?: boolean;
}) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="tile-value">{value}</div>
      {change.delta !== null ? (
        <div className="tile-foot">
          <DeltaText change={change} digits={digits} noPct={noPct} />
          <span className="muted">vs {windowDays} days ago</span>
        </div>
      ) : (
        <div className="tile-foot muted">Not enough history for a {windowDays}-day comparison yet</div>
      )}
    </div>
  );
}
