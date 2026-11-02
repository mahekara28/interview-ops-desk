import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveAdapters, normalizeInterview } from '../server/adapters.js';
const row = {
  id: 1,
  application_id: 2,
  job_id: 3,
  job_interview_id: 4,
  starts_at: '2026-11-04T19:00:00Z',
  ends_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-03T19:00:00Z',
  external_event_id: 'event-1',
  video_conferencing_url: 'https://meet.example.com/1',
  status: 'scheduled',
};
const event = {
  id: 'event-1',
  start: { dateTime: row.starts_at },
  end: { dateTime: row.ends_at },
  hangoutLink: row.video_conferencing_url,
  attendees: [{ email: 'interviewer@example.com', responseStatus: 'declined' }],
};
const json = (data: unknown, init?: ResponseInit) => new Response(JSON.stringify(data), init);
test('normalizes documented Harvest v3 and Calendar schemas without inventing communication evidence', () => {
  const i = normalizeInterview(row, event)!;
  assert.equal(i.id, 'gh-1');
  assert.equal(i.candidate, 'Application #2');
  assert.equal(i.notice, null);
  assert.deepEqual(i.calendar!.declined, ['interviewer@example.com']);
  assert.equal(normalizeInterview({ ...row, starts_at: null, ends_at: null }), null);
  assert.equal(normalizeInterview({ ...row, status: 'complete' }), null);
  assert.equal(normalizeInterview(row)!.calendar, null);
  assert.throws(() => normalizeInterview(row, { ...event, id: 'wrong' }), /does not match/);
});
test('OAuth token, bounded pagination and exact calendar lookup use separate credentials', async () => {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: (init?.headers as Record<string, string>)?.Authorization });
    if (url.includes('auth.greenhouse')) {
      assert.match(String(init?.body), /grant_type=client_credentials/);
      return json({ access_token: 'fixture-gh-token', expires_in: 3600 });
    }
    if (url.includes('googleapis')) return json(event);
    if (url.includes('cursor=')) return json([]);
    return json([row], {
      headers: { Link: '<https://harvest.greenhouse.io/v3/interviews?cursor=second>; rel="next"' },
    });
  }) as typeof fetch;
  const adapter = new LiveAdapters(
    { clientId: 'fixture', clientSecret: 'fixture', googleToken: 'fixture-calendar' },
    fake,
  );
  const result = await adapter.sync();
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].calendar!.eventId, 'event-1');
  assert.equal(calls.find((c) => c.url.includes('googleapis'))!.auth, 'Bearer fixture-calendar');
  assert.ok(calls.some((c) => c.url.includes('starts_at%5Bgte%5D')));
  assert.ok(calls.find((c) => c.url.includes('cursor='))!.url.endsWith('?cursor=second'));
});
test('unsafe pagination is rejected before credentials could leave Greenhouse', async () => {
  const calls: string[] = [];
  const fake = (async (input: string | URL | Request) => {
    calls.push(String(input));
    if (String(input).includes('auth.greenhouse'))
      return json({ access_token: 'fixture', expires_in: 3600 });
    return json([], { headers: { Link: '<https://attacker.example/interviews>; rel="next"' } });
  }) as typeof fetch;
  await assert.rejects(
    new LiveAdapters({ clientId: 'fixture', clientSecret: 'fixture' }, fake).fetchInterviews(),
    /unsafe pagination/,
  );
  assert.equal(calls.length, 2);
});
test('expired token is refreshed once, rate limit is surfaced', async () => {
  let tokens = 0;
  let calls = 0;
  const fake = (async (input: string | URL | Request) => {
    if (String(input).includes('auth.greenhouse')) {
      tokens++;
      return json({ access_token: `fixture-${tokens}`, expires_in: 3600 });
    }
    calls++;
    return new Response('', { status: calls === 1 ? 401 : 429 });
  }) as typeof fetch;
  await assert.rejects(
    new LiveAdapters({ clientId: 'fixture', clientSecret: 'fixture' }, fake).fetchInterviews(),
    /rate limit/,
  );
  assert.equal(tokens, 2);
  assert.equal(calls, 2);
});
test('bad schema and calendar auth failure do not masquerade as healthy evidence', async () => {
  assert.throws(() => normalizeInterview({ ...row, starts_at: 'tomorrow' }));
  const fake = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('auth.greenhouse')) return json({ access_token: 'fixture', expires_in: 3600 });
    if (url.includes('googleapis')) return new Response('', { status: 401 });
    return json([row]);
  }) as typeof fetch;
  await assert.rejects(
    new LiveAdapters(
      { clientId: 'fixture', clientSecret: 'fixture', googleToken: 'expired' },
      fake,
    ).sync(),
    /Calendar sync failed/,
  );
});
