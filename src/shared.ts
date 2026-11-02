export type Mode = 'demo' | 'imported' | 'live';
export type EvidenceSource = {
  provider: string;
  workspaceId: string;
  recordId: string;
  kind: 'synthetic' | 'import' | 'api';
  observedAt: string;
  recordUrl?: string;
};
export type Slot = {
  start: string;
  end: string;
  meetingUrl: string;
  updatedAt: string;
  eventId: string;
  recordUrl?: string;
  cancelled?: boolean;
  declined?: string[];
};
export type Notice = {
  start: string;
  end: string;
  meetingUrl: string;
  sentAt: string;
  receiptId: string;
  provenance: 'demo' | 'manual';
};
export type Interview = {
  id: string;
  mode: Mode;
  candidate: string;
  email: string;
  timezone: string;
  timezoneIsDefault?: boolean;
  role: string;
  stage: string;
  interviewer: string;
  revision: number;
  applicationId: string;
  candidateId: string | null;
  source: EvidenceSource;
  ats: Slot;
  calendar: Slot | null;
  notice: Notice | null;
};
export type Issue = {
  code: string;
  title: string;
  detail: string;
  severity: 'high' | 'medium';
  blocking: boolean;
};
export type Proposal = {
  id: string;
  interviewId: string;
  revision: number;
  subject: string;
  body: string;
  tone: 'warm' | 'concise';
  source: 'dashboard' | 'mcp';
  status: 'draft' | 'failed' | 'delivered';
  attempts: number;
  createdAt: string;
  receiptId: string | null;
};
export type Activity = {
  id: number;
  interviewId: string | null;
  mode: Mode;
  kind: string;
  title: string;
  detail: string;
  at: string;
};
export type RecordView = Interview & { issues: Issue[]; proposal: Proposal | null };
export type Connection = {
  id: string;
  title: string;
  status: 'demo' | 'configured' | 'unconfigured' | 'ready';
  detail: string;
};
export type DeskState = {
  mode: Mode;
  records: RecordView[];
  activity: Activity[];
  proposals: Proposal[];
  connections: Connection[];
  sync: { at: string | null; error: string | null; skipped: number };
};
export function displayTime(value: string, timezone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  }).format(new Date(value));
}
export function displayDate(value: string, timezone = 'America/New_York') {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  }).format(new Date(value));
}
