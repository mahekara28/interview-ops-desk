import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { get } from 'node:http';
import { Store } from '../server/store.js';
import { createApp } from '../server/app.js';
import { LiveAdapters } from '../server/adapters.js';
test('HTTP contract supports the demo and rejects cross-origin mutations', async () => {
  const store = new Store(':memory:');
  const server = createApp(store, new LiveAdapters({})).listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path: string, body: unknown, headers = {}) =>
    fetch(`${base}/api${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ops-Request': 'dashboard', ...headers },
      body: JSON.stringify(body),
    });
  try {
    const state = await (await fetch(`${base}/api/state`)).json();
    assert.equal(state.records.length, 6);
    assert.equal((await post('/demo/reset', {}, { Origin: 'https://example.com' })).status, 403);
    assert.equal((await fetch(`${base}/api/demo/reset`, { method: 'POST' })).status, 403);
    const hostileHost = await new Promise<number | undefined>((resolve, reject) => {
      get(`${base}/api/state`, { headers: { Host: 'attacker.example' } }, (response) => {
        response.resume();
        resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(hostileHost, 403);
    assert.equal((await post('/interviews/demo-1/prepare', { revision: -1 })).status, 400);
    const draft = await (await post('/interviews/demo-1/prepare', { revision: 1 })).json();
    const result = await (
      await post(`/proposals/${draft.id}/approve`, { revision: 1, body: draft.body })
    ).json();
    assert.equal(result.status, 'delivered');
    assert.equal((await post('/sync', {})).status, 409);
    const live = await (await fetch(`${base}/api/state?mode=live`)).json();
    assert.equal(live.records.length, 0);
    assert.equal(store.records('demo').length, 6);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
  }
});
