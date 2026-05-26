import {
  Activity,
  AlertTriangle,
  Armchair,
  CheckCircle2,
  Clock3,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Header } from '../components/Header';
import { Loader } from '../components/UI';
import { useControlCenter } from '../hooks/useControlCenter';
import { getInitials } from '../lib/formatters';
import { statusColor } from '../lib/constants';
import { statusLabels } from '../lib/controlCenter';

function formatDateTime(value) {
  if (!value) return 'No timestamp';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No timestamp';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatClock(value) {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No activity yet';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function ProgressBar({ value, color = 'var(--accent-strong)' }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="control-progress" aria-label={`${safeValue}%`}>
      <div className="control-progress-fill" style={{ width: `${safeValue}%`, background: color }} />
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className={`card control-metric ${tone ? `control-metric--${tone}` : ''}`}>
      <div className="control-metric-icon">
        <Icon size={18} />
      </div>
      <div>
        <div className="control-metric-value">{value}</div>
        <div className="control-metric-label">{label}</div>
        {sub && <div className="control-metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

function AlertPill({ severity }) {
  const label = severity === 'high' ? 'Critical' : severity === 'medium' ? 'Watch' : 'Info';
  return <span className={`control-alert-pill control-alert-pill--${severity}`}>{label}</span>;
}

function FeedIcon({ type }) {
  const Icon = type === 'arrival'
    ? UserCheck
    : type === 'assignment'
      ? ShieldCheck
      : type === 'status'
        ? Activity
        : Clock3;
  return <Icon size={15} />;
}

export function ControlCenter() {
  const { confId } = useParams();
  const [trackerQuery, setTrackerQuery] = useState('');
  const deferredTrackerQuery = useDeferredValue(trackerQuery.trim().toLowerCase());
  const { data, model, isLoading, isFetching, error, refresh } = useControlCenter(confId);

  const trackerRows = useMemo(() => {
    if (!model?.trackerRows) return [];
    if (!deferredTrackerQuery) return model.trackerRows;
    return model.trackerRows.filter((row) => row.searchText.includes(deferredTrackerQuery));
  }, [deferredTrackerQuery, model?.trackerRows]);

  if (isLoading) return <Loader text="Loading control center..." />;
  if (error) {
    return (
      <div>
        <Header backTo={`/conference/${confId}`} backLabel="Conference" />
        <div className="page-container">
          <p className="auth-error">{error.response?.data?.detail || error.message || 'Control center could not load.'}</p>
        </div>
      </div>
    );
  }

  const conference = data?.conference;
  const summary = model?.summary || {};
  const totalAttention = model?.alerts?.length || 0;

  return (
    <div>
      <Header confName={conference?.name} backTo={`/conference/${confId}`} backLabel="Conference" />
      <div className="page-container--wide control-center-page fade-in">
        <div className="control-hero">
          <div className="control-hero-copy">
            <div className="control-eyebrow">
              <Radio size={14} />
              Live conference command
            </div>
            <h1 className="page-title control-title">Control Center</h1>
            <p className="page-subtitle">
              {conference?.name || 'Conference'}{conference?.auditorium?.name ? ` - ${conference.auditorium.name}` : ''}
            </p>
          </div>
          <div className="control-hero-actions">
            <div className={`control-live-chip ${isFetching ? 'is-syncing' : ''}`}>
              <span className="control-live-dot" />
              {isFetching ? 'Syncing' : 'Realtime'}
            </div>
            <button className="btn btn-outline btn-sm" onClick={refresh}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        </div>

        <div className="control-metrics-grid">
          <MetricCard icon={Users} label="Expected" value={summary.expected || 0} sub={`${summary.inSession || 0} placed in sessions`} />
          <MetricCard icon={UserCheck} label="Arrived" value={summary.arrived || 0} sub={`${summary.pending || 0} pending`} tone="arrival" />
          <MetricCard icon={Armchair} label="Seated" value={summary.seated || 0} sub={`${summary.seatingCompletion || 0}% seating completion`} tone="seated" />
          <MetricCard icon={ShieldCheck} label="Protocol Coverage" value={`${summary.assignmentCoverage || 0}%`} sub={`${summary.assignedProtocolCount || 0}/${summary.expected || 0} assigned`} />
          <MetricCard icon={AlertTriangle} label="Needs Attention" value={totalAttention} sub="Live operational alerts" tone={totalAttention ? 'alert' : 'clear'} />
        </div>

        <div className="control-main-grid">
          <section className="card control-panel control-panel--attention">
            <div className="control-panel-head">
              <div>
                <h2 className="section-card-title">Attention Needed</h2>
                <p className="page-subtitle">Conflicts, gaps, late movement, and coverage risks.</p>
              </div>
              <span className="control-count">{totalAttention}</span>
            </div>

            {!model?.alerts?.length ? (
              <div className="control-empty">
                <CheckCircle2 size={22} />
                <span>No active operational alerts.</span>
              </div>
            ) : (
              <div className="control-alert-list">
                {model.alerts.slice(0, 14).map((alert) => (
                  <div key={alert.id} className={`control-alert control-alert--${alert.severity}`}>
                    <AlertPill severity={alert.severity} />
                    <div>
                      <div className="control-alert-title">{alert.title}</div>
                      <div className="control-alert-detail">{alert.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card control-panel control-panel--feed">
            <div className="control-panel-head">
              <div>
                <h2 className="section-card-title">Live Activity</h2>
                <p className="page-subtitle">Latest movement across sessions, roster, and assignments.</p>
              </div>
            </div>

            {!model?.feed?.length ? (
              <div className="control-empty">
                <Clock3 size={22} />
                <span>No activity recorded yet.</span>
              </div>
            ) : (
              <div className="control-feed-list">
                {model.feed.slice(0, 18).map((event) => (
                  <div key={event.id} className="control-feed-item">
                    <div className="control-feed-icon"><FeedIcon type={event.type} /></div>
                    <div className="control-feed-body">
                      <div className="control-feed-top">
                        <span>{event.label}</span>
                        <time>{formatDateTime(event.at)}</time>
                      </div>
                      <div className="control-feed-detail">{event.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="control-secondary-grid">
          <section className="card control-panel">
            <div className="control-panel-head">
              <div>
                <h2 className="section-card-title">Protocol Team</h2>
                <p className="page-subtitle">Who is assigned, what they own, and the last visible movement.</p>
              </div>
            </div>

            <div className="control-protocol-list">
              {model?.protocolRows?.length ? model.protocolRows.map((row) => (
                <div key={row.user.id} className="control-protocol-row">
                  <div className="control-avatar">
                    {row.user.picture_url ? <img src={row.user.picture_url} alt="" /> : getInitials(row.user.full_name, '?')}
                  </div>
                  <div className="control-protocol-main">
                    <div className="control-protocol-name">{row.user.full_name || 'Unnamed protocol officer'}</div>
                    <div className="control-protocol-meta">
                      {row.assignment?.conference_role || 'No conference role'}
                    </div>
                    <div className="control-protocol-assigned">
                      {row.assignedDignitary?.name || 'No dignitary assigned'}
                    </div>
                  </div>
                  <div className="control-protocol-side">
                    <span className={`badge ${row.currentStatus}`}>{statusLabels[row.currentStatus] || 'Pending'}</span>
                    <span>{formatClock(row.lastUpdate)}</span>
                  </div>
                </div>
              )) : (
                <div className="control-empty">
                  <Users size={22} />
                  <span>No protocol officers found.</span>
                </div>
              )}
            </div>
          </section>

          <section className="card control-panel">
            <div className="control-panel-head">
              <div>
                <h2 className="section-card-title">Session Seating</h2>
                <p className="page-subtitle">Capacity and section occupancy across all sessions.</p>
              </div>
            </div>

            <div className="control-session-list">
              {model?.sessionRows?.length ? model.sessionRows.map((sessionRow) => (
                <div key={sessionRow.session.id} className="control-session-card">
                  <div className="control-session-top">
                    <div>
                      <div className="control-session-title">{sessionRow.session.name}</div>
                      <div className="control-session-meta">{sessionRow.assignedSeats}/{sessionRow.total} seated positions assigned</div>
                    </div>
                    <span className="control-session-unassigned">{sessionRow.unassignedSeats} unassigned</span>
                  </div>
                  <div className="control-status-strip">
                    {Object.entries(sessionRow.statusCounts).map(([status, count]) => (
                      <span key={status} style={{ color: statusColor[status] }}>{statusLabels[status]}: {count}</span>
                    ))}
                  </div>
                  <div className="control-section-stack">
                    {sessionRow.sections.map((section) => (
                      <div key={section.id} className="control-section-row">
                        <div className="control-section-label">
                          <span className="control-section-dot" style={{ background: section.color }} />
                          <span>{section.label}</span>
                        </div>
                        <div className="control-section-meter">
                          <ProgressBar value={section.occupancy} color={section.color} />
                          <span>{section.assigned}/{section.totalSeats}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )) : (
                <div className="control-empty">
                  <Armchair size={22} />
                  <span>No session seating yet.</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card control-panel">
          <div className="control-panel-head control-panel-head--search">
            <div>
              <h2 className="section-card-title">Dignitary Tracker</h2>
              <p className="page-subtitle">Search the roster and inspect status, officer, and session presence.</p>
            </div>
            <div className="control-search">
              <Search size={16} />
              <input value={trackerQuery} onChange={(event) => setTrackerQuery(event.target.value)} placeholder="Search dignitary, title, church, protocol..." />
            </div>
          </div>

          <div className="control-tracker-grid">
            {trackerRows.length ? trackerRows.map((dignitary) => (
              <div key={dignitary.rosterId} className="control-tracker-card">
                <div className="control-tracker-top">
                  <div className="control-avatar">
                    {dignitary.picture_url ? <img src={dignitary.picture_url} alt="" /> : getInitials(dignitary.name, '?')}
                  </div>
                  <div>
                    <div className="control-tracker-name">{dignitary.name}</div>
                    <div className="control-tracker-title">{dignitary.title}</div>
                  </div>
                </div>
                <div className="control-tracker-meta">
                  <span className={`badge ${dignitary.status}`}>{statusLabels[dignitary.status] || 'Pending'}</span>
                  <span>{dignitary.assignment?.user_profile?.full_name || dignitary.assigned_protocol_name || 'No protocol officer'}</span>
                </div>
                <div className="control-tracker-foot">
                  <span>{dignitary.sessionRows.length} session{dignitary.sessionRows.length === 1 ? '' : 's'}</span>
                  <span>{dignitary.first_arrival_at ? `First arrival ${formatDateTime(dignitary.first_arrival_at)}` : 'No first arrival'}</span>
                </div>
              </div>
            )) : (
              <div className="control-empty control-empty--wide">
                <Search size={22} />
                <span>No dignitaries match that search.</span>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
