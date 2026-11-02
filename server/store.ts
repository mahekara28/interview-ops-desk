import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Interview, Mode, Proposal, Activity, RecordView } from '../src/shared.js';
import { DeskError, inspect, makeDraft } from './engine.js';
import { fixtures } from './fixtures.js';

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
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    if (path !== ':memory:') chmodSync(path, 0o600);
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
          Date.parse(a.greenhouse.start) - Date.parse(b.greenhouse.start),
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
      i.greenhouse = { ...c };
      i.revision++;
      this.save(i);
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
      for (const i of records) {
        const row = this.db.prepare('SELECT data FROM interviews WHERE id=?').get(i.id) as
          { data: string } | undefined;
        if (row) {
          const old: Interview = JSON.parse(row.data);
          if (
            Date.parse(i.greenhouse.updatedAt) < Date.parse(old.greenhouse.updatedAt) ||
            (i.calendar &&
              old.calendar &&
              Date.parse(i.calendar.updatedAt) < Date.parse(old.calendar.updatedAt))
          ) {
            throw new DeskError(
              502,
              'A source returned older evidence. Previous live records have been retained; sync again after the source catches up.',
            );
          }
          const changed =
            JSON.stringify([old.greenhouse, old.calendar]) !==
            JSON.stringify([i.greenhouse, i.calendar]);
          i.revision = old.revision + Number(changed);
          i.notice = old.notice;
        }
        this.save(i);
      }
      // A completed bounded sync replaces only the live feed; demo records remain isolated.
      const keep = new Set(records.map((i) => i.id));
      for (const row of this.db.prepare("SELECT id FROM interviews WHERE mode='live'").all() as {
        id: string;
      }[]) {
        if (!keep.has(row.id)) {
          this.db.prepare('DELETE FROM proposals WHERE interview_id=?').run(row.id);
          this.db.prepare('DELETE FROM interviews WHERE id=?').run(row.id);
        }
      }
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
}
