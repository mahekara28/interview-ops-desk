import { fixtures } from './fixtures.js';
import type { RecruitingSnapshot } from './contracts.js';

export function sampleSnapshot(now = Date.now()): RecruitingSnapshot {
  return {
    schemaVersion: '1.0',
    workspace: {
      id: 'sample-team',
      provider: 'sample-ats',
      label: 'Fictional recruiting team',
      kind: 'synthetic',
    },
    capturedAt: new Date(now).toISOString(),
    interviews: fixtures(now).map((record) => ({
      id: record.id,
      applicationId: record.applicationId,
      candidateId: record.candidateId,
      candidate: { name: record.candidate, email: record.email, timezone: record.timezone },
      role: record.role,
      stage: record.stage,
      interviewer: record.interviewer,
      ats: record.ats,
      calendar: record.calendar,
      confirmation: record.notice
        ? {
            start: record.notice.start,
            end: record.notice.end,
            meetingUrl: record.notice.meetingUrl,
            sentAt: record.notice.sentAt,
            receiptId: record.notice.receiptId,
          }
        : null,
    })),
  };
}
