import type { Interview, Slot } from '../src/shared.js';
export function fixtures(now = Date.now()): Interview[] {
  const base = Math.ceil((now + 60 * 60_000) / (30 * 60_000)) * (30 * 60_000);
  const people = [
    ['Maya Chen', 'Platform Engineer', 'Technical conversation', 'Alex Rivera', 'America/New_York'],
    ['Arjun Mehta', 'Data Analyst', 'Team interview', 'Jordan Lee', 'Asia/Kolkata'],
    ['Sofia Reed', 'Product Designer', 'Portfolio review', 'Sam Taylor', 'Europe/London'],
    [
      'Theo Nakamura',
      'Backend Engineer',
      'Hiring manager conversation',
      'Alex Rivera',
      'America/Los_Angeles',
    ],
    [
      'Ella Park',
      'Operations Associate',
      'Introductory conversation',
      'Casey Moore',
      'America/New_York',
    ],
    ['Noah Williams', 'Customer Success Lead', 'Team interview', 'Sam Taylor', 'Europe/London'],
  ];
  return people.map(([candidate, role, stage, interviewer, timezone], index) => {
    const start = new Date(base + index * 60 * 60_000).toISOString();
    const end = new Date(Date.parse(start) + 45 * 60_000).toISOString();
    const id = `demo-${index + 1}`;
    const slot: Slot = {
      start,
      end,
      updatedAt: new Date(now - 12 * 60_000).toISOString(),
      eventId: `calendar-${id}`,
      meetingUrl: `https://meet.example.com/${id}`,
      declined: index === 1 ? [interviewer] : [],
    };
    if (index === 2) slot.meetingUrl = '';
    const notice =
      index === 4
        ? null
        : {
            start: index === 0 ? new Date(Date.parse(start) - 60 * 60_000).toISOString() : start,
            end: index === 0 ? new Date(Date.parse(end) - 60 * 60_000).toISOString() : end,
            meetingUrl: slot.meetingUrl,
            sentAt: new Date(now - 86_400_000).toISOString(),
            receiptId: `sample-${id}`,
            provenance: 'demo' as const,
          };
    return {
      id,
      mode: 'demo',
      candidate,
      email: `${candidate.toLowerCase().replace(' ', '.')}@example.com`,
      timezone,
      role,
      stage,
      interviewer,
      revision: 1,
      greenhouse: { ...slot },
      calendar: { ...slot },
      notice,
    };
  });
}
