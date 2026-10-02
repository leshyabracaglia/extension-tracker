import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fmtNum, fmtRating } from '../../server/format.ts';
import { STORE_LABELS, STORES, type Series, type Store } from './api.ts';

export type Metric = 'users' | 'rating' | 'ratingCount';
export type View = 'total' | 'browser';

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const compact = (n: number) => Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function StatsChart({ series, metric, view }: { series: Series; metric: Metric; view: View }) {
  const fmt = metric === 'rating' ? fmtRating : fmtNum;

  // One series per store: several listings in the same store (e.g. two Chrome variants) are summed.
  const { rows, stores } = useMemo(() => {
    const present = new Set(series.byListing.map((l) => l.store));
    const stores = STORES.filter((s) => present.has(s) && !(metric === 'users' && s === 'safari'));
    const rows = series.days.map((day, i) => {
      const row: Record<string, string | number | null> = { day, total: series.total[metric][i] };
      for (const store of stores) {
        const listings = series.byListing.filter((l) => l.store === store);
        if (metric === 'rating') {
          let w = 0;
          let t = 0;
          for (const l of listings) {
            const r = l.rating[i];
            const c = l.ratingCount[i];
            if (r !== null && c) {
              w += c;
              t += r * c;
            }
          }
          row[store] = w ? t / w : null;
        } else {
          const vals = listings.map((l) => l[metric][i]).filter((v): v is number => v !== null);
          row[store] = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
        }
      }
      return row;
    });
    return { rows, stores };
  }, [series, metric]);

  const hasData = rows.some((r) => r.total !== null);
  if (!hasData) return <div className="chart-empty">No data yet. Snapshots are collected once a day.</div>;

  const common = {
    data: rows,
    margin: { top: 8, right: 8, bottom: 0, left: 0 },
  };
  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis
        dataKey="day"
        tickFormatter={fmtDay}
        tick={{ fill: 'var(--muted)', fontSize: 12 }}
        axisLine={{ stroke: 'var(--axis)' }}
        tickLine={false}
        minTickGap={32}
      />
      <YAxis
        tickFormatter={metric === 'rating' ? (v) => v.toFixed(1) : compact}
        tick={{ fill: 'var(--muted)', fontSize: 12 }}
        axisLine={false}
        tickLine={false}
        width={44}
        domain={metric === 'rating' ? ['auto', 'auto'] : [0, 'auto']}
        allowDecimals={metric === 'rating'}
      />
      <Tooltip
        labelFormatter={(d) => fmtDay(String(d))}
        formatter={(v, name) => [fmt(v as number | null), name === 'total' ? 'All browsers' : STORE_LABELS[name as Store]]}
        contentStyle={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          color: 'var(--text)',
          fontSize: 13,
        }}
        cursor={{ stroke: 'var(--axis)' }}
      />
    </>
  );

  const legend =
    view === 'browser' && stores.length > 1 ? (
      <Legend
        formatter={(v) => <span style={{ color: 'var(--text-2)' }}>{STORE_LABELS[v as Store]}</span>}
        iconType="circle"
        iconSize={8}
      />
    ) : null;

  // Users and rating counts add up across browsers, so stack them; ratings are averages, so draw lines.
  if (view === 'browser' && metric !== 'rating') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart {...common}>
          {axes}
          {legend}
          {stores.map((s) => (
            <Area
              key={s}
              dataKey={s}
              stackId="1"
              type="monotone"
              stroke={`var(--${s})`}
              strokeWidth={2}
              fill={`var(--${s})`}
              fillOpacity={0.25}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart {...common}>
        {axes}
        {legend}
        {view === 'browser' ? (
          stores.map((s) => (
            <Line key={s} dataKey={s} type="monotone" stroke={`var(--${s})`} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
          ))
        ) : (
          <Line dataKey="total" type="monotone" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
