import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Store } from '../server/store.js';
import { parseSnapshot, normalizeSnapshot, snapshotJsonSchema } from '../server/contracts.js';
import { sampleSnapshot } from '../server/sample-snapshot.js';
import { HttpSnapshotProvider } from '../server/http-provider.js';
import { candidateBrief, candidateChanges, coordinationGaps } from '../server/workflows.js';
import { createApp } from '../server/app.js';
import { LiveAdapters } from '../server/adapters.js';
const now = Date.parse('2026-11-03T12:00:00Z');

test('published schema and sample agree; invalid semantic evidence fails before import', () => {
  assert.deepEqual(
    JSON.parse(readFileSync('examples/snapshot.schema.json', 'utf8')),
    snapshotJsonSchema,
  );
  assert.equal(
    parseSnapshot(JSON.parse(readFileSync('examples/recruiting-snapshot.json', 'utf8'))).interviews
      .length,
    6,
  );
  for (const mutate of [
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews.push(data.interviews[0]);
    },
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews[1].applicationId = data.interviews[0].applicationId;
    },
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews[0].candidate.timezone = 'Mars/Olympus';
    },
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews[0].ats.end = data.interviews[0].ats.start;
    },
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews[0].calendar!.eventId = 'wrong';
    },
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews[0].recordUrl = 'javascript:alert(1)';
    },
    (data: ReturnType<typeof sampleSnapshot>) => {
      data.interviews[0].ats.updatedAt = '2027-01-01T00:00:00Z';
    },
  ]) {
    const data = sampleSnapshot(now);
    mutate(data);
    assert.throws(() => parseSnapshot(data));
  }
  assert.throws(() =>
    parseSnapshot({ ...sampleSnapshot(now), credential: 'do-not-accept-secrets' }),
  );
});

test('reviewed imports are isolated, stale previews rejected, unchanged records keep proposals', () => {
  const store = new Store(':memory:');
  try {
    const sample = sampleSnapshot(now);
    store.importSnapshot(sample, 0);
    const record = store.records('imported').find((row) => row.applicationId === 'application-1')!;
    assert.equal(record.source.kind, 'synthetic');
    const draft = store.prepare(record.id, 1, 'warm', 'mcp');
    assert.throws(() => store.deliver(draft.id, 1, draft.body, false), /delivery is not enabled/);
    assert.throws(() => store.importSnapshot(sample, 0), /changed after preview/);
    store.importSnapshot(sample, 1);
    assert.equal(store.get(record.id).revision, 1);
    assert.equal(store.latestProposal(record.id)!.id, draft.id);
    assert.equal(store.records('demo').length, 6);
    assert.equal(store.records('live').length, 0);
    store.resetDemo();
    assert.equal(store.records('imported').length, 6);
    const older = sampleSnapshot(now - 1000);
    assert.throws(() => store.importSnapshot(older, 2), /older than/);
    assert.equal(store.meta('importVersion'), '2');
  } finally {
    store.close();
  }
});

test('changes are field-level; candidate context invalidates drafts; names never merge applications', () => {
  const store = new Store(':memory:');
  try {
    const sample = sampleSnapshot(now);
    sample.interviews[1].candidate.name = sample.interviews[0].candidate.name;
    store.importSnapshot(sample, 0);
    const brief = candidateBrief(store, 'imported', 'application-1');
    assert.equal(brief.interviews.length, 1);
    assert.equal(brief.interviews[0].source.provider, 'sample-ats');
    const id = brief.interviews[0].interviewId;
    store.prepare(id, 1, 'warm', 'mcp');
    sample.capturedAt = new Date(now + 1000).toISOString();
    sample.interviews[0].role = 'Updated role';
    store.importSnapshot(sample, 1);
    assert.equal(store.get(id).revision, 2);
    assert.throws(() => store.prepare(id, 1, 'warm', 'mcp'), /interview changed/);
    const changes = candidateChanges(store, 'imported', 'application-1', '2000-01-01T00:00:00Z');
    assert.deepEqual(changes.changes[0].changes, [
      { field: 'role', before: 'Platform Engineer', after: 'Updated role' },
    ]);
    assert.throws(() => candidateBrief(store, 'live', 'application-1'), /not found/);
    assert.equal(coordinationGaps(store, 'imported').cases.length, 4);
    assert.equal(
      coordinationGaps(
        store,
        'imported',
        sample.interviews[0].ats.start,
        sample.interviews[1].ats.start,
      ).examined,
      1,
    );
    assert.throws(
      () => coordinationGaps(store, 'imported', '2026-11-04T00:00:00Z', '2026-11-03T00:00:00Z'),
      /end of the window/,
    );
  } finally {
    store.close();
  }
});

test('older record rejects whole import; empty complete snapshot clears imported records only', () => {
  const store = new Store(':memory:');
  try {
    const sample = sampleSnapshot(now);
    store.importSnapshot(sample, 0);
    const changed = structuredClone(sample);
    changed.interviews[0].role = 'Must roll back';
    changed.interviews[1].ats.updatedAt = '2000-01-01T00:00:00Z';
    assert.throws(() => store.importSnapshot(changed, 1), /older evidence/);
    assert.equal(
      candidateBrief(store, 'imported', 'application-1').interviews[0].role,
      'Platform Engineer',
    );
    assert.equal(store.meta('importVersion'), '1');
    assert.equal(
      candidateChanges(store, 'imported', 'application-1', '2000-01-01T00:00:00Z').changes.length,
      0,
    );
    store.importSnapshot({ ...sample, interviews: [] }, 1);
    assert.equal(store.records('imported').length, 0);
    assert.equal(store.records('demo').length, 6);
  } finally {
    store.close();
  }
});

test('legacy databases migrate provider fields without losing drafts or resetting revisions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ops-migration-'));
  const path = join(dir, 'desk.sqlite');
  let store = new Store(path);
  try {
    const proposal = store.prepare('demo-1', 1, 'warm', 'dashboard');
    const row = store.get('demo-1');
    const {
      ats,
      source: _source,
      applicationId: _applicationId,
      candidateId: _candidateId,
      ...legacy
    } = row;
    store.db
      .prepare('UPDATE interviews SET data=? WHERE id=?')
      .run(JSON.stringify({ ...legacy, greenhouse: ats }), row.id);
    store.close();
    store = new Store(path);
    assert.equal(store.get(row.id).applicationId, 'application-1');
    assert.deepEqual(store.get(row.id).ats, ats);
    assert.equal(store.latestProposal(row.id)!.id, proposal.id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

const listen = async (server: Server) => {
  server.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};
const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

test('real HTTP provider syncs through the dashboard API and preserves synthetic provenance', async () => {
  const store = new Store(':memory:');
  let authorization: string | undefined;
  const source = createServer((req, res) => {
    authorization = req.headers.authorization;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(sampleSnapshot(now)));
  });
  const providerUrl = await listen(source);
  const provider = new HttpSnapshotProvider({ providerUrl, providerToken: 'fixture-only' });
  const app = createServer(createApp(store, provider));
  const base = await listen(app);
  try {
    const result = await fetch(`${base}/api/sync`, {
      method: 'POST',
      headers: { 'X-Ops-Request': 'dashboard' },
    });
    assert.equal(result.status, 200);
    assert.equal(authorization, 'Bearer fixture-only');
    assert.equal(store.records('live').length, 6);
    assert.equal(store.records('live')[0].source.kind, 'synthetic');
    assert.match(store.records('live')[0].id, /^api-/);
    const state = await (await fetch(`${base}/api/state?mode=live`)).text();
    assert.ok(!state.includes('fixture-only'));
    assert.equal(store.records('imported').length, 0);
  } finally {
    await close(app);
    await close(source);
    store.close();
  }
});

test('custom provider rejects insecure remote URLs, redirects and oversized responses', async () => {
  let calls = 0;
  const fake = (async () => {
    calls++;
    return new Response('x'.repeat(256 * 1024 + 1));
  }) as typeof fetch;
  await assert.rejects(
    () =>
      new HttpSnapshotProvider({ providerUrl: 'http://untrusted.example/snapshot' }, fake).sync(),
    /HTTPS/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    () =>
      new HttpSnapshotProvider({ providerUrl: 'https://provider.example/snapshot' }, fake).sync(),
    /256 KB/,
  );
  const redirect = (async (_url, init) => {
    assert.equal(init?.redirect, 'error');
    throw new Error('redirect');
  }) as typeof fetch;
  await assert.rejects(
    () =>
      new HttpSnapshotProvider(
        { providerUrl: 'https://provider.example/snapshot' },
        redirect,
      ).sync(),
    /could not be reached/,
  );
});

test('preview is non-mutating; import requires current preview version and returns source errors', async () => {
  const store = new Store(':memory:');
  const server = createServer(createApp(store, new LiveAdapters({})));
  const base = await listen(server);
  const post = (path: string, body: unknown) =>
    fetch(`${base}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ops-Request': 'dashboard' },
      body: JSON.stringify(body),
    });
  try {
    const snapshot = sampleSnapshot(now);
    const response = await post('/template/preview', snapshot);
    assert.equal(response.status, 200);
    const preview = await response.json();
    assert.equal(store.records('imported').length, 0);
    assert.equal(
      (await post('/template/import', { snapshot, expectedVersion: preview.version })).status,
      200,
    );
    assert.equal(
      (await post('/template/import', { snapshot, expectedVersion: preview.version })).status,
      409,
    );
    snapshot.interviews[0].candidate.timezone = 'Invalid/Zone';
    const invalid = await post('/template/preview', snapshot);
    assert.equal(invalid.status, 400);
    assert.match(JSON.stringify(await invalid.json()), /time zone/);
    const brief = await (
      await fetch(`${base}/api/brief?workspace=imported&applicationId=application-1`)
    ).json();
    assert.equal(brief.candidate.name, 'Maya Chen');
  } finally {
    await close(server);
    store.close();
  }
});
