import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { Store } from './store.js';
import { LiveAdapters } from './adapters.js';
import { adapterConfig, dataPath, providerKind, httpProviderConfig } from './config.js';
import { HttpSnapshotProvider } from './http-provider.js';
const store = new Store(dataPath);
const app = createApp(
  store,
  providerKind === 'json-http'
    ? new HttpSnapshotProvider(httpProviderConfig)
    : new LiveAdapters(adapterConfig),
);
if (process.argv.includes('--dev')) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
} else {
  if (!existsSync('dist/index.html')) {
    console.error('Run npm run build first.');
    process.exit(1);
  }
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    next();
  });
  app.use(express.static(resolve('dist')));
  app.get('/{*path}', (_req, res) => {
    res.sendFile(resolve('dist/index.html'));
  });
}
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
const server = app.listen(port, '127.0.0.1', () =>
  console.log(`Interview Ops Desk is ready: http://127.0.0.1:${port}`),
);
server.on('error', (error) => {
  console.error(error.message);
  store.close();
  process.exit(1);
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
