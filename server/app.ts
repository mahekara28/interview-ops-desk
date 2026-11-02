import express from 'express';
import { z } from 'zod';
import type { Connection, Mode } from '../src/shared.js';
import { Store } from './store.js';
import { DeskError } from './engine.js';
import { resolve } from 'node:path';
import {
  parseSnapshot,
  normalizeSnapshot,
  snapshotJsonSchema,
  type RecruitingProvider,
} from './contracts.js';
import { sampleSnapshot } from './sample-snapshot.js';
import { inspect } from './engine.js';
import { candidateBrief, coordinationGaps } from './workflows.js';

const revision = z.number().int().positive();
export function createApp(store: Store, adapters: RecruitingProvider) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host ?? '';
    if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))
      return res.status(403).json({ error: 'Local host required.' });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${host}`)
      return res.status(403).json({ error: 'Cross-origin access is not allowed.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      if (req.method !== 'GET' && req.headers['x-ops-request'] !== 'dashboard')
        return res.status(403).json({ error: 'Dashboard request header required.' });
    }
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const workspaceSchema = z.enum(['demo', 'imported', 'live']);
  app.get('/api/template/schema', (_req, res) => res.json(snapshotJsonSchema));
  app.get('/api/template/example', (_req, res) => {
    res.setHeader('Content-Disposition', 'attachment; filename="recruiting-snapshot.json"');
    res.json(sampleSnapshot());
  });
  app.post('/api/template/preview', (req, res) => {
    const snapshot = parseSnapshot(req.body);
    res.json({
      workspace: snapshot.workspace,
      capturedAt: snapshot.capturedAt,
      version: Number(store.meta('importVersion') ?? 0),
      replaces: store.records('imported').length,
      records: normalizeSnapshot(snapshot).map((record) => ({
        id: record.id,
        candidate: record.candidate,
        applicationId: record.applicationId,
        role: record.role,
        findings: inspect(record).length,
      })),
    });
  });
  app.post('/api/template/import', (req, res) => {
    const input = z
      .strictObject({ snapshot: z.unknown(), expectedVersion: z.number().int().nonnegative() })
      .parse(req.body);
    res.json(store.importSnapshot(input.snapshot, input.expectedVersion));
  });
  app.get('/api/brief', (req, res) => {
    res.json(
      candidateBrief(
        store,
        workspaceSchema.parse(req.query.workspace ?? 'demo'),
        z.string().min(1).parse(req.query.applicationId),
      ),
    );
  });
  app.get('/api/gaps', (req, res) => {
    res.json(coordinationGaps(store, workspaceSchema.parse(req.query.workspace ?? 'demo')));
  });
  app.get('/api/mcp-config', (_req, res) => {
    res.json({
      mcpServers: {
        'interview-ops-desk': {
          command: process.execPath,
          args: ['--import', resolve('node_modules/tsx/dist/loader.mjs'), resolve('server/mcp.ts')],
          env: { OPS_DATA_DIR: resolve(process.env.OPS_DATA_DIR ?? '.data') },
        },
      },
    });
  });
  app.get('/api/provider', (_req, res) =>
    res.json({ ...adapters.descriptor, connections: adapters.connections }),
  );
  app.get('/api/state', (req, res) => {
    const mode: Mode = workspaceSchema.parse(req.query.mode ?? 'demo');
    const sources: readonly Connection[] =
      mode === 'demo'
        ? [
            {
              id: 'snapshot',
              title: 'Sample ATS',
              status: 'demo',
              detail: 'Fictional interview records',
            },
            {
              id: 'calendar',
              title: 'Sample calendar',
              status: 'demo',
              detail: 'Fictional calendar evidence',
            },
          ]
        : mode === 'imported'
          ? [
              {
                id: 'snapshot',
                title: 'JSON snapshot',
                status: store.records('imported').length ? 'ready' : 'unconfigured',
                detail: store.meta('importLabel') ?? 'Preview a file in the template workbench',
              },
              {
                id: 'calendar',
                title: 'Calendar evidence',
                status: 'unconfigured',
                detail: 'Imported snapshot · no ongoing calendar connection',
              },
            ]
          : adapters.connections;
    const connections: Connection[] = [
      ...sources,
      {
        id: 'outbox',
        title: 'Candidate updates',
        status: mode === 'demo' ? 'demo' : 'unconfigured',
        detail:
          mode === 'demo'
            ? 'Local outbox · no external email'
            : 'Draft export only · no email connector',
      },
      {
        id: 'mcp',
        title: 'MCP tools',
        status: 'ready',
        detail: 'Local stdio · inspect and propose',
      },
    ];
    res.json({
      mode,
      records: store.records(mode),
      activity: store.activity(mode),
      proposals: store.proposals(mode),
      connections,
      sync: {
        at: store.meta('syncAt'),
        error: store.meta('syncError') || null,
        skipped: Number(store.meta('syncSkipped') ?? 0),
      },
    });
  });
  app.post('/api/demo/reset', (_req, res) => {
    store.resetDemo();
    res.json({ ok: true });
  });
  app.post('/api/demo/event', (req, res) => {
    const data = z
      .object({
        id: z.string(),
        revision,
        kind: z.enum(['shift', 'repair']),
        eventId: z.string().min(1).max(100),
      })
      .parse(req.body);
    res.json(store.demoEvent(data.id, data.revision, data.kind, data.eventId));
  });
  app.post('/api/interviews/:id/prepare', (req, res) => {
    const body = z
      .object({ revision, tone: z.enum(['warm', 'concise']).default('warm') })
      .parse(req.body);
    res.json(store.prepare(String(req.params.id), body.revision, body.tone, 'dashboard'));
  });
  app.post('/api/proposals/:id/approve', (req, res) => {
    const body = z
      .object({ revision, body: z.string().max(6000), simulateFailure: z.boolean().default(false) })
      .parse(req.body);
    res.json(store.deliver(String(req.params.id), body.revision, body.body, body.simulateFailure));
  });
  app.post('/api/proposals/:id/retry', (req, res) => {
    const body = z.object({ revision }).parse(req.body);
    res.json(store.deliver(String(req.params.id), body.revision, undefined, false, true));
  });
  let syncing = false;
  app.post('/api/sync', async (_req, res) => {
    if (syncing) throw new DeskError(409, 'A sync is already running.');
    syncing = true;
    try {
      const result = await adapters.sync();
      store.importLive(result.records, result.skipped);
      res.json({ count: result.records.length, skipped: result.skipped });
    } catch (error) {
      const safe =
        error instanceof DeskError
          ? error
          : new DeskError(
              502,
              'The source response did not match the expected schema. Previous evidence has been retained.',
            );
      store.setMeta('syncError', safe.message);
      throw safe;
    } finally {
      syncing = false;
    }
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });
  const errors: express.ErrorRequestHandler = (error, _req, res, _next) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid request or source data.',
        fields: error.issues.map((i) => i.path.join('.')),
        issues: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.code === 'custom' ? i.message : 'Missing, invalid, or unsupported value.',
        })),
      });
      return;
    }
    if (error instanceof DeskError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'Invalid JSON.' });
      return;
    }
    res.status(500).json({
      error: 'The operation could not be completed. Your previous state has been retained.',
    });
  };
  app.use(errors);
  return app;
}
