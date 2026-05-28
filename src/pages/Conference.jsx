import { Activity, Plus, UserPlus } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../components/auth-context';
import { Header } from '../components/Header';
import { Loader, Modal, ModalHeader, FormField } from '../components/UI';
import { useConference, useConferenceProtocolAssignments } from '../hooks/useConferences';
import { useSessions } from '../hooks/useSessions';
import { useConferenceDignitaries, useDirectoryDignitaries } from '../hooks/useDignitaryDirectory';
import { formatConferenceDateRange, formatDisplayDate, getInitials } from '../lib/formatters';

function toDateInputValue(value) {
  if (!value || typeof value !== 'string') return '';
  return value.slice(0, 10);
}

function toTimeInputValue(value) {
  if (!value || typeof value !== 'string') return '';
  return value.slice(0, 5);
}

function handleTimeSelection(input, onSelect) {
  const nextValue = input.value;
  onSelect(nextValue);
  if (!nextValue) return;
  window.requestAnimationFrame(() => {
    input.blur();
  });
}

function SessionForm({ isEdit, onSave, onCancel }) {
  const [f, setF] = useState({ name: '', date: '', time: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setField = (key, value) => setF((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!f.name) return;
    setSaving(true);
    setError('');
    try {
      const cleaned = Object.fromEntries(Object.entries(f).filter(([, value]) => value !== ''));
      await onSave(cleaned);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
          : err?.message || 'Failed to create session';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title={isEdit ? 'Edit Session' : 'New Session'} onClose={onCancel} />
      <div className="modal-body">
        {error && <p className="auth-error">{error}</p>}
        <FormField label="Session Name">
          <input className="input" placeholder="Opening Night" value={f.name} onChange={(e) => setField('name', e.target.value)} />
        </FormField>
        <div className="form-grid-2">
          <FormField label="Date">
            <input className="input" type="date" value={toDateInputValue(f.date)} onChange={(e) => setField('date', e.target.value)} />
          </FormField>
          <FormField label="Time">
            <input className="input" type="time" step="60" value={toTimeInputValue(f.time)} onChange={(e) => handleTimeSelection(e.currentTarget, (value) => setField('time', value))} />
          </FormField>
        </div>
        <FormField label="Description">
          <textarea className="input" rows={3} placeholder="Short description..." value={f.description} onChange={(e) => setField('description', e.target.value)} style={{ resize: 'vertical' }} />
        </FormField>
        <div className="form-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn btn-gold" onClick={handleSave} disabled={!f.name || saving}>{saving ? 'Creating...' : (isEdit ? 'Save Changes' : 'Add Session')}</button>
        </div>
      </div>
    </>
  );
}

function AddConferenceDignitaryModal({ available, adding, loading, onAdd, onClose, onOpenDirectory }) {
  const [q, setQ] = useState('');
  const deferredQuery = useDeferredValue(q.trim().toLowerCase());

  const filtered = available.filter((dignitary) => {
    if (!deferredQuery) return true;
    return [dignitary.name, dignitary.title, dignitary.church, dignitary.extension]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(deferredQuery));
  });

  return (
    <>
      <ModalHeader title="Add Dignitaries To Conference" onClose={onClose} />
      <div className="modal-body">
        <div className="filter-bar" style={{ marginBottom: 16 }}>
          <input className="input" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
          {onOpenDirectory && <button className="btn btn-outline btn-sm" onClick={onOpenDirectory}>Directory</button>}
        </div>

        {loading ? (
          <Loader text="Loading directory..." />
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ minHeight: 220 }}>
            <div className="empty-state-icon">Roster</div>
            <p className="empty-state-text">No unassigned directory dignitaries found</p>
          </div>
        ) : (
          <div className="modal-list-stack">
            {filtered.map((dignitary) => (
              <div key={dignitary.id} className="card modal-list-item conference-picker-row">
                <div className="conference-picker-copy">
                  <div className="profile-summary-title">{dignitary.name}</div>
                  <div className="profile-summary-subtitle">{dignitary.title}</div>
                  {(dignitary.church || dignitary.extension) && (
                    <div className="profile-summary-meta">{dignitary.church || 'No church listed'}{dignitary.extension ? ` - ${dignitary.extension}` : ''}</div>
                  )}
                </div>
                <button
                  className="btn btn-gold btn-sm btn-icon conference-picker-add"
                  disabled={adding}
                  onClick={() => onAdd(dignitary.id)}
                  type="button"
                  aria-label={`Add ${dignitary.name} to conference`}
                  title={`Add ${dignitary.name} to conference`}
                >
                  <UserPlus size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function triggerFileDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatTimeLabel(value) {
  if (!value || typeof value !== 'string') return '';
  const parts = value.split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : value;
}

export function Conference() {
  const { confId } = useParams();
  const navigate = useNavigate();
  const { isEditorOrAdmin, isAdmin } = useAuth();
  const [showNewSession, setShowNewSession] = useState(false);
  const [showDignitaryPicker, setShowDignitaryPicker] = useState(false);
  const [tab, setTab] = useState('sessions');
  const [exporting, setExporting] = useState(false);

  const { data: conf, isLoading: isLoadingConf } = useConference(confId);
  const { sessionsQuery, createSession, deleteSession } = useSessions(confId);
  const shouldLoadRoster = tab === 'dignitaries' || tab === 'export' || showDignitaryPicker;
  const { conferenceDignitariesQuery, addConferenceDignitary, removeConferenceDignitary } = useConferenceDignitaries(confId, shouldLoadRoster);
  const { exportArrivals } = useConferenceProtocolAssignments(confId, isAdmin && tab === 'export');
  const { directoryQuery } = useDirectoryDignitaries(showDignitaryPicker);

  const { data: sessions = [], isLoading: isLoadingSessions } = sessionsQuery;
  const { data: conferenceDignitaries = [], isLoading: isLoadingRoster } = conferenceDignitariesQuery;
  const { data: directoryDignitaries = [], isLoading: isLoadingDirectory } = directoryQuery;

  const pickedIds = useMemo(
    () => new Set(conferenceDignitaries.map((dignitary) => dignitary.directory_dignitary_id)),
    [conferenceDignitaries],
  );
  const availableDirectoryDignitaries = useMemo(
    () => directoryDignitaries.filter((dignitary) => !pickedIds.has(dignitary.id)),
    [directoryDignitaries, pickedIds],
  );

  const handleExportArrivals = async () => {
    setExporting(true);
    try {
      const blob = await exportArrivals();
      triggerFileDownload(blob, `${conf.name.toLowerCase().replace(/\s+/g, '-')}-arrivals.doc`);
    } finally {
      setExporting(false);
    }
  };

  const arrivedConferenceDignitaries = useMemo(
    () => conferenceDignitaries.filter((dignitary) => dignitary.first_arrival_at),
    [conferenceDignitaries],
  );

  if (isLoadingConf || isLoadingSessions) {
    return <Loader text="Loading conference..." />;
  }
  if (!conf) return <div className="empty-state" style={{ marginTop: 100 }}>Conference not found.</div>;

  return (
    <div>
      <Header confName={conf.name} backTo="/" backLabel="Dashboard" />

      <div className="page-container fade-in">
        <div className="page-header page-header--start">
          <div>
            <h1 className="page-title">{conf.name}</h1>
            <p className="page-subtitle">
              {formatConferenceDateRange(conf, 'Date not set')}
              {conf.time ? ` at ${formatTimeLabel(conf.time)}` : ''}
              {conf.venue ? ` - ${conf.venue}` : ''}
            </p>
            <div className="page-chip-row">
              {conf.auditorium?.name && <span className="page-chip">Auditorium: {conf.auditorium.name}</span>}
              <span className="page-chip">{conferenceDignitaries.length} dignitaries</span>
              <span className="page-chip">{sessions.length} sessions</span>
            </div>
          </div>
          {isAdmin && (
            <div className="page-header-actions">
              <button className="btn btn-gold btn-sm" onClick={() => navigate(`/conference/${confId}/control-center`)}>
                <Activity size={15} />
                Control Center
              </button>
            </div>
          )}
        </div>

        <div className="tab-bar">
          {[
            { id: 'sessions', label: 'Sessions' },
            { id: 'dignitaries', label: 'Dignitaries' },
            { id: 'export', label: 'Arrivals' },
          ].map((tabOption) => (
            <button key={tabOption.id} onClick={() => setTab(tabOption.id)} className={`tab-btn ${tab === tabOption.id ? 'active' : ''}`}>
              {tabOption.label}
            </button>
          ))}
        </div>

        {tab === 'sessions' && (
          <section className="card section-card conference-tab-panel">
            <div className="section-card-head">
              <div>
                <h2 className="section-card-title">Sessions</h2>
              </div>
              {isEditorOrAdmin && (
                <div className="section-card-actions">
                  <button className="btn btn-gold btn-sm" onClick={() => setShowNewSession(true)}>Add Session</button>
                </div>
              )}
            </div>

            {sessions.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">Session</div>
                <p className="empty-state-text">No sessions yet</p>
              </div>
            ) : (
              <div className="grid-cards">
                {sessions.map((session) => (
                  <div key={session.id} className="card card-hover session-card" onClick={() => navigate(`/session/${session.id}`)}>
                    <div className="card-top-row">
                      <div>
                        <h3 className="session-card-title">{session.name}</h3>
                        <p className="session-card-meta">
                          {formatDisplayDate(session.date, 'Date not set')}
                          {session.time ? ` at ${formatTimeLabel(session.time)}` : ''}
                        </p>
                      </div>
                      {isEditorOrAdmin && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger-strong)', flexShrink: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete session?')) deleteSession.mutate(session.id);
                          }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {session.description && <p className="session-card-desc">{session.description}</p>}
                    <div className="card-badge-row">
                      <span className="card-badge">Open Session</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'dignitaries' && (
          <section className="card section-card conference-tab-panel">
            <div className="section-card-head">
              <div>
                <h2 className="section-card-title">Dignitaries</h2>
              </div>
              <div className="section-card-actions">
                {isAdmin && <button className="btn btn-outline btn-sm" onClick={() => navigate('/dignitaries')}>Directory</button>}
                {isEditorOrAdmin && (
                  <button
                    className="btn btn-gold btn-sm btn-icon"
                    aria-label="Add dignitary from directory"
                    title="Add dignitary from directory"
                    onClick={() => setShowDignitaryPicker(true)}
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>

            {isLoadingRoster ? (
              <Loader text="Loading conference dignitaries..." />
            ) : conferenceDignitaries.length === 0 ? (
              <div className="empty-state" style={{ minHeight: 180 }}>
                <div className="empty-state-icon">Roster</div>
                <p className="empty-state-text">No dignitaries added to this conference yet</p>
              </div>
            ) : (
              <div className="grid-cards">
                {conferenceDignitaries.map((dignitary) => (
                  <div key={dignitary.id} className="card attendee-card">
                    <div className="attendee-card-top">
                      <div className="attendee-avatar">
                        {dignitary.picture_url
                          ? <img src={dignitary.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : getInitials(dignitary.name, '?')}
                      </div>
                      <div className="attendee-info">
                        <div className="attendee-name">{dignitary.name}</div>
                        <div className="attendee-title">{dignitary.title}</div>
                        {(dignitary.church || dignitary.extension) && <div className="attendee-church">{dignitary.church || 'No church listed'}{dignitary.extension ? ` - ${dignitary.extension}` : ''}</div>}
                      </div>
                    </div>
                    <div className="attendee-badges">
                      {dignitary.assigned_protocol_name && <span className="card-badge">Protocol: {dignitary.assigned_protocol_name}</span>}
                      {dignitary.conference_role && <span className="card-badge card-badge--muted">{dignitary.conference_role}</span>}
                      {dignitary.first_arrival_session?.name && <span className="card-badge card-badge--muted">First arrived: {dignitary.first_arrival_session.name}</span>}
                    </div>
                    {isEditorOrAdmin && (
                      <div className="conference-dignitary-actions">
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger-strong)' }}
                          onClick={() => {
                            if (window.confirm(`Remove ${dignitary.name} from this conference?`)) {
                              removeConferenceDignitary.mutate(dignitary.id);
                            }
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {tab === 'export' && (
          <section className="card section-card conference-tab-panel">
            <div className="section-card-head">
              <div>
                <h2 className="section-card-title">Arrivals</h2>
              </div>
              {isAdmin && (
                <div className="section-card-actions">
                  <button className="btn btn-outline btn-sm" onClick={handleExportArrivals} disabled={exporting}>
                    {exporting ? 'Preparing...' : 'Export Arrivals'}
                  </button>
                </div>
              )}
            </div>

            <div className="card profile-summary-card">
              <div className="profile-summary-title">Conference-wide arrivals</div>
              <div className="profile-summary-subtitle">
                {isLoadingRoster
                  ? 'Loading arrival records...'
                  : `${arrivedConferenceDignitaries.length} of ${conferenceDignitaries.length} dignitar${conferenceDignitaries.length === 1 ? 'y has' : 'ies have'} recorded first arrivals`}
              </div>
            </div>
          </section>
        )}
      </div>

      {showNewSession && (
        <Modal onClose={() => setShowNewSession(false)}>
          <SessionForm
            isEdit={false}
            onSave={async (payload) => {
              await createSession.mutateAsync(payload);
              setShowNewSession(false);
            }}
            onCancel={() => setShowNewSession(false)}
          />
        </Modal>
      )}

      {showDignitaryPicker && (
        <Modal onClose={() => setShowDignitaryPicker(false)}>
          <AddConferenceDignitaryModal
            available={availableDirectoryDignitaries}
            adding={addConferenceDignitary.isPending}
            loading={isLoadingDirectory}
            onAdd={async (directoryDignitaryId) => {
              await addConferenceDignitary.mutateAsync(directoryDignitaryId);
            }}
            onClose={() => setShowDignitaryPicker(false)}
            onOpenDirectory={isAdmin ? () => navigate('/dignitaries') : undefined}
          />
        </Modal>
      )}
    </div>
  );
}
