import {
  Activity,
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Leaf,
  Mail,
  Users,
} from 'lucide-react';
import type { DeskState, RecordView, Slot } from '../shared';
import { displayDate, displayTime } from '../shared';

export function Evidence({
  record: r,
  state,
  busy,
  onRepair,
  onShift,
}: {
  record: RecordView;
  state: DeskState;
  busy: boolean;
  onRepair: () => void;
  onShift: () => void;
}) {
  const blocked = r.issues.some((i) => i.blocking);
  const timeline = state.activity.filter((a) => a.interviewId === r.id).slice(0, 4);
  const slot = (s: Pick<Slot, 'start' | 'end' | 'meetingUrl'> | null, source: string) => (
    <div
      className={`evidence-row ${source === 'confirmation' && r.issues.some((i) => i.code.startsWith('notice')) ? 'mismatch' : ''}`}
    >
      <div className={`source-icon ${source}`}>
        {source === 'greenhouse' ? (
          <Leaf size={17} />
        ) : source === 'calendar' ? (
          <CalendarDays size={17} />
        ) : (
          <Mail size={17} />
        )}
      </div>
      <div className="source-name">
        <strong>
          {source === 'greenhouse'
            ? 'Greenhouse'
            : source === 'calendar'
              ? 'Google Calendar'
              : 'Candidate confirmation'}
        </strong>
        <small>
          {source === 'confirmation'
            ? r.notice
              ? 'Last recorded update'
              : 'No record in this desk'
            : r.mode === 'demo'
              ? 'Sample evidence'
              : 'Imported evidence'}
        </small>
      </div>
      <div className="source-time">
        {s ? (
          <>
            <strong>{displayTime(s.start)}</strong>
            <small>
              {displayDate(s.start)} · {s.meetingUrl ? 'Link present' : 'No meeting link'}
            </small>
          </>
        ) : (
          <>
            <strong>Unverified</strong>
            <small>Evidence needed</small>
          </>
        )}
      </div>
    </div>
  );
  return (
    <section className="evidence-panel" aria-label="Interview details">
      <div className="detail-heading">
        <div>
          <span className="eyebrow">INTERVIEW DETAILS</span>
          <h2>{r.candidate}</h2>
          <p>{r.role}</p>
        </div>
        <span className={`status-pill ${r.issues.length ? 'warning' : 'success'}`}>
          {r.issues.length ? <AlertCircle size={13} /> : <Check size={13} />}{' '}
          {r.issues.length ? 'Needs attention' : 'In sync'}
        </span>
      </div>
      <div className="interview-meta">
        <span>
          <Users size={14} />
          {r.stage}
        </span>
        <span>
          <CalendarDays size={14} />
          {displayDate(r.greenhouse.start)}
        </span>
      </div>
      <div className="section-label">
        <h3>One interview. Three sources.</h3>
        <span>REV {String(r.revision).padStart(2, '0')}</span>
      </div>
      <div className="evidence-table">
        {slot(r.greenhouse, 'greenhouse')}
        {slot(r.calendar, 'calendar')}
        {slot(r.notice, 'confirmation')}
      </div>
      <div className="timezone-note">
        <Clock3 size={13} />
        <span>
          Candidate’s time:{' '}
          <strong>{displayTime(r.calendar?.start ?? r.greenhouse.start, r.timezone)}</strong> ·{' '}
          {r.timezone}
        </span>
      </div>
      <div className="findings">
        {r.issues.length ? (
          r.issues.map((issue) => (
            <div className={`finding ${issue.blocking ? 'blocking' : ''}`} key={issue.code}>
              <span>
                <AlertCircle size={16} />
              </span>
              <div>
                <h4>{issue.title}</h4>
                <p>{issue.detail}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="resolved-note">
            <CheckCircle2 size={22} />
            <div>
              <h4>The recorded details agree.</h4>
              <p>
                {r.mode === 'demo'
                  ? 'This is a simulated result. A receipt does not mean the candidate has acknowledged the change.'
                  : 'No coordination mismatch was detected in the available evidence.'}
              </p>
            </div>
          </div>
        )}
      </div>
      {r.mode === 'demo' && (
        <div className="scenario-controls">
          <span>TRY A SCENARIO</span>
          <div>
            {blocked && (
              <button className="button secondary" disabled={busy} onClick={onRepair}>
                <Check size={14} />
                Simulate source correction
              </button>
            )}
            <button className="quiet-button" onClick={onShift} disabled={busy}>
              <Clock3 size={14} />
              Move interview +1h
            </button>
          </div>
        </div>
      )}
      <div className="section-label timeline-label">
        <h3>Recent activity</h3>
        <span>
          <Activity size={14} />
        </span>
      </div>
      <ol className="mini-timeline">
        {timeline.map((a) => (
          <li key={a.id}>
            <i
              className={a.kind === 'failure' ? 'failure' : a.kind === 'receipt' ? 'success' : ''}
            />
            <div>
              <strong>{a.title}</strong>
              <span>
                {new Date(a.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}{' '}
                · {a.kind === 'receipt' ? 'Simulated receipt' : 'Local record'}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
