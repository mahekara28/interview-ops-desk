import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.js';
import { inspect, makeDraft } from '../server/engine.js';
import { fixtures } from '../server/fixtures.js';

test('finds stale confirmation, declined participant, missing meeting and unknown confirmation', () => {
  const [maya, arjun, sofia, theo, ella] = fixtures();
  assert.deepEqual(
    inspect(maya).map((i) => i.code),
    ['notice_stale'],
  );
  assert.equal(inspect(arjun)[0].blocking, true);
  assert.equal(inspect(sofia)[0].code, 'meeting_missing');
  assert.deepEqual(inspect(theo), []);
  assert.match(inspect(ella)[0].detail, /does not mean no email was sent/);
});
test('equivalent UTC offsets do not produce a false mismatch', () => {
  const i = fixtures()[3];
  i.greenhouse.start = i.calendar!.start = '2026-11-03T19:00:00Z';
  i.notice!.start = '2026-11-03T14:00:00-05:00';
  assert.deepEqual(inspect(i), []);
});
test('missing, conflicting and cancelled source evidence blocks a draft', () => {
  const i = fixtures()[0];
  i.calendar!.start = '2026-11-03T19:00:00Z';
  assert.throws(() => makeDraft(i, 'warm'), /source evidence/);
  i.calendar!.cancelled = true;
  assert.equal(inspect(i)[0].code, 'cancelled');
  i.calendar = null;
  assert.equal(inspect(i)[0].code, 'calendar_unknown');
});
test('candidate draft follows named-zone DST, not a fixed UTC offset', () => {
  const i = fixtures()[0];
  i.greenhouse.start = i.calendar!.start = '2026-07-10T18:00:00Z';
  i.greenhouse.end = i.calendar!.end = '2026-07-10T18:45:00Z';
  assert.match(makeDraft(i, 'warm').body, /2:00 PM EDT/);
  i.greenhouse.start = i.calendar!.start = '2026-11-10T18:00:00Z';
  i.greenhouse.end = i.calendar!.end = '2026-11-10T18:45:00Z';
  assert.match(makeDraft(i, 'warm').body, /1:00 PM EST/);
});
test('failure retains outstanding issue; retry records exactly one receipt', () => {
  const s = new Store(':memory:');
  try {
    const p = s.prepare('demo-1', 1, 'warm', 'dashboard');
    const failed = s.deliver(p.id, 1, p.body, true);
    assert.equal(failed.status, 'failed');
    assert.equal(s.get('demo-1').revision, 1);
    assert.equal(inspect(s.get('demo-1'))[0].code, 'notice_stale');
    const success = s.deliver(p.id, 1, undefined, false, true);
    assert.equal(success.status, 'delivered');
    assert.equal(success.attempts, 2);
    assert.equal(s.deliver(p.id, 1, undefined, false, true).receiptId, success.receiptId);
    assert.equal(s.activity('demo').filter((a) => a.kind === 'receipt').length, 1);
    assert.deepEqual(inspect(s.get('demo-1')), []);
  } finally {
    s.close();
  }
});
test('changed schedule invalidates both draft approval and a failed-message retry', () => {
  const s = new Store(':memory:');
  try {
    const p = s.prepare('demo-1', 1, 'warm', 'dashboard');
    s.deliver(p.id, 1, p.body, true);
    s.demoEvent('demo-1', 1, 'shift', 'unique-change');
    assert.throws(() => s.deliver(p.id, 1, p.body, false), /interview changed/);
    assert.throws(() => s.deliver(p.id, 2, undefined, false, true), /older revision/);
    assert.equal(s.proposal(p.id).status, 'failed');
  } finally {
    s.close();
  }
});
test('source event replay and repeated proposal requests are idempotent', () => {
  const s = new Store(':memory:');
  try {
    const first = s.demoEvent('demo-1', 1, 'shift', 'evt-42');
    assert.equal(first.duplicate, false);
    const replay = s.demoEvent('demo-1', 1, 'shift', 'evt-42');
    assert.equal(replay.duplicate, true);
    assert.equal(replay.interview.revision, 2);
    assert.equal(
      s.prepare('demo-1', 2, 'warm', 'mcp').id,
      s.prepare('demo-1', 2, 'warm', 'dashboard').id,
    );
  } finally {
    s.close();
  }
});
test('coordinator may edit wording but cannot remove verified schedule fields', () => {
  const s = new Store(':memory:');
  try {
    const p = s.prepare('demo-1', 1, 'warm', 'dashboard');
    assert.throws(
      () => s.deliver(p.id, 1, 'Your interview is now at 8pm. Please join us then.', false),
      /Keep the verified/,
    );
    assert.equal(s.proposal(p.id).status, 'draft');
    assert.equal(
      s.deliver(
        p.id,
        1,
        p.body.replace('Thank you for your flexibility.', 'Thank you for making time for us.'),
        false,
      ).status,
      'delivered',
    );
  } finally {
    s.close();
  }
});
test('live records never receive demo delivery and resetting demo preserves live state', () => {
  const s = new Store(':memory:');
  try {
    const live = { ...fixtures()[0], id: 'gh-1', mode: 'live' as const };
    s.importLive([live], 0);
    const p = s.prepare('gh-1', 1, 'warm', 'mcp');
    assert.throws(() => s.deliver(p.id, 1, p.body, false), /Live delivery is not enabled/);
    assert.throws(() => s.demoEvent('gh-1', 1, 'shift', 'fake'), /fictional/);
    s.resetDemo();
    assert.equal(s.records('live').length, 1);
    assert.equal(s.proposals('live').length, 1);
  } finally {
    s.close();
  }
});
test('an out-of-order live snapshot is rejected atomically', () => {
  const s = new Store(':memory:');
  try {
    const live = { ...fixtures()[0], id: 'gh-1', mode: 'live' as const };
    s.importLive([live], 0);
    const old = structuredClone(live);
    old.greenhouse.updatedAt = '2020-01-01T00:00:00Z';
    assert.throws(() => s.importLive([old], 0), /older evidence/);
    assert.equal(s.get('gh-1').greenhouse.updatedAt, live.greenhouse.updatedAt);
    assert.equal(s.get('gh-1').revision, 1);
  } finally {
    s.close();
  }
});
