import { z } from 'zod';
import type { Interview, Slot } from '../src/shared.js';
import { DeskError } from './engine.js';

const date = z.string().datetime({ offset: true });
const ghSchema = z.object({
  id: z.number().int(),
  application_id: z.number().int(),
  job_id: z.number().int(),
  job_interview_id: z.number().int(),
  organizer_id: z.number().int().nullable().optional(),
  starts_at: date.nullable(),
  ends_at: date.nullable(),
  updated_at: date,
  external_event_id: z.string().nullable(),
  video_conferencing_url: z.string().nullable(),
  status: z.string(),
});
export type GreenhouseRow = z.infer<typeof ghSchema>;
const calendarSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  updated: date.optional(),
  start: z.object({ dateTime: date.optional() }).optional(),
  end: z.object({ dateTime: date.optional() }).optional(),
  hangoutLink: z.string().optional(),
  conferenceData: z
    .object({
      entryPoints: z.array(z.object({ entryPointType: z.string(), uri: z.string() })).optional(),
    })
    .optional(),
  attendees: z
    .array(
      z.object({
        email: z.string(),
        displayName: z.string().optional(),
        responseStatus: z.string().optional(),
      }),
    )
    .optional(),
});
function safeLink(value?: string | null) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : '';
  } catch {
    return '';
  }
}
export function normalizeInterview(raw: unknown, rawCalendar?: unknown): Interview | null {
  const row = ghSchema.parse(raw);
  if (
    row.status !== 'scheduled' ||
    !row.starts_at ||
    !row.ends_at ||
    Date.parse(row.ends_at) <= Date.parse(row.starts_at)
  )
    return null;
  const greenhouse: Slot = {
    start: row.starts_at,
    end: row.ends_at,
    updatedAt: row.updated_at,
    meetingUrl: safeLink(row.video_conferencing_url),
    eventId: row.external_event_id ?? '',
  };
  let calendar: Slot | null = null;
  if (rawCalendar) {
    const event = calendarSchema.parse(rawCalendar);
    if (event.id !== row.external_event_id)
      throw new DeskError(502, 'The calendar event ID does not match the Greenhouse interview.');
    if (event.status === 'cancelled' || (event.start?.dateTime && event.end?.dateTime)) {
      calendar = {
        start: event.start?.dateTime ?? greenhouse.start,
        end: event.end?.dateTime ?? greenhouse.end,
        updatedAt: event.updated ?? row.updated_at,
        meetingUrl: safeLink(
          event.hangoutLink ??
            event.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri,
        ),
        eventId: event.id,
        cancelled: event.status === 'cancelled',
        declined:
          event.attendees
            ?.filter((a) => a.responseStatus === 'declined')
            .map((a) => a.displayName || a.email) ?? [],
      };
    }
  }
  return {
    id: `gh-${row.id}`,
    mode: 'live',
    candidate: `Application #${row.application_id}`,
    email: '',
    timezone: 'America/New_York',
    role: `Job #${row.job_id}`,
    stage: `Interview #${row.job_interview_id}`,
    interviewer: row.organizer_id ? `Organizer #${row.organizer_id}` : 'Organizer not provided',
    revision: 1,
    greenhouse,
    calendar,
    notice: null,
  };
}
export type AdapterConfig = {
  clientId?: string;
  clientSecret?: string;
  userId?: string;
  jobIds?: string;
  googleToken?: string;
  calendarId?: string;
};
export class LiveAdapters {
  private token?: { value: string; expires: number };
  constructor(
    public config: AdapterConfig,
    private request: typeof fetch = fetch,
  ) {}
  private async checked(url: string, init: RequestInit, service: string) {
    let response: Response;
    try {
      response = await this.request(url, {
        ...init,
        signal: AbortSignal.timeout(12_000),
        redirect: 'error',
      });
    } catch {
      throw new DeskError(
        502,
        `${service} could not be reached. Previous evidence has been retained.`,
      );
    }
    return response;
  }
  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expires > Date.now() + 30_000) return this.token.value;
    const { clientId, clientSecret, userId } = this.config;
    if (!clientId || !clientSecret)
      throw new DeskError(
        409,
        'Greenhouse is not configured. Add Harvest v3 OAuth credentials to the local environment.',
      );
    const form = new URLSearchParams({ grant_type: 'client_credentials' });
    if (userId) form.set('sub', userId);
    const response = await this.checked(
      'https://auth.greenhouse.io/token',
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
      },
      'Greenhouse authentication',
    );
    if (!response.ok)
      throw new DeskError(
        502,
        `Greenhouse authentication failed (${response.status}). Verify the account permissions and credentials.`,
      );
    const data = z
      .object({ access_token: z.string().min(1), expires_in: z.number().positive() })
      .parse(await response.json());
    this.token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
    return data.access_token;
  }
  async fetchInterviews(now = new Date()): Promise<GreenhouseRow[]> {
    let token = await this.accessToken();
    const url = new URL('https://harvest.greenhouse.io/v3/interviews');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('status', 'scheduled');
    url.searchParams.set('starts_at[gte]', now.toISOString());
    url.searchParams.set('starts_at[lte]', new Date(now.getTime() + 14 * 86_400_000).toISOString());
    if (this.config.jobIds) {
      if (!/^\d+(,\d+)*$/.test(this.config.jobIds))
        throw new DeskError(400, 'GREENHOUSE_JOB_IDS must contain comma-separated numeric IDs.');
      url.searchParams.set('job_ids', this.config.jobIds);
    }
    let next: string | null = url.href;
    const records: GreenhouseRow[] = [];
    const seen = new Set<string>();
    while (next) {
      const page = new URL(next);
      if (
        page.origin !== url.origin ||
        page.pathname !== url.pathname ||
        page.username ||
        page.password
      )
        throw new DeskError(502, 'Greenhouse returned an unsafe pagination link.');
      if (seen.has(next) || seen.size >= 20)
        throw new DeskError(
          502,
          'Greenhouse pagination did not finish. Narrow the configured job scope.',
        );
      seen.add(next);
      let response = await this.checked(
        next,
        { headers: { Authorization: `Bearer ${token}` } },
        'Greenhouse',
      );
      if (response.status === 401) {
        token = await this.accessToken(true);
        response = await this.checked(
          next,
          { headers: { Authorization: `Bearer ${token}` } },
          'Greenhouse',
        );
      }
      if (!response.ok)
        throw new DeskError(
          502,
          response.status === 429
            ? 'Greenhouse rate limit reached. Try syncing later.'
            : `Greenhouse sync failed (${response.status}). Check scopes and account access.`,
        );
      records.push(...z.array(ghSchema).parse(await response.json()));
      const link: string | null = response.headers.get('link');
      const match = link?.match(/<([^>]+)>;\s*rel="?next"?/);
      next = match ? new URL(match[1], url).href : null;
    }
    return records;
  }
  async sync() {
    const rows = await this.fetchInterviews();
    const records: Interview[] = [];
    let skipped = 0;
    for (const row of rows) {
      if (!normalizeInterview(row)) {
        skipped++;
        continue;
      }
      let event: unknown;
      if (this.config.googleToken && row.external_event_id) {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.config.calendarId ?? 'primary')}/events/${encodeURIComponent(row.external_event_id)}`;
        const response = await this.checked(
          url,
          { headers: { Authorization: `Bearer ${this.config.googleToken}` } },
          'Google Calendar',
        );
        if (response.ok) event = await response.json();
        else if (response.status !== 404 && response.status !== 410)
          throw new DeskError(
            502,
            `Calendar sync failed (${response.status}). Refresh the access token or check calendar permissions.`,
          );
      }
      records.push(normalizeInterview(row, event)!);
    }
    return { records, skipped };
  }
}
