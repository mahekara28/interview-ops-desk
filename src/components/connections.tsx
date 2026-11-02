import { useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Code2,
  Copy,
  LayoutDashboard,
  Leaf,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import type { DeskState } from '../shared';
import { api } from '../api';
import { Brand } from './brand';

export function Connections({ state, onDemo }: { state: DeskState; onDemo: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  async function copyConfig() {
    try {
      const config = await api('/mcp-config');
      await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      setCopyError('Clipboard unavailable. Use the setup example in docs/CONNECTIONS.md.');
    }
  }
  return (
    <div className="connections-view">
      <div className="architecture-card">
        <div>
          <span className="eyebrow">HOW IT FITS TOGETHER</span>
          <h2>
            The API brings the facts.
            <br />
            MCP brings your assistant.
          </h2>
          <p>
            Provider adapters and validated snapshots supply source evidence. One shared rules
            engine powers both this dashboard and the assistant’s tools.
          </p>
        </div>
        <div className="architecture">
          <div className="source-stack">
            <span>
              <Leaf size={17} />
              ATS / JSON snapshot
            </span>
            <span>
              <CalendarDays size={17} />
              Calendar API
            </span>
          </div>
          <span className="connector-line" />
          <div className="engine-node">
            <Brand small />
            <strong>Evidence & rules</strong>
            <small>Local SQLite store</small>
          </div>
          <span className="connector-line" />
          <div className="source-stack">
            <span>
              <LayoutDashboard size={17} />
              Coordinator UI
            </span>
            <span>
              <Code2 size={17} />
              MCP assistant
            </span>
          </div>
        </div>
      </div>
      <div className="connection-grid">
        {state.connections.map((c) => (
          <article className="connection-card" key={c.id}>
            <div className="connection-top">
              <span className={`connection-logo ${c.id}`}>
                {c.id === 'greenhouse' ? (
                  <Leaf />
                ) : c.id === 'calendar' ? (
                  <CalendarDays />
                ) : c.id === 'mcp' ? (
                  <Code2 />
                ) : (
                  <Mail />
                )}
              </span>
              <span className={`connection-status ${c.status}`}>
                {c.status === 'demo'
                  ? 'Simulated'
                  : c.status === 'ready'
                    ? c.id === 'mcp'
                      ? 'Tools available'
                      : 'Snapshot loaded'
                    : c.status === 'configured'
                      ? 'Credentials configured'
                      : 'Not connected'}
              </span>
            </div>
            <h3>{c.title}</h3>
            <p>{c.detail}</p>
            <div className="connection-description">
              {c.id === 'greenhouse'
                ? 'OAuth client credentials read scheduled interviews. Each interview is matched to its calendar event by external_event_id.'
                : c.id === 'custom'
                  ? 'Your endpoint returns the versioned snapshot contract. The included sample API returns fictional data; an employer adapter requires authorized access.'
                  : c.id === 'snapshot'
                    ? 'Validated file import with explicit provenance. This is a point-in-time snapshot, not a live provider connection.'
                    : c.id === 'calendar'
                      ? 'Read the matching event’s time, meeting link and attendee responses. Missing evidence stays visible.'
                      : c.id === 'mcp'
                        ? 'Retrieve candidate briefs, list coordination gaps, inspect observed changes and prepare follow-ups. MCP has no send or ATS-write tool.'
                        : 'The demo records receipts locally. Live mode exports a draft; it has no email sender and cannot confirm real delivery.'}
            </div>
          </article>
        ))}
      </div>
      <div className="setup-grid">
        <article className="setup-card">
          <span className="eyebrow">CONNECT AN ASSISTANT</span>
          <h3>Your desk, accessible through MCP.</h3>
          <p>
            Copy a configuration with the absolute local paths for this checkout. Add it to an MCP
            client that supports stdio, then restart that client.
          </p>
          <button className="button secondary" onClick={copyConfig}>
            {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
            {copied ? 'Configuration copied' : 'Copy MCP configuration'}
          </button>
          {copyError && <p role="alert">{copyError}</p>}
          <blockquote>
            “List coordination gaps in the demo workspace. Prepare a brief for application-1,
            including source IDs, timestamps and unknowns.”
          </blockquote>
          <small>
            Drafts appear in the same dashboard. No model API key is needed by the desk; your MCP
            client supplies the model.
          </small>
        </article>
        <article className="setup-card">
          <span className="eyebrow">CONNECT LIVE SOURCES</span>
          <h3>Start with authorized API access.</h3>
          <p>
            Set Harvest v3 OAuth credentials and an optional Google Calendar read token in your
            local <code>.env</code>, then restart and choose Live workspace.
          </p>
          <div className="scope-note">
            <ShieldCheck size={19} />
            <span>
              Live sync reads the next 14 days. It imports interview/application IDs, not candidate
              profiles or inbox history.
            </span>
          </div>
          <a
            className="text-link"
            href="https://github.com/mahekara28/interview-ops-desk/blob/main/docs/CONNECTIONS.md"
            target="_blank"
            rel="noreferrer"
          >
            Read the connection guide
            <ArrowUpRight size={15} />
          </a>
          <button className="quiet-button" onClick={onDemo}>
            Explore the credential-free demo
            <ChevronRight size={14} />
          </button>
          {state.sync.at && (
            <small>
              Last live sync: {new Date(state.sync.at).toLocaleString()} · {state.sync.skipped}{' '}
              unsupported records skipped
            </small>
          )}
        </article>
      </div>
    </div>
  );
}
