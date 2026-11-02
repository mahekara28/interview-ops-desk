import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { Interview, Mode, Connection } from '../src/shared.js';

const id = z.string().min(1).max(160);
const text = z.string().min(1).max(240);
const instant = z.string().datetime({ offset: true });
const webUrl = z
  .string()
  .url()
  .regex(/^https?:\/\//, 'Use an HTTP or HTTPS URL.')
  .max(2048);
const slot = z.strictObject({
  start: instant,
  end: instant,
  meetingUrl: z.union([z.literal(''), webUrl]),
  updatedAt: instant,
  eventId: z.string().max(300),
  recordUrl: webUrl.optional(),
  cancelled: z.boolean().optional(),
  declined: z.array(text).max(30).optional(),
});
const confirmation = z.strictObject({
  start: instant,
  end: instant,
  meetingUrl: z.union([z.literal(''), webUrl]),
  sentAt: instant,
  receiptId: id,
});

/** Provider-neutral interchange format. Validation happens before any state changes. */
export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal('1.0'),
  workspace: z.strictObject({
    id,
    provider: id,
    label: text,
    kind: z.enum(['synthetic', 'export']),
  }),
  capturedAt: instant,
  interviews: z
    .array(
      z.strictObject({
        id,
        applicationId: id,
        candidateId: id.nullable(),
        candidate: z.strictObject({
          name: text,
          email: z.union([z.literal(''), z.email()]),
          timezone: text,
        }),
        role: text,
        stage: text,
        interviewer: text,
        recordUrl: webUrl.optional(),
        ats: slot,
        calendar: slot.nullable(),
        confirmation: confirmation.nullable(),
      }),
    )
    .max(100),
});
export type RecruitingSnapshot = z.infer<typeof snapshotSchema>;
export const snapshotJsonSchema = z.toJSONSchema(snapshotSchema);

export function parseSnapshot(value: unknown): RecruitingSnapshot {
  const data = snapshotSchema.parse(value);
  const errors: z.core.$ZodIssue[] = [];
  const seen = new Set<string>();
  const identities = new Map<string, string>();
  for (const [index, row] of data.interviews.entries()) {
    const fail = (field: string, message: string) =>
      errors.push({
        code: 'custom',
        path: ['interviews', index, field],
        message,
      });
    if (seen.has(row.id)) fail('id', 'Duplicate interview ID in this snapshot.');
    seen.add(row.id);
    const identity = JSON.stringify([row.candidateId, row.candidate.name, row.candidate.email]);
    if (identities.has(row.applicationId) && identities.get(row.applicationId) !== identity)
      fail('applicationId', 'One application must not refer to conflicting candidate identities.');
    identities.set(row.applicationId, identity);
    try {
      new Intl.DateTimeFormat('en', { timeZone: row.candidate.timezone }).format();
    } catch {
      fail('candidate.timezone', 'Use a valid IANA time zone.');
    }
    for (const [name, evidence] of Object.entries({
      ats: row.ats,
      calendar: row.calendar,
      confirmation: row.confirmation,
    })) {
      if (!evidence) continue;
      if (Date.parse(evidence.end) <= Date.parse(evidence.start))
        fail(name, 'End must follow start.');
      const updatedAt = 'updatedAt' in evidence ? evidence.updatedAt : evidence.sentAt;
      if (Date.parse(updatedAt) > Date.parse(data.capturedAt))
        fail(name, 'Evidence cannot be newer than the snapshot capture time.');
    }
    if (row.calendar && (!row.ats.eventId || row.ats.eventId !== row.calendar.eventId))
      fail('calendar.eventId', 'Calendar evidence must match the ATS event ID.');
  }
  if (errors.length) throw new z.ZodError(errors);
  return data;
}

export function normalizeSnapshot(data: RecruitingSnapshot): Interview[] {
  return data.interviews.map((row) => ({
    id: `import-${createHash('sha256')
      .update(JSON.stringify([data.workspace.provider, data.workspace.id, row.id]))
      .digest('hex')}`,
    mode: 'imported',
    applicationId: row.applicationId,
    candidateId: row.candidateId,
    candidate: row.candidate.name,
    email: row.candidate.email,
    timezone: row.candidate.timezone,
    role: row.role,
    stage: row.stage,
    interviewer: row.interviewer,
    revision: 1,
    source: {
      provider: data.workspace.provider,
      workspaceId: data.workspace.id,
      recordId: row.id,
      kind: data.workspace.kind === 'synthetic' ? 'synthetic' : 'import',
      observedAt: data.capturedAt,
      recordUrl: row.recordUrl,
    },
    ats: row.ats,
    calendar: row.calendar,
    notice: row.confirmation ? { ...row.confirmation, provenance: 'manual' } : null,
  }));
}

/** All adapters return a complete, bounded snapshot; never a partial page. */
export interface RecruitingProvider {
  readonly connections: readonly Connection[];
  readonly descriptor: {
    id: string;
    label: string;
    workspace: Exclude<Mode, 'demo'>;
    capabilities: readonly string[];
  };
  sync(): Promise<{ records: Interview[]; skipped: number }>;
}
