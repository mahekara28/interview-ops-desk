import { useEffect, useState } from 'react';
import { Copy, Check, FileText } from 'lucide-react';
import type { Mode } from '../shared';
import type { candidateBrief } from '../../server/workflows';
import { api } from '../api';
type Brief = ReturnType<typeof candidateBrief>;
export function CandidateBrief({
  applicationId,
  workspace,
  revision,
}: {
  applicationId: string;
  workspace: Mode;
  revision: number;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    setBrief(null);
    setError('');
    setCopied(false);
    api<Brief>(`/brief?workspace=${workspace}&applicationId=${encodeURIComponent(applicationId)}`)
      .then((value) => {
        if (active) setBrief(value);
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [applicationId, workspace, revision]);
  return (
    <details className="candidate-brief">
      <summary>
        <FileText size={16} /> Application brief <small>{applicationId}</small>
      </summary>
      {error && <p role="alert">{error}</p>}
      {brief && (
        <div className="brief-content">
          <p>
            Same structured evidence returned by <code>get_candidate_brief</code>.
          </p>
          {brief.interviews.map((row) => (
            <article key={row.interviewId}>
              <strong>
                {row.stage} · {row.role}
              </strong>
              <p>{row.nextAction}</p>
              <dl>
                <dt>Source</dt>
                <dd>
                  {row.source.provider} · {row.source.kind}
                </dd>
                <dt>Record ID</dt>
                <dd>{row.source.recordId}</dd>
                <dt>Observed</dt>
                <dd>{new Date(row.source.observedAt).toLocaleString()}</dd>
              </dl>
              {row.source.recordUrl && (
                <a
                  className="text-link"
                  href={row.source.recordUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open source record
                </a>
              )}
            </article>
          ))}
          <p className="brief-limits">
            Resume and scorecard data are unavailable. A recorded confirmation does not establish a
            complete communication history.
          </p>
          <button
            className="quiet-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(brief, null, 2));
                setCopied(true);
              } catch {
                setError('Clipboard unavailable. Use the MCP tool to retrieve this brief.');
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Brief copied' : 'Copy structured brief'}
          </button>
        </div>
      )}
    </details>
  );
}
