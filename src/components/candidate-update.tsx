import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCheck,
  CheckCircle2,
  Download,
  FileText,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { RecordView, Proposal } from '../shared';
import { api } from '../api';

export function Actions({
  record: r,
  busy,
  act,
}: {
  record: RecordView;
  busy: boolean;
  act: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
}) {
  const proposal = r.proposal;
  const current = proposal?.revision === r.revision ? proposal : null;
  const delivered = !r.issues.length && proposal?.status === 'delivered';
  const [body, setBody] = useState('');
  const [fail, setFail] = useState(false);
  const [tone, setTone] = useState('warm');
  useEffect(() => {
    setBody(current?.body ?? '');
    setFail(false);
  }, [r.id, current?.id, current?.body]);
  const blocked = r.issues.some((i) => i.blocking);
  const download = () => {
    if (!current) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([`Subject: ${current.subject}\n\n${body}`], { type: 'text/plain' }),
    );
    link.download = 'candidate-update-draft.txt';
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <section className="action-panel" aria-label="Candidate update">
      <div className="panel-heading">
        <h2>
          <FileText size={17} />
          Next best action
        </h2>
        <span className="small-badge">REVIEW FIRST</span>
      </div>
      <div className="action-body">
        {delivered ? (
          <div className="delivery-success">
            <div className="success-stamp">
              <CheckCheck size={35} />
            </div>
            <span className="eyebrow">DEMO RECEIPT RECORDED</span>
            <h3>A clearer handoff.</h3>
            <p>
              The approved update is in the local outbox. The recorded confirmation now matches the
              interview.
            </p>
            <div className="receipt-details">
              <span>
                Destination<strong>Local demo outbox</strong>
              </span>
              <span>
                Attempts<strong>{proposal.attempts}</strong>
              </span>
              <span>
                Receipt<strong>{proposal.receiptId?.slice(0, 25)}…</strong>
              </span>
            </div>
            <p className="fine-print">
              No external email was sent. Candidate acknowledgement is a separate step.
            </p>
          </div>
        ) : !current ? (
          <>
            <div className="action-illustration">
              <div className="paper">
                <span />
                <span />
                <span />
                <span />
                <div>
                  <Check size={16} />
                </div>
              </div>
              <i />
              <Mail size={20} />
            </div>
            <span className="eyebrow">
              {blocked
                ? 'CHECK THE SOURCE FIRST'
                : r.issues.length
                  ? 'A SMALL UPDATE. A BIG DIFFERENCE.'
                  : 'NOTHING TO SEND'}
            </span>
            <h3>
              {blocked
                ? 'Get the details settled.'
                : r.issues.length
                  ? 'Keep the candidate in the loop.'
                  : 'This interview looks good.'}
            </h3>
            <p>
              {blocked
                ? 'The evidence needs attention before a confirmation can be prepared. Resolve the issue, then review an update.'
                : r.issues.length
                  ? 'Prepare a message using the verified interview details. You review every word before recording a demo delivery.'
                  : 'The available records agree. You can explore another interview or try a schedule change.'}
            </p>
            {!blocked && r.issues.length > 0 && (
              <label className="tone-field">
                Message tone
                <select value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="warm">Warm & clear</option>
                  <option value="concise">Concise</option>
                </select>
              </label>
            )}
            <button
              className="button primary full"
              disabled={busy || blocked || !r.issues.length}
              onClick={() =>
                act(() => api(`/interviews/${r.id}/prepare`, { revision: r.revision, tone }))
              }
            >
              <FileText size={16} />
              Prepare candidate update
            </button>
            <div className="human-note">
              <ShieldCheck size={15} />
              <span>Template draft · human approval required</span>
            </div>
          </>
        ) : (
          <div className="draft">
            <div className="draft-meta">
              <span>
                <i />
                {current.source === 'mcp' ? 'Prepared through MCP' : 'Template draft'}
              </span>
              <span>REV {current.revision}</span>
            </div>
            <label>
              To<span className="recipient">{r.email || 'Candidate contact not imported'}</span>
            </label>
            <label>
              Subject<span className="subject">{current.subject}</span>
            </label>
            <label htmlFor="draft-body">
              Message{' '}
              <span className="muted">
                {current.status === 'failed' ? 'Approved copy' : 'Editable'}
              </span>
            </label>
            <textarea
              id="draft-body"
              aria-label="Candidate message"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              readOnly={current.status !== 'draft'}
              maxLength={6000}
            />
            <p className="fine-print">
              Keep the verified Role, When, Time zone and Join lines intact. Check the wording
              before approval.
            </p>
            {current.status === 'failed' ? (
              <>
                <div className="failure-notice">
                  <AlertCircle size={17} />
                  <div>
                    <strong>Simulated delivery failed</strong>
                    <p>No receipt was recorded. Retry the same approved message.</p>
                  </div>
                </div>
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={() =>
                    act(
                      () => api(`/proposals/${current.id}/retry`, { revision: r.revision }),
                      'Approved update recorded in the demo outbox.',
                    )
                  }
                >
                  <RefreshCw size={15} />
                  Retry approved update
                </button>
              </>
            ) : r.mode === 'demo' ? (
              <>
                <label className="failure-toggle">
                  <input
                    type="checkbox"
                    checked={fail}
                    onChange={(e) => setFail(e.target.checked)}
                  />
                  Simulate a delivery timeout
                </label>
                <button
                  className="button primary full"
                  disabled={busy}
                  onClick={() =>
                    act(() =>
                      api<Proposal>(`/proposals/${current.id}/approve`, {
                        revision: r.revision,
                        body,
                        simulateFailure: fail,
                      }),
                    )
                  }
                >
                  {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}Approve demo
                  delivery
                </button>
                <span className="outbox-note">
                  Records a local receipt. Sends no external email.
                </span>
              </>
            ) : (
              <button className="button primary full" onClick={download}>
                <Download size={16} />
                Export draft for review
              </button>
            )}
          </div>
        )}
        <div className="action-footer">
          <div className="flow-step complete">
            <CheckCircle2 size={15} />
            <span>Inspect evidence</span>
          </div>
          <div className={`flow-step ${current || delivered ? 'complete' : ''}`}>
            <FileText size={15} />
            <span>Review the update</span>
          </div>
          <div className={`flow-step ${delivered ? 'complete' : ''}`}>
            <Inbox size={15} />
            <span>Verify the receipt</span>
          </div>
        </div>
      </div>
    </section>
  );
}
