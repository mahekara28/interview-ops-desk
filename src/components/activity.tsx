import { Activity, AlertCircle, CheckCheck, ChevronRight, ShieldCheck } from 'lucide-react';
import type { DeskState } from '../shared';

export function ActivityView({
  state,
  onOpen,
}: {
  state: DeskState;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="activity-view">
      <div className="section-label">
        <h2>Coordination history</h2>
        <span>{state.activity.length} RECENT EVENTS</span>
      </div>
      {state.activity.length === 0 && (
        <p className="empty-copy">Your first sync or action will appear here.</p>
      )}
      {state.activity.map((a) => (
        <div className="activity-row" key={a.id}>
          <span className={`activity-icon ${a.kind}`}>
            {a.kind === 'receipt' ? (
              <CheckCheck size={18} />
            ) : a.kind === 'failure' ? (
              <AlertCircle size={18} />
            ) : a.kind === 'approval' ? (
              <ShieldCheck size={18} />
            ) : (
              <Activity size={18} />
            )}
          </span>
          <div>
            <strong>{a.title}</strong>
            <p>{a.detail}</p>
            {a.interviewId && (
              <button className="text-link" onClick={() => onOpen(a.interviewId!)}>
                {state.records.find((r) => r.id === a.interviewId)?.candidate ?? a.interviewId}
                <ChevronRight size={13} />
              </button>
            )}
          </div>
          <time>
            {new Date(a.at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit',
            })}
          </time>
        </div>
      ))}
    </section>
  );
}
