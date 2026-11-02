import type { Interview, Issue, Proposal } from '../src/shared.js';
import { displayDate, displayTime } from '../src/shared.js';

export class DeskError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);
export function inspect(i: Interview): Issue[] {
  const issues: Issue[] = [];
  const add = (
    code: string,
    title: string,
    detail: string,
    blocking = false,
    severity: Issue['severity'] = 'high',
  ) => issues.push({ code, title, detail, blocking, severity });
  if (!i.calendar) {
    add(
      'calendar_unknown',
      'Calendar evidence unavailable',
      'Connect the matching calendar and sync before preparing an update. Missing evidence does not prove that an interview is missing.',
      true,
    );
    return issues;
  }
  const c = i.calendar;
  if (c.cancelled || i.ats.cancelled) {
    add(
      'cancelled',
      'Interview was cancelled',
      'Review the cancellation in the source system and confirm the next step with the hiring team.',
      true,
    );
    return issues;
  }
  if (
    !sameInstant(c.start, i.ats.start) ||
    !sameInstant(c.end, i.ats.end) ||
    c.meetingUrl !== i.ats.meetingUrl
  ) {
    add(
      'source_mismatch',
      'Calendar and ATS disagree',
      'The time or meeting link differs between sources. Confirm the intended schedule before contacting the candidate.',
      true,
    );
  }
  if (c.declined?.length)
    add(
      'interviewer_declined',
      i.mode === 'demo' ? 'Interviewer declined' : 'Participant declined',
      `${c.declined.join(', ')} declined. Confirm who declined and agree the next step before sending an update.`,
      true,
    );
  if (!c.meetingUrl)
    add(
      'meeting_missing',
      'Meeting link missing',
      'This remote interview has no verified meeting link. Add it to the source calendar and sync again.',
      true,
      'medium',
    );
  if (!i.notice) {
    add(
      'notice_unknown',
      'Candidate update unverified',
      'No candidate confirmation is recorded in this desk. Check the communication history; this does not mean no email was sent.',
      false,
      'medium',
    );
  } else if (
    !sameInstant(i.notice.start, c.start) ||
    !sameInstant(i.notice.end, c.end) ||
    i.notice.meetingUrl !== c.meetingUrl
  ) {
    add(
      'notice_stale',
      'Candidate needs an updated confirmation',
      'The last recorded confirmation contains different details. Review an update with the current time and meeting link.',
    );
  }
  return issues;
}
export function makeDraft(i: Interview, tone: Proposal['tone']) {
  const issues = inspect(i);
  if (issues.some((x) => x.blocking))
    throw new DeskError(
      409,
      'Resolve the source evidence issues before preparing a candidate update.',
    );
  if (!issues.length)
    throw new DeskError(409, 'This interview has no outstanding coordination issues.');
  const slot = i.calendar!;
  const firstName = i.candidate.startsWith('Application #') ? 'there' : i.candidate.split(' ')[0];
  const when = `${displayDate(slot.start, i.timezone)}, ${displayTime(slot.start, i.timezone)}–${displayTime(slot.end, i.timezone)}`;
  const intro =
    tone === 'warm'
      ? `I wanted to make sure you have the latest details for your ${i.stage.toLowerCase()}. Thank you for your flexibility.`
      : `Here are the updated details for your ${i.stage.toLowerCase()}.`;
  return {
    subject: `Updated interview details · ${i.role}`,
    body: `Hi ${firstName},\n\n${intro}\n\nRole: ${i.role}\nWhen: ${when}\nTime zone: ${i.timezone}\nJoin: ${slot.meetingUrl}\n\nPlease reply to confirm this works for you, or let us know if you need another time.\n\nThank you,\nRecruiting team`,
  };
}
