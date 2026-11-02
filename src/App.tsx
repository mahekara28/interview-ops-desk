import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bell,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Code2,
  LayoutDashboard,
  Leaf,
  Loader2,
  Mail,
  Plug,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { DeskState, Mode } from './shared';
import { displayDate, displayTime } from './shared';
import { api } from './api';
import { Brand } from './components/brand';
import { Evidence } from './components/evidence';
import { Actions } from './components/candidate-update';
import { ActivityView } from './components/activity';
import { Connections } from './components/connections';
import { EmptyLive } from './components/empty-live';
import { Dialog } from './components/dialog';
const initials = (name: string) =>
  name
    .split(' ')
    .slice(0, 2)
    .map((x) => x[0])
    .join('');

export function App() {
  const [state, setState] = useState<DeskState | null>(null);
  const [mode, setMode] = useState<Mode>('demo');
  const [view, setView] = useState('desk');
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('attention');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [help, setHelp] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  async function load() {
    const data = await api<DeskState>(`/state?mode=${mode}`);
    setState(data);
    setSelected((previous) => previous ?? data.records[0]?.id ?? null);
  }
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api<DeskState>(`/state?mode=${mode}`)
        .then((data) => {
          if (active) {
            setState(data);
            setSelected((previous) => previous ?? data.records[0]?.id ?? null);
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    setState(null);
    refresh();
    const timer = setInterval(refresh, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [mode]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function act(fn: () => Promise<unknown>, message?: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
      if (message) setToast(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const records = state?.records ?? [];
  function chooseFilter(next: string) {
    setFilter(next);
    setSelected(
      records.find(
        (r) => next === 'all' || (next === 'attention' ? r.issues.length > 0 : !r.issues.length),
      )?.id ?? null,
    );
  }
  const needsAction = records.filter((r) => r.issues.length);
  const clear = records.length - needsAction.length;
  const receipts = state?.proposals.filter((p) => p.status === 'delivered').length ?? 0;
  const list = records.filter(
    (r) =>
      (filter === 'all' ||
        (filter === 'attention' ? r.issues.length > 0 : r.issues.length === 0)) &&
      `${r.candidate} ${r.role} ${r.stage}`.toLowerCase().includes(query.toLowerCase()),
  );
  const current = records.find((r) => r.id === selected) ?? list[0] ?? records[0];
  const changeMode = (next: Mode) => {
    setMode(next);
    setSelected(null);
    setError('');
    setQuery('');
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand-link"
          href="#"
          aria-label="Interview Ops Desk home"
          onClick={(e) => {
            e.preventDefault();
            setView('desk');
          }}
        >
          <Brand />
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">M</span>
          <div>
            Mahek’s workspace<small>Recruiting operations</small>
          </div>
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ['desk', LayoutDashboard, 'Coordination'],
            ['activity', Activity, 'Activity'],
            ['connections', Plug, 'Connections'],
          ].map(([key, Icon, label]) => (
            <button
              key={String(key)}
              aria-label={String(label)}
              className={view === key ? 'active' : ''}
              onClick={() => setView(String(key))}
              aria-current={view === key ? 'page' : undefined}
            >
              <Icon size={18} />
              <span>{String(label)}</span>
              {key === 'desk' && <b>{needsAction.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Leaf size={22} />
          <p>
            Good coordination
            <br />
            is in the details.
          </p>
          <span>A little clarity goes a long way.</span>
        </div>
        <button className="help-button" onClick={() => setHelp(true)}>
          <CircleHelp size={17} />
          <span>How this desk works</span>
        </button>
        <div className="profile">
          <span className="profile-avatar">MA</span>
          <div>
            Mahek Ara<small>Builder & coordinator</small>
          </div>
          <span className="online-dot" />
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{' '}
            <strong>
              {view === 'desk' ? 'Coordination' : view === 'activity' ? 'Activity' : 'Connections'}
            </strong>
          </div>
          <div className="top-actions">
            <span className="local-status">
              <i /> Local workspace
            </span>
            <a
              href="https://github.com/mahekara28/interview-ops-desk"
              target="_blank"
              rel="noreferrer"
              aria-label="View source on GitHub"
            >
              <Code2 size={19} />
            </a>
            <button aria-label="Open demo guide" onClick={() => setHelp(true)}>
              <CircleHelp size={19} />
            </button>
          </div>
        </header>
        <div className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">THE COORDINATOR’S WORKSPACE</div>
              <h1>
                {view === 'desk'
                  ? 'Keep every interview on track.'
                  : view === 'activity'
                    ? 'Every action, accounted for.'
                    : 'One desk. Connected evidence.'}
              </h1>
              <p>
                {view === 'desk'
                  ? 'Catch the small mismatches before they become someone’s bad day.'
                  : view === 'activity'
                    ? 'Follow each change from source evidence to a reviewed update.'
                    : 'Bring in the facts. Give your assistant the right tools.'}
              </p>
            </div>
            <div className="heading-actions">
              <label className="mode-select">
                <span className="sr-only">Workspace mode</span>
                <select
                  value={mode}
                  onChange={(e) => changeMode(e.target.value as Mode)}
                  disabled={busy}
                >
                  <option value="demo">Demo workspace</option>
                  <option value="live">Live workspace</option>
                </select>
              </label>
              {mode === 'demo' ? (
                <button
                  className="button secondary"
                  onClick={() => setResetOpen(true)}
                  disabled={busy}
                >
                  <RotateCcw size={15} />
                  Reset demo
                </button>
              ) : (
                <button
                  className="button primary"
                  onClick={() => act(() => api('/sync', {}), 'Read-only sync completed.')}
                  disabled={busy}
                >
                  <RefreshCw size={15} className={busy ? 'spin' : ''} />
                  Sync sources
                </button>
              )}
            </div>
          </div>
          <div className="demo-banner">
            <span className={`banner-icon ${mode}`}>
              <ShieldCheck size={16} />
            </span>
            <p>
              {mode === 'demo' ? (
                <>
                  <strong>A working demo, with fictional people.</strong> Updates stay in the local
                  outbox. No email is sent.
                </>
              ) : (
                <>
                  <strong>Live evidence · read-only.</strong> Candidate names and email history are
                  not imported. Export drafts for manual review.
                </>
              )}
            </p>
            <button onClick={() => setView(view === 'connections' ? 'desk' : 'connections')}>
              {view === 'connections' ? 'Back to desk' : 'View connections'}
              <ChevronRight size={14} />
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError('')}>
                <X size={16} />
              </button>
            </div>
          )}
          {mode === 'live' && state?.sync.error && (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>Last sync: {state.sync.error}</span>
            </div>
          )}
          {!state ? (
            <div className="loading">
              <Loader2 className="spin" />
              Opening the desk…
            </div>
          ) : view === 'desk' ? (
            <>
              <div className="stats">
                <button
                  onClick={() => chooseFilter('attention')}
                  className={filter === 'attention' ? 'selected' : ''}
                >
                  <span className="stat-icon amber">
                    <Bell size={19} />
                  </span>
                  <div>
                    <span>Needs attention</span>
                    <strong>
                      {needsAction.length}
                      <small>interviews</small>
                    </strong>
                  </div>
                  <span className="stat-note">A clear next step</span>
                </button>
                <button
                  onClick={() => chooseFilter('clear')}
                  className={filter === 'clear' ? 'selected' : ''}
                >
                  <span className="stat-icon green">
                    <CheckCheck size={20} />
                  </span>
                  <div>
                    <span>No issues detected</span>
                    <strong>
                      {clear}
                      <small>interviews</small>
                    </strong>
                  </div>
                  <span className="stat-note">Evidence agrees</span>
                </button>
                <button onClick={() => setView('activity')}>
                  <span className="stat-icon blue">
                    <Mail size={19} />
                  </span>
                  <div>
                    <span>{mode === 'demo' ? 'Demo receipts' : 'Local receipts'}</span>
                    <strong>
                      {receipts}
                      <small>updates</small>
                    </strong>
                  </div>
                  <span className="stat-note">Approved & recorded</span>
                </button>
              </div>
              {mode === 'live' && records.length === 0 ? (
                <EmptyLive
                  configured={state.connections[0].status === 'configured'}
                  onConnect={() => setView('connections')}
                />
              ) : (
                <div className="workbench">
                  <section className="queue-panel" aria-label="Interview queue">
                    <div className="panel-heading">
                      <h2>Interview queue</h2>
                      <span className="count">{list.length}</span>
                    </div>
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Search interviews"
                        placeholder="Find a person or role…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <div className="queue-tabs" role="group" aria-label="Filter interviews">
                      {[
                        ['attention', 'Needs action'],
                        ['all', 'All'],
                        ['clear', 'Clear'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={filter === key ? 'active' : ''}
                          onClick={() => chooseFilter(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="queue-list">
                      {list.length === 0 && (
                        <div className="small-empty">
                          <CheckCircle2 size={24} />
                          <p>{query ? 'No matching interviews.' : 'You’re all caught up here.'}</p>
                        </div>
                      )}
                      {list.map((r, index) => (
                        <button
                          key={r.id}
                          className={`candidate-card ${current?.id === r.id ? 'selected' : ''}`}
                          onClick={() => setSelected(r.id)}
                          aria-label={`Open ${r.candidate}`}
                          aria-pressed={current?.id === r.id}
                        >
                          <div className="candidate-top">
                            <span className={`avatar hue-${index % 4}`}>
                              {initials(r.candidate)}
                            </span>
                            <div>
                              <strong>{r.candidate}</strong>
                              <span>{r.role}</span>
                            </div>
                            <ChevronRight size={14} />
                          </div>
                          <div className="candidate-time">
                            <Clock3 size={12} />
                            {displayDate(r.greenhouse.start)} · {displayTime(r.greenhouse.start)}
                          </div>
                          <span
                            className={`issue-chip ${r.issues.length ? (r.issues.some((x) => x.blocking) ? 'blocked' : 'attention') : 'clear'}`}
                          >
                            <i />
                            {r.issues[0]?.title ?? 'Evidence in sync'}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="queue-footer">
                      <span className="online-dot" />
                      Times shown in Eastern Time
                    </div>
                  </section>
                  {current && (
                    <>
                      <Evidence
                        record={current}
                        state={state}
                        busy={busy}
                        onRepair={() =>
                          act(
                            () =>
                              api('/demo/event', {
                                id: current.id,
                                revision: current.revision,
                                kind: 'repair',
                                eventId: crypto.randomUUID(),
                              }),
                            'Demo source evidence corrected.',
                          )
                        }
                        onShift={() =>
                          act(
                            () =>
                              api('/demo/event', {
                                id: current.id,
                                revision: current.revision,
                                kind: 'shift',
                                eventId: crypto.randomUUID(),
                              }),
                            'Interview moved. Check the candidate confirmation.',
                          )
                        }
                      />
                      <Actions record={current} busy={busy} act={act} />
                    </>
                  )}
                </div>
              )}
            </>
          ) : view === 'activity' ? (
            <ActivityView
              state={state}
              onOpen={(id) => {
                setSelected(id);
                setView('desk');
              }}
            />
          ) : (
            <Connections
              state={state}
              onDemo={() => {
                changeMode('demo');
                setView('desk');
              }}
            />
          )}
          <footer className="page-footer">
            <span>Built with care by Mahek Ara</span>
            <span>Evidence first. A human makes the call.</span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      {help && (
        <Dialog title="A 90-second walkthrough" onClose={() => setHelp(false)}>
          <p className="dialog-intro">
            Start with Maya’s interview. The schedule changed, but her last recorded confirmation
            still has the old time.
          </p>
          <ol className="guide">
            <li>
              <b>Compare the evidence.</b>
              <span>
                Greenhouse and Calendar agree. The candidate confirmation is one hour behind.
              </span>
            </li>
            <li>
              <b>Prepare an update.</b>
              <span>
                Review the template, edit the wording, and keep the verified details intact.
              </span>
            </li>
            <li>
              <b>Try a delivery failure.</b>
              <span>
                Turn on “Simulate a delivery timeout”, approve, then retry the approved message.
              </span>
            </li>
            <li>
              <b>Inspect the receipt.</b>
              <span>
                See the approval, failure and recovery in Activity. Every delivery here is
                simulated.
              </span>
            </li>
          </ol>
          <button
            className="button primary full"
            onClick={() => {
              changeMode('demo');
              setSelected('demo-1');
              setView('desk');
              setHelp(false);
            }}
          >
            Open Maya’s interview
            <ChevronRight size={16} />
          </button>
        </Dialog>
      )}
      {resetOpen && (
        <Dialog title="Start a fresh demo?" onClose={() => setResetOpen(false)}>
          <p>
            This clears fictional drafts, demo receipts and demo activity, then restores the six
            sample interviews. Live records are kept separately.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setResetOpen(false)}>
              Keep my demo
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await api('/demo/reset', {});
                  setResetOpen(false);
                  setSelected('demo-1');
                  setFilter('attention');
                }, 'Fresh demo ready.')
              }
            >
              Reset demo
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
