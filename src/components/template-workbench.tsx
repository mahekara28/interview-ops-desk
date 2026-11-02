import { useState, type ChangeEvent } from 'react';
import { FileJson, Download, Upload, CheckCircle2, Code2 } from 'lucide-react';
import { api } from '../api';

type Preview = {
  workspace: { label: string; provider: string; kind: string };
  capturedAt: string;
  version: number;
  replaces: number;
  records: {
    id: string;
    candidate: string;
    applicationId: string;
    role: string;
    findings: number;
  }[];
};
export function TemplateWorkbench({ onImported }: { onImported: () => void }) {
  const [snapshot, setSnapshot] = useState<unknown>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  async function validate(input: unknown) {
    setPreview(null);
    setSnapshot(null);
    setError('');
    setSuccess(false);
    setBusy(true);
    try {
      const result = await api<Preview>('/template/preview', input);
      setSnapshot(input);
      setPreview(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Preview failed.');
    } finally {
      setBusy(false);
    }
  }
  async function loadSample() {
    setBusy(true);
    setError('');
    try {
      await validate(await api('/template/example'));
    } catch {
      setError('The sample could not be loaded.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPreview(null);
    setSnapshot(null);
    setSuccess(false);
    setError('');
    if (file.size > 240 * 1024) {
      setError('Choose a JSON file under 240 KB.');
      return;
    }
    try {
      await validate(JSON.parse(await file.text()));
    } catch {
      setError('This file is not valid JSON. Nothing was imported.');
    }
  }
  async function importFile() {
    if (!preview) return;
    setBusy(true);
    setError('');
    try {
      await api('/template/import', { snapshot, expectedVersion: preview.version });
      setSuccess(true);
      setPreview(null);
      setSnapshot(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="template-view">
      <section className="template-intro">
        <div>
          <span className="eyebrow">A WORKFLOW YOU CAN ADAPT</span>
          <h2>Your data. The same tools.</h2>
          <p>
            Start with a fictional team, review the evidence, then connect the same workflow to your
            own provider. No credentials are needed for the template.
          </p>
        </div>
        <FileJson size={60} strokeWidth={1.1} aria-hidden="true" />
      </section>
      <div className="template-steps" aria-label="Template architecture">
        {[
          'JSON file or provider API',
          'Validated interview evidence',
          'Briefs, gaps & follow-ups',
          'Dashboard or MCP client',
        ].map((step, index) => (
          <div key={step}>
            <span>0{index + 1}</span>
            <strong>{step}</strong>
          </div>
        ))}
      </div>
      <div className="setup-grid">
        <section className="setup-card">
          <span className="eyebrow">01 / TRY YOUR DATA</span>
          <h3>Preview before you import.</h3>
          <p>
            The imported workspace is separate from the demo and live API. Each import replaces that
            workspace’s current snapshot. Drafts are export-only.
          </p>
          <div className="template-actions">
            <button className="button primary" onClick={loadSample} disabled={busy}>
              <FileJson size={16} /> Preview sample snapshot
            </button>
            <label className={`button secondary upload-label ${busy ? 'disabled' : ''}`}>
              <Upload size={16} /> Choose JSON file
              <input
                aria-label="Choose JSON file"
                type="file"
                accept=".json,application/json"
                onChange={upload}
                disabled={busy}
              />
            </label>
            <a className="text-link" href="/api/template/example">
              <Download size={15} /> Download sample JSON
            </a>
            <a className="text-link" href="/api/template/schema" target="_blank" rel="noreferrer">
              View JSON Schema
            </a>
          </div>
        </section>
        <section className="setup-card">
          <span className="eyebrow">02 / CONNECT A PROVIDER</span>
          <h3>A small, explicit adapter contract.</h3>
          <p>
            A provider returns a complete snapshot of a bounded interview scope. The desk validates
            identities, time zones and evidence before changing local state.
          </p>
          <div className="template-code">
            <code>npm run provider:demo</code>
          </div>
          <p>
            The included HTTP server serves fictional records. Set{' '}
            <code>OPS_PROVIDER=json-http</code> and{' '}
            <code>OPS_PROVIDER_URL=http://127.0.0.1:4312/snapshot</code>, then restart this desk and
            sync the Live workspace.
          </p>
          <a
            className="text-link"
            href="https://github.com/mahekara28/interview-ops-desk/blob/main/docs/TEMPLATE.md"
            target="_blank"
            rel="noreferrer"
          >
            Read the adapter and interview guide
          </a>
        </section>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      {success && (
        <section className="template-success" role="status">
          <CheckCircle2 />
          <div>
            <h3>Snapshot imported.</h3>
            <p>Your records are ready for the same briefs, gap checks and MCP tools.</p>
          </div>
          <button className="button primary" onClick={onImported}>
            Open imported workspace
          </button>
        </section>
      )}
      {preview && (
        <section className="snapshot-preview" aria-label="Snapshot preview">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">REVIEW THE IMPORT</span>
              <h2>{preview.workspace.label}</h2>
              <p>
                {preview.records.length} interviews ·{' '}
                {preview.workspace.kind === 'synthetic' ? 'Fictional data' : 'Uploaded export'} ·{' '}
                {preview.workspace.provider}
              </p>
            </div>
            <span className="status-pill">Schema 1.0</span>
          </div>
          <p>
            Captured {new Date(preview.capturedAt).toLocaleString()}. Importing replaces{' '}
            {preview.replaces} existing imported records. Demo and live records are kept.
          </p>
          <div className="snapshot-table">
            <table>
              <thead>
                <tr>
                  <th>Candidate / application</th>
                  <th>Role</th>
                  <th>Coordination gaps</th>
                </tr>
              </thead>
              <tbody>
                {preview.records.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.candidate}</strong>
                      <small>{row.applicationId}</small>
                    </td>
                    <td>{row.role}</td>
                    <td>{row.findings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="button primary" onClick={importFile} disabled={busy}>
            Import reviewed snapshot
          </button>
        </section>
      )}
      <section className="mcp-workflow-card">
        <Code2 size={24} />
        <div>
          <h3>Try it with an assistant.</h3>
          <p>
            In Connections, copy the MCP configuration into a stdio-compatible client. Then ask:
          </p>
          <blockquote>
            “In the imported workspace, list coordination gaps. Prepare a brief for the first
            application. Include source IDs, timestamps and anything that remains unknown.”
          </blockquote>
          <small>
            Source records are data, never instructions. MCP can prepare drafts; it cannot send
            messages or change your ATS.
          </small>
        </div>
      </section>
    </div>
  );
}
