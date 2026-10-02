import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { collectAll, collectListing } from './collect.ts';
import { config } from './config.ts';
import type { DB } from './db.ts';
import { buildDigest, sendDigest } from './digest.ts';
import { productSeries, productSummaries } from './stats.ts';
import { adapters, STORES, type Store } from './stores/index.ts';

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function basicAuth(password: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? '';
    const [, encoded = ''] = header.split(' ');
    const supplied = Buffer.from(encoded, 'base64').toString().split(':').slice(1).join(':');
    if (header.startsWith('Basic ') && supplied === password) return next();
    res.set('WWW-Authenticate', 'Basic realm="Extension Tracker"').status(401).send('Authentication required');
  };
}

export function createApp(db: DB) {
  const app = express();
  app.use(express.json());
  if (config.appPassword) app.use(basicAuth(config.appPassword));

  const productOr404 = (id: string | string[]) => {
    const product = db.getProduct(Number(id));
    if (!product) throw new HttpError(404, 'Product not found');
    return product;
  };

  app.get('/api/summary', (req, res) => {
    const window = Math.min(Math.max(Number(req.query.window) || 7, 1), 365);
    res.json({ window, products: productSummaries(db, window) });
  });

  app.get('/api/products/:id/series', (req, res) => {
    const product = productOr404(req.params.id);
    const days = Math.min(Math.max(Number(req.query.days) || 90, 2), 3650);
    res.json(productSeries(db, product.id, days));
  });

  app.post('/api/products', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Name is required');
    res.status(201).json(db.createProduct(name));
  });

  app.patch('/api/products/:id', (req, res) => {
    const product = productOr404(req.params.id);
    const name = String(req.body?.name ?? '').trim();
    if (!name) throw new HttpError(400, 'Name is required');
    db.renameProduct(product.id, name);
    res.json({ ...product, name });
  });

  app.delete('/api/products/:id', (req, res) => {
    db.deleteProduct(productOr404(req.params.id).id);
    res.status(204).end();
  });

  app.post('/api/products/:id/listings', async (req, res) => {
    const product = productOr404(req.params.id);
    const store = req.body?.store as Store;
    if (!STORES.includes(store)) throw new HttpError(400, `Store must be one of ${STORES.join(', ')}`);
    let storeId: string;
    try {
      storeId = adapters[store].parseId(String(req.body?.storeId ?? ''));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
    if (db.findListing(store, storeId)) throw new HttpError(409, 'That listing is already being tracked');

    const listing = db.createListing(product.id, store, storeId);
    const result = await collectListing(db, listing);
    if (!result.ok) {
      db.deleteListing(listing.id);
      throw new HttpError(422, `Couldn't read that listing: ${result.error}`);
    }
    res.status(201).json(db.getListing(listing.id));
  });

  app.delete('/api/listings/:id', (req, res) => {
    if (!db.getListing(Number(req.params.id))) throw new HttpError(404, 'Listing not found');
    db.deleteListing(Number(req.params.id));
    res.status(204).end();
  });

  app.post('/api/refresh', async (_req, res) => {
    res.json(await collectAll(db));
  });

  app.get('/api/digest/preview', (_req, res) => {
    res.type('html').send(buildDigest(db).html);
  });

  app.post('/api/digest/send', async (_req, res) => {
    try {
      res.json(await sendDigest(db));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });

  app.get('/api/settings', (_req, res) => {
    res.json({
      emailConfigured: Boolean(config.smtpUrl && config.digestTo.length),
      digestTo: config.digestTo,
      digestCron: config.digestCron,
      fetchCron: config.fetchCron,
      timezone: config.timezone,
      lastDigest: db.lastDigest() ?? null,
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const dist = path.resolve('dist');
    app.use(express.static(dist));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  return app;
}
