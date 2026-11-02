import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Interview, Mode, Proposal, Activity, RecordView } from '../src/shared.js';
import { DeskError, inspect, makeDraft } from './engine.js';
import { fixtures } from './fixtures.js';
import { normalizeSnapshot, parseSnapshot } from './contracts.js';

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS interviews (id TEXT PRIMARY KEY, mode TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, interview_id TEXT NOT NULL, revision INTEGER NOT NULL, data TEXT NOT NULL, UNIQUE(interview_id,revision));
      CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, interview_id TEXT, mode TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS evidence_changes (id INTEGER PRIMARY KEY AUTOINCREMENT, interview_id TEXT NOT NULL, mode TEXT NOT NULL, application_id TEXT NOT NULL, data TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (path !== ':memory:') chmodSync(path, 0o600);
    // Preserve existing checkouts when moving from Greenhouse-specific to neutral evidence.
    this.transaction(() => {
      for (const row of this.db.prepare('SELECT data FROM interviews').all() as {
        data: string;
      }[]) {
        const old = JSON.parse(row.data);
        if (old.source && old.ats) continue;
        old.ats = old.ats ?? old.greenhouse;
        delete old.greenhouse;
        old.applicationId ??=
          old.mode === 'demo'
            ? `application-${old.id.replace('demo-', '')}`
            : (old.candidate.match(/^Application #(\d+)$/)?.[1] ?? `unknown-${old.id}`);
        old.candidateId ??= null;
        old.timezoneIsDefault ??= old.mode === 'live';
        old.source ??= {
          provider: old.mode === 'demo' ? 'sample-ats' : 'greenhouse',
          workspaceId: old.mode === 'demo' ? 'demo' : 'configured-greenhouse',
          recordId: old.id,
          kind: old.mode === 'demo' ? 'synthetic' : 'api',
          observedAt: old.ats.updatedAt,
        };
        this.save(old);
      }
    });
    if (!this.meta('seeded')) this.resetDemo();
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  meta(key: string): string | null {
    return (
      (
        this.db.prepare('SELECT value FROM meta WHERE key=?').get(key) as
          { value: string } | undefined
      )?.value ?? null
    );
  }
  setMeta(key: string, value: string) {
    this.db.prepare('INSERT OR REPLACE INTO meta VALUES (?,?)').run(key, value);
  }
  save(i: Interview) {
    this.db
      .prepare('INSERT OR REPLACE INTO interviews VALUES (?,?,?)')
      .run(i.id, i.mode, JSON.stringify(i));
  }
  get(id: string): Interview {
    const row = this.db.prepare('SELECT data FROM interviews WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!row) throw new DeskError(404, 'Interview not found.');
    return JSON.parse(row.data);
  }
  assertRevision(i: Interview, revision: number) {
    if (i.revision !== revision)
      throw new DeskError(
        409,
        'The interview changed. Refresh the evidence and prepare a new update.',
      );
  }
  records(mode: Mode): RecordView[] {
    return (
      this.db.prepare('SELECT data FROM interviews WHERE mode=?').all(mode) as { data: string }[]
    )
      .map((row) => {
        const i: Interview = JSON.parse(row.data);
        return { ...i, issues: inspect(i), proposal: this.latestProposal(i.id) };
      })
      .sort(
        (a, b) =>
          Number(b.issues.length > 0) - Number(a.issues.length > 0) ||
          Date.parse(a.ats.start) - Date.parse(b.ats.start),
      );
  }
  log(i: Interview | null, kind: string, title: string, detail: string, mode: Mode = 'demo') {
    this.db
      .prepare('INSERT INTO activity(interview_id,mode,kind,title,detail,at) VALUES (?,?,?,?,?,?)')
      .run(i?.id ?? null, i?.mode ?? mode, kind, title, detail, new Date().toISOString());
  }
  activity(mode: Mode): Activity[] {
    return this.db
      .prepare(
        'SELECT id,interview_id AS interviewId,mode,kind,title,detail,at FROM activity WHERE mode=? ORDER BY id DESC LIMIT 100',
      )
      .all(mode) as Activity[];
  }
  latestProposal(id: string): Proposal | null {
    const row = this.db
      .prepare('SELECT data FROM proposals WHERE interview_id=? ORDER BY revision DESC LIMIT 1')
      .get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : null;
  }
  proposal(id: string): Proposal {
    const row = this.db.prepare('SELECT data FROM proposals WHERE id=?').get(id) as
      { data: string } | undefined;
    if (!row) throw new DeskError(404, 'Update not found.');
    return JSON.parse(row.data);
  }
  saveProposal(p: Proposal) {
    this.db
      .prepare('INSERT OR REPLACE INTO proposals VALUES (?,?,?,?)')
      .run(p.id, p.interviewId, p.revision, JSON.stringify(p));
  }
  proposals(mode: Mode): Proposal[] {
    return (
      this.db
        .prepare(
          'SELECT p.data FROM proposals p JOIN interviews i ON i.id=p.interview_id WHERE i.mode=? ORDER BY p.rowid DESC',
        )
        .all(mode) as { data: string }[]
    ).map((r) => JSON.parse(r.data));
  }
  resetDemo() {
    this.transaction(() => {
      this.db.exec(
        "DELETE FROM proposals WHERE interview_id IN (SELECT id FROM interviews WHERE mode='demo'); DELETE FROM interviews WHERE mode='demo'; DELETE FROM activity WHERE mode='demo'; DELETE FROM events;",
      );
      this.db.exec("DELETE FROM evidence_changes WHERE mode='demo'");
      for (const i of fixtures()) {
        this.save(i);
        this.log(
          i,
          'import',
          'Interview evidence loaded',
          'Synthetic Greenhouse and calendar records. All candidates and meeting links are fictional.',
        );
        if (i.id === 'demo-1')
          this.log(
            i,
            'change',
            'Interview moved by one hour',
            'Calendar and ATS agree. The last recorded candidate confirmation still contains the previous time.',
          );
      }
      this.setMeta('seeded', 'true');
    });
  }
  prepare(
    id: string,
    revision: number,
    tone: Proposal['tone'],
    source: Proposal['source'],
  ): Proposal {
    return this.transaction(() => {
      const i = this.get(id);
      this.assertRevision(i, revision);
      const draft = makeDraft(i, tone);
      const existing = this.latestProposal(id);
      if (existing?.revision === revision) return existing;
      const p: Proposal = {
        id: randomUUID(),
        interviewId: id,
        revision,
        ...draft,
        tone,
        source,
        status: 'draft',
        attempts: 0,
        receiptId: null,
        createdAt: new Date().toISOString(),
      };
      this.saveProposal(p);
      this.log(
        i,
        'proposal',
        `${source === 'mcp' ? 'MCP assistant' : 'Coordinator'} prepared an update`,
        'Template draft created from the current evidence. No message has been sent.',
      );
      return p;
    });
  }
  deliver(
    id: string,
    revision: number,
    body: string | undefined,
    fail: boolean,
    retry = false,
  ): Proposal {
    return this.transaction(() => {
      const p = this.proposal(id);
      const i = this.get(p.interviewId);
      if (i.mode !== 'demo')
        throw new DeskError(
          403,
          'Live delivery is not enabled. Export the draft and send it through your approved recruiting tools.',
        );
      if (p.status === 'delivered') return p;
      this.assertRevision(i, revision);
      if (p.revision !== revision)
        throw new DeskError(
          409,
          'This update was prepared from an older revision. Prepare a fresh update.',
        );
      if (inspect(i).some((x) => x.blocking))
        throw new DeskError(409, 'Resolve the source evidence issues first.');
      if (retry && p.status !== 'failed')
        throw new DeskError(409, 'Only a failed approved update can be retried.');
      if (!retry && p.status !== 'draft')
        throw new DeskError(409, 'Use retry for this already-approved update.');
      if (!retry) {
        if (!body || body.trim().length < 20 || body.length > 6000)
          throw new DeskError(400, 'The message must contain between 20 and 6,000 characters.');
        // The evidence block must survive editing; the operator can edit the surrounding wording.
        const required = makeDraft(i, p.tone)
          .body.split('\n')
          .filter((line) => /^(Role:|When:|Time zone:|Join:)/.test(line));
        if (required.some((line) => !body.includes(line)))
          throw new DeskError(
            400,
            'Keep the verified role, time, time zone and meeting link in the message.',
          );
        p.body = body;
        this.log(
          i,
          'approval',
          'Coordinator approved the update',
          'Approval is tied to this message and evidence revision. Destination: simulated local outbox.',
        );
      }
      p.attempts++;
      if (fail) {
        p.status = 'failed';
        this.saveProposal(p);
        this.log(
          i,
          'failure',
          'Simulated delivery timed out',
          'The demo failed before delivery. The candidate update remains outstanding. Retry uses the approved message.',
        );
        return p;
      }
      p.status = 'delivered';
      p.receiptId = `demo-receipt-${p.id}`;
      this.saveProposal(p);
      const c = i.calendar!;
      i.notice = {
        start: c.start,
        end: c.end,
        meetingUrl: c.meetingUrl,
        sentAt: new Date().toISOString(),
        receiptId: p.receiptId,
        provenance: 'demo',
      };
      i.revision++;
      this.save(i);
      this.log(
        i,
        'receipt',
        'Recorded in the demo outbox',
        'Simulated receipt recorded. No external email was sent; candidate acknowledgement is not implied.',
      );
      return p;
    });
  }
  demoEvent(id: string, revision: number, kind: 'shift' | 'repair', eventId: string) {
    return this.transaction(() => {
      const i = this.get(id);
      const before = structuredClone(i);
      if (i.mode !== 'demo')
        throw new DeskError(403, 'Scenario controls only work on fictional interviews.');
      if (this.db.prepare('SELECT id FROM events WHERE id=?').get(eventId))
        return { duplicate: true, interview: i };
      this.assertRevision(i, revision);
      const c = i.calendar!;
      if (kind === 'shift') {
        c.start = new Date(Date.parse(c.start) + 3600_000).toISOString();
        c.end = new Date(Date.parse(c.end) + 3600_000).toISOString();
      } else {
        c.declined = [];
        c.cancelled = false;
        c.meetingUrl ||= `https://meet.example.com/${i.id}`;
      }
      c.updatedAt = new Date().toISOString();
      i.ats = { ...c };
      i.revision++;
      this.save(i);
      this.trackChanges(before, i);
      this.db.prepare('INSERT INTO events VALUES (?)').run(eventId);
      this.log(
        i,
        'change',
        kind === 'shift' ? 'Demo interview moved by one hour' : 'Demo source issue corrected',
        kind === 'shift'
          ? 'Calendar and Greenhouse fixtures updated. The candidate confirmation was deliberately left unchanged.'
          : 'The fictional source now has a meeting link and accepted interviewer coverage.',
      );
      return { duplicate: false, interview: i };
    });
  }
  importLive(records: Interview[], skipped: number) {
    this.transaction(() => {
      this.replaceFeed(records, 'live');
      this.setMeta('syncAt', new Date().toISOString());
      this.setMeta('syncError', '');
      this.setMeta('syncSkipped', String(skipped));
      this.log(
        null,
        'sync',
        'Read-only sync completed',
        `${records.length} timed interviews imported; ${skipped} unsupported records skipped.`,
        'live',
      );
    });
  }
  private trackChanges(before: Interview, after: Interview) {
    const fields = [
      'role',
      'stage',
      'interviewer',
      'timezone',
      'candidate',
      'email',
      'applicationId',
      'candidateId',
      'ats.start',
      'ats.end',
      'ats.meetingUrl',
      'calendar.start',
      'calendar.end',
      'calendar.meetingUrl',
      'calendar.cancelled',
      'calendar.declined',
      'notice.start',
      'notice.end',
      'notice.meetingUrl',
    ];
    const read = (record: Interview, path: string): unknown =>
      path
        .split('.')
        .reduce<unknown>(
          (value, part) =>
            value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : null,
          record,
        ) ?? null;
    const changes = fields.flatMap((field) => {
      const previous = read(before, field),
        current = read(after, field);
      return JSON.stringify(previous) === JSON.stringify(current)
        ? []
        : [{ field, before: previous, after: current }];
    });
    if (changes.length)
      this.db
        .prepare(
          'INSERT INTO evidence_changes(interview_id,mode,application_id,data,at) VALUES (?,?,?,?,?)',
        )
        .run(
          after.id,
          after.mode,
          after.applicationId,
          JSON.stringify({
            interviewId: after.id,
            revision: after.revision,
            source: after.source,
            changes,
          }),
          new Date().toISOString(),
        );
  }
  changes(mode: Mode, applicationId: string, since: string) {
    return (
      this.db
        .prepare(
          'SELECT data,at FROM evidence_changes WHERE mode=? AND application_id=? AND at>=? ORDER BY id LIMIT 101',
        )
        .all(mode, applicationId, new Date(since).toISOString()) as { data: string; at: string }[]
    ).map((row) => ({ ...JSON.parse(row.data), observedAt: row.at }));
  }
  importSnapshot(value: unknown, expectedVersion: number) {
    const snapshot = parseSnapshot(value);
    const records = normalizeSnapshot(snapshot);
    return this.transaction(() => {
      const version = Number(this.meta('importVersion') ?? 0);
      if (version !== expectedVersion)
        throw new DeskError(
          409,
          'The imported workspace changed after preview. Preview the file again.',
        );
      const previous = this.meta('importWorkspace');
      const key = JSON.stringify([snapshot.workspace.provider, snapshot.workspace.id]);
      if (
        previous === key &&
        Date.parse(snapshot.capturedAt) < Date.parse(this.meta('importCapturedAt') ?? '')
      )
        throw new DeskError(
          409,
          'This snapshot is older than the imported workspace. Import a current export.',
        );
      this.replaceFeed(records, 'imported');
      this.setMeta('importVersion', String(version + 1));
      this.setMeta('importWorkspace', key);
      this.setMeta('importCapturedAt', snapshot.capturedAt);
      this.setMeta('importLabel', snapshot.workspace.label);
      this.log(
        null,
        'import',
        'Reviewed snapshot imported',
        `${records.length} records from ${snapshot.workspace.label}. This is a local snapshot, not a live connection.`,
        'imported',
      );
      return { count: records.length, version: version + 1 };
    });
  }
  private replaceFeed(records: Interview[], mode: 'live' | 'imported') {
    if (new Set(records.map((i) => i.id)).size !== records.length)
      throw new DeskError(400, 'Duplicate record IDs in provider response.');
    for (const i of records) {
      if (i.mode !== mode)
        throw new DeskError(400, 'Provider returned a record for the wrong workspace.');
      const row = this.db.prepare('SELECT data FROM interviews WHERE id=?').get(i.id) as
        { data: string } | undefined;
      if (row) {
        const old: Interview = JSON.parse(row.data);
        if (old.mode !== mode)
          throw new DeskError(409, 'Provider IDs must not overwrite another workspace.');
        if (
          Date.parse(i.ats.updatedAt) < Date.parse(old.ats.updatedAt) ||
          (i.calendar &&
            old.calendar &&
            Date.parse(i.calendar.updatedAt) < Date.parse(old.calendar.updatedAt))
        ) {
          throw new DeskError(
            502,
            'A source returned older evidence. Previous live records have been retained; sync again after the source catches up.',
          );
        }
        const evidence = (record: Interview) => {
          const {
            revision: _revision,
            source: { observedAt: _observedAt, ...source },
            ...data
          } = record;
          return JSON.stringify({ ...data, source });
        };
        if (mode === 'live' && i.source.provider === 'greenhouse') i.notice = old.notice;
        const changed = evidence(old) !== evidence(i);
        i.revision = old.revision + Number(changed);
        if (changed) {
          this.trackChanges(old, i);
          this.log(
            i,
            'change',
            `Evidence updated to revision ${i.revision}`,
            `Source ${i.source.provider}/${i.source.recordId} changed. Review current evidence before preparing or approving an update.`,
          );
        }
      } else {
        this.log(
          i,
          'import',
          'Interview evidence added',
          `Source ${i.source.provider}/${i.source.recordId}. Evidence kind: ${i.source.kind}.`,
        );
      }
      this.save(i);
    }
    // Only a complete snapshot can replace this workspace. Other modes are untouched.
    const keep = new Set(records.map((i) => i.id));
    for (const row of this.db.prepare('SELECT id FROM interviews WHERE mode=?').all(mode) as {
      id: string;
    }[]) {
      if (!keep.has(row.id)) {
        this.db.prepare('DELETE FROM proposals WHERE interview_id=?').run(row.id);
        this.db.prepare('DELETE FROM interviews WHERE id=?').run(row.id);
      }
    }
  }
}
