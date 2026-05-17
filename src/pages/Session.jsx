import { memo, useDeferredValue, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../components/auth-context';
import { AttendeeProfile } from '../components/AttendeeProfile';
import { Header } from '../components/Header';
import { SeatGrid } from '../components/SeatGrid';
import { Loader, Modal, ModalHeader, FormField } from '../components/UI';
import { VenueMap } from '../components/VenueMap';
import { useDignitaries } from '../hooks/useAttendees';
import { useConferenceDignitaries } from '../hooks/useDignitaryDirectory';
import { useConferences } from '../hooks/useConferences';
import { useSessions, useSessionData } from '../hooks/useSessions';
import { formatDisplayDate, getInitials } from '../lib/formatters';
import { auditoriumSupportsSections, getDefaultConfig, getOpenSections, getSectionById, STATUSES, statusColor } from '../lib/constants';

function formatTimeLabel(value) {
  if (!value || typeof value !== 'string') return '';
  const parts = value.split(':');
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : value;
}

function normalizeSectionCount(value, fallback = null) {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(20, parsed));
}
import { api } from '../services/apiClient';

function AddDignitaryToSessionForm({ auditorium, conferenceDignitaries, initialAssignment, loadingConferenceDignitaries = false, onSave, onCancel }) {
  const [f, setF] = useState({
    conference_dignitary_id: '',
    section: initialAssignment?.section || '',
    row_num: initialAssignment?.row_num || '',
    col_num: initialAssignment?.col_num || '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const openSections = getOpenSections(auditorium);
  const selected = conferenceDignitaries.find((dignitary) => dignitary.id === f.conference_dignitary_id);

  const setField = (key, value) => setF((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    if (!f.conference_dignitary_id) return;
    setSaving(true);
    setError('');
    try {
      const cleaned = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, value === '' ? null : value]));
      await onSave(cleaned);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
          : err?.message || 'Failed to add dignitary';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title="Add Dignitary To Session" onClose={onCancel} />
      <div className="modal-body">
        {error && <p className="auth-error">{error}</p>}
        <FormField label="Conference Dignitary">
          <select className="input" value={f.conference_dignitary_id} onChange={(e) => setField('conference_dignitary_id', e.target.value)} disabled={loadingConferenceDignitaries}>
            <option value="">{loadingConferenceDignitaries ? 'Loading conference roster...' : 'Select dignitary'}</option>
            {conferenceDignitaries.map((dignitary) => (
              <option key={dignitary.id} value={dignitary.id}>
                {dignitary.name} - {dignitary.title}
              </option>
            ))}
          </select>
        </FormField>

        {selected && (
          <div className="card profile-summary-card">
            <div className="profile-summary-title">{selected.name}</div>
            <div className="profile-summary-subtitle">{selected.title}</div>
            {(selected.church || selected.extension) && (
              <div className="profile-summary-meta">{selected.church || 'No church listed'}{selected.extension ? ` - ${selected.extension}` : ''}</div>
            )}
          </div>
        )}

        <div className="seating-assignment-box">
          <div className="seating-assignment-label">Session Seating</div>
          <div className="form-row">
            <div style={{ flex: 1.5 }}>
              <FormField label="Section">
                <select className="input" value={f.section} onChange={(e) => setField('section', e.target.value)} disabled={!openSections.length}>
                  <option value="">{openSections.length ? 'Unassigned' : 'Sections coming later'}</option>
                  {openSections.map((section) => (
                    <option key={section.id} value={section.id}>{section.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Row">
                <input className="input" type="number" min="1" value={f.row_num} onChange={(e) => setField('row_num', e.target.value ? parseInt(e.target.value, 10) : '')} />
              </FormField>
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Seat">
                <input className="input" type="number" min="1" value={f.col_num} onChange={(e) => setField('col_num', e.target.value ? parseInt(e.target.value, 10) : '')} />
              </FormField>
            </div>
          </div>
        </div>

        <FormField label="Protocol Notes">
          <textarea className="input" rows={3} placeholder="Optional session notes..." value={f.notes} onChange={(e) => setField('notes', e.target.value)} style={{ resize: 'vertical' }} />
        </FormField>

        <div className="form-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn btn-gold" onClick={handleSave} disabled={!f.conference_dignitary_id || saving || loadingConferenceDignitaries}>
            {saving ? 'Saving...' : 'Add To Session'}
          </button>
        </div>
      </div>
    </>
  );
}

function EditSessionDignitaryForm({ auditorium, init = {}, onSave, onCancel }) {
  const [f, setF] = useState({
    section: init.section || '',
    row_num: init.row_num || '',
    col_num: init.col_num || '',
    notes: init.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const openSections = getOpenSections(auditorium);

  const setField = (key, value) => setF((current) => ({ ...current, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const cleaned = Object.fromEntries(Object.entries(f).map(([key, value]) => [key, value === '' ? null : value]));
      await onSave(cleaned);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail.map((item) => item.msg || JSON.stringify(item)).join(', ')
          : err?.message || 'Failed to update dignitary';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ModalHeader title="Edit Session Dignitary" sub={`${init.name || ''}${init.title ? ` - ${init.title}` : ''}`} onClose={onCancel} />
      <div className="modal-body">
        {error && <p className="auth-error">{error}</p>}

        <div className="card profile-summary-card">
          <div className="profile-summary-title">{init.name}</div>
          <div className="profile-summary-subtitle">{init.title}</div>
          {(init.church || init.extension) && (
            <div className="profile-summary-meta">{init.church || 'No church listed'}{init.extension ? ` - ${init.extension}` : ''}</div>
          )}
        </div>

        <div className="seating-assignment-box">
          <div className="seating-assignment-label">Session Seating</div>
          <div className="form-row">
            <div style={{ flex: 1.5 }}>
              <FormField label="Section">
                <select className="input" value={f.section} onChange={(e) => setField('section', e.target.value)} disabled={!openSections.length}>
                  <option value="">{openSections.length ? 'Unassigned' : 'Sections coming later'}</option>
                  {openSections.map((section) => (
                    <option key={section.id} value={section.id}>{section.label}</option>
                  ))}
                </select>
              </FormField>
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Row">
                <input className="input" type="number" min="1" value={f.row_num} onChange={(e) => setField('row_num', e.target.value ? parseInt(e.target.value, 10) : '')} />
              </FormField>
            </div>
            <div style={{ flex: 1 }}>
              <FormField label="Seat">
                <input className="input" type="number" min="1" value={f.col_num} onChange={(e) => setField('col_num', e.target.value ? parseInt(e.target.value, 10) : '')} />
              </FormField>
            </div>
          </div>
        </div>

        <FormField label="Protocol Notes">
          <textarea className="input" rows={3} placeholder="Optional session notes..." value={f.notes} onChange={(e) => setField('notes', e.target.value)} style={{ resize: 'vertical' }} />
        </FormField>

        <div className="form-actions">
          <button className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
          <button className="btn btn-gold" onClick={handleSave} disabled={saving}>Save Changes</button>
        </div>
      </div>
    </>
  );
}

const DignitaryList = memo(function DignitaryList({ auditorium, attendees, canEdit, canManageStatus, onView, onEdit, onDelete, onStatus }) {
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');
  const openSections = getOpenSections(auditorium);
  const deferredQuery = useDeferredValue(q.trim().toLowerCase());
  const statusLabels = useMemo(() => {
    const labels = {};
    STATUSES.forEach((statusOption) => {
      labels[statusOption.id] = statusOption.label;
    });
    return labels;
  }, []);

  const filtered = useMemo(() => attendees.filter((dignitary) => {
    if (sectionFilter !== 'all' && dignitary.section !== sectionFilter) return false;
    if (statusFilter !== 'all' && dignitary.status !== statusFilter) return false;
    if (
      deferredQuery
      && !dignitary.name?.toLowerCase().includes(deferredQuery)
      && !dignitary.title?.toLowerCase().includes(deferredQuery)
    ) return false;
    return true;
  }), [attendees, deferredQuery, sectionFilter, statusFilter]);

  return (
    <div>
      <div className="filter-bar">
        <input className="input" placeholder="Search name or title..." value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <select className="input filter-select" value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
          <option value="all">All Sections</option>
          {openSections.map((section) => (
            <option key={section.id} value={section.id}>{section.label}</option>
          ))}
        </select>
        <select className="input filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          {STATUSES.map((statusOption) => (
            <option key={statusOption.id} value={statusOption.id}>{statusOption.label}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">List</div>
          <p className="empty-state-text">No session dignitaries found</p>
        </div>
      ) : (
        <div className="grid-cards">
          {filtered.map((dignitary) => {
            const section = getSectionById(auditorium, dignitary.section);
            const canUpdate = canManageStatus(dignitary);
            return (
              <div key={dignitary.id} className="card card-hover attendee-card" onClick={() => onView(dignitary)}>
                <div className="attendee-card-top">
                  <div className="attendee-avatar" style={{ borderColor: `${statusColor[dignitary.status] || 'var(--line-strong)'}55` }}>
                    {dignitary.picture_url
                      ? <img src={dignitary.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : getInitials(dignitary.name, '?')}
                  </div>
                  <div className="attendee-info">
                    <div className="attendee-name">{dignitary.name}</div>
                    <div className="attendee-title">{dignitary.title}</div>
                    {(dignitary.church || dignitary.extension) && (
                      <div className="attendee-church">{dignitary.church || 'No church listed'}{dignitary.extension ? ` - ${dignitary.extension}` : ''}</div>
                    )}
                  </div>
                </div>

                <div className="attendee-badges" style={{ marginBottom: 28 }}>
                  <span className={`badge ${dignitary.status}`}>{statusLabels[dignitary.status]}</span>
                  {section && (
                    <span className="section-tag" style={{ color: section.color, background: `${section.color}11`, borderColor: `${section.color}33` }}>
                      {section.label}
                    </span>
                  )}
                  {dignitary.row_num && dignitary.col_num && <span className="seat-ref">R{dignitary.row_num} / S{dignitary.col_num}</span>}
                </div>

                <div className="attendee-card-actions" onClick={(e) => e.stopPropagation()}>
                  <select
                    value={dignitary.status}
                    onChange={(e) => onStatus(dignitary.id, e.target.value)}
                    className="inline-status-select"
                    disabled={!canUpdate}
                    style={{ color: statusColor[dignitary.status] }}
                  >
                    {STATUSES.map((statusOption) => (
                      <option key={statusOption.id} value={statusOption.id}>{statusOption.label}</option>
                    ))}
                  </select>
                  {canEdit && (
                    <>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '3px 7px', fontSize: 13 }} onClick={() => onEdit(dignitary)}>Edit</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '3px 7px', fontSize: 13, color: 'var(--danger-strong)' }}
                        onClick={() => {
                          if (window.confirm('Remove this dignitary from the session?')) onDelete(dignitary.id);
                        }}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

function ImportArrangementModal({ targetSessionId, onClose, onSuccess }) {
  const [selectedConfId, setSelectedConfId] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);

  const { conferencesQuery } = useConferences();
  const { sessionsQuery } = useSessions(selectedConfId);
  const conferences = conferencesQuery.data || [];
  const sessions = (sessionsQuery.data || []).filter((session) => session.id !== targetSessionId);

  const handleSelectSession = async (sessionId) => {
    setSelectedSessionId(sessionId);
    if (sessionId) {
      try {
        const { data } = await api.get(`/sessions/${sessionId}/dignitaries`);
        setPreview(data || []);
      } catch {
        setPreview([]);
      }
    } else {
      setPreview(null);
    }
  };

  const handleImport = async () => {
    setImporting(true);
    setError('');
    try {
      await api.post(`/sessions/${targetSessionId}/clone-from/${selectedSessionId}`);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <ModalHeader title="Import Arrangement" onClose={onClose} />
      <div className="modal-body">
        {error && <p className="auth-error">{error}</p>}
        <FormField label="Conference">
          <select className="input" value={selectedConfId} onChange={(e) => { setSelectedConfId(e.target.value); setSelectedSessionId(''); setPreview(null); }}>
            <option value="">Select conference</option>
            {conferences.map((conference) => (
              <option key={conference.id} value={conference.id}>
                {conference.name}{conference.date ? ` (${formatDisplayDate(conference.date)})` : ''}
              </option>
            ))}
          </select>
        </FormField>

        {selectedConfId && (
          <FormField label="Session">
            {sessionsQuery.isLoading ? (
              <p className="page-subtitle">Loading sessions...</p>
            ) : (
              <select className="input" value={selectedSessionId} onChange={(e) => handleSelectSession(e.target.value)}>
                <option value="">Select session</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}{session.date ? ` (${formatDisplayDate(session.date)})` : ''}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        )}

        {preview !== null && (
          <div className="card profile-summary-card">
            <div className="profile-summary-title">Import Preview</div>
            <div className="profile-summary-meta">
              {preview.length === 0
                ? 'This session has no dignitaries to import.'
                : `${preview.length} dignitaries will be imported with status reset to Pending.`}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={importing}>Cancel</button>
          <button className="btn btn-gold" onClick={handleImport} disabled={!selectedSessionId || !preview?.length || importing}>
            {importing ? 'Importing...' : `Import ${preview?.length || 0} Dignitaries`}
          </button>
        </div>
      </div>
    </>
  );
}

function SectionConfigModal({ auditorium, sessionId, currentConfig, onClose, onSaved }) {
  const openSections = getOpenSections(auditorium);
  const defaultConfig = getDefaultConfig(auditorium);
  const [cfg, setCfg] = useState(() => {
    const merged = {};
    openSections.forEach((section) => {
      const current = currentConfig?.[section.id] || defaultConfig[section.id] || { rows: 5, cols: 5 };
      merged[section.id] = { rows: String(current.rows), cols: String(current.cols) };
    });
    return merged;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (sectionId, field, value) => {
    setCfg((current) => ({ ...current, [sectionId]: { ...current[sectionId], [field]: value } }));
  };

  const normalizeField = (sectionId, field) => {
    setCfg((current) => ({
      ...current,
      [sectionId]: {
        ...current[sectionId],
        [field]: String(normalizeSectionCount(current[sectionId]?.[field], 1)),
      },
    }));
  };

  const resetDefaults = () => {
    const defaults = {};
    openSections.forEach((section) => {
      const sectionDefaults = defaultConfig[section.id] || { rows: 5, cols: 5 };
      defaults[section.id] = {
        rows: String(sectionDefaults.rows),
        cols: String(sectionDefaults.cols),
      };
    });
    setCfg(defaults);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const normalizedConfig = Object.fromEntries(
        Object.entries(cfg).map(([sectionId, sectionConfig]) => [
          sectionId,
          {
            rows: normalizeSectionCount(sectionConfig.rows, 1),
            cols: normalizeSectionCount(sectionConfig.cols, 1),
          },
        ]),
      );
      await api.patch(`/sessions/${sessionId}/seating-config`, normalizedConfig);
      onSaved();
      onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to save config');
    } finally {
      setSaving(false);
    }
  };

  const totalSeats = Object.values(cfg).reduce((sum, sectionConfig) => {
    const rows = normalizeSectionCount(sectionConfig.rows, 0) || 0;
    const cols = normalizeSectionCount(sectionConfig.cols, 0) || 0;
    return sum + (rows * cols);
  }, 0);

  return (
    <>
      <ModalHeader title="Configure Sections" onClose={onClose} />
      <div className="modal-body">
        {error && <p className="auth-error">{error}</p>}

        {!openSections.length ? (
          <div className="empty-state" style={{ minHeight: 220 }}>
            <div className="empty-state-icon">Map</div>
            <p className="empty-state-text">This auditorium has no configurable sections yet</p>
          </div>
        ) : (
          <>
            <div className="config-grid">
              {openSections.map((section) => {
                const sectionConfig = cfg[section.id];
                const rows = normalizeSectionCount(sectionConfig.rows, 0) || 0;
                const cols = normalizeSectionCount(sectionConfig.cols, 0) || 0;
                return (
                  <div key={section.id} className="card config-card">
                    <div className="config-card-head">
                      <div className="seat-grid-legend-dot" style={{ background: section.color }} />
                      <div>
                        <div className="profile-summary-title" style={{ fontSize: 16 }}>{section.label}</div>
                        <div className="profile-summary-meta">{rows * cols} seats</div>
                      </div>
                    </div>
                    <div className="config-card-row">
                      <FormField label="Rows">
                        <input
                          className="input"
                          type="number"
                          min="1"
                          max="20"
                          value={sectionConfig.rows}
                          onChange={(e) => update(section.id, 'rows', e.target.value)}
                          onBlur={() => normalizeField(section.id, 'rows')}
                        />
                      </FormField>
                      <FormField label="Seats">
                        <input
                          className="input"
                          type="number"
                          min="1"
                          max="20"
                          value={sectionConfig.cols}
                          onChange={(e) => update(section.id, 'cols', e.target.value)}
                          onBlur={() => normalizeField(section.id, 'cols')}
                        />
                      </FormField>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="config-footer">
              <span className="page-subtitle"><strong>{totalSeats}</strong> seats</span>
              <button className="btn btn-ghost btn-sm" onClick={resetDefaults}>Reset Defaults</button>
            </div>
          </>
        )}

        <div className="form-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-gold" onClick={handleSave} disabled={saving || !openSections.length}>
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>
    </>
  );
}

export function Session() {
  const { sessionId } = useParams();
  const { isEditorOrAdmin, canManageConferenceDignitary } = useAuth();
  const [tab, setTab] = useState('map');
  const [activeSec, setActiveSec] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingAtn, setEditingAtn] = useState(null);
  const [viewingAtn, setViewingAtn] = useState(null);
  const [prefillLoc, setPrefillLoc] = useState(null);

  const queryClient = useQueryClient();
  const { data: sessionInfo, isLoading: loadingInfo } = useSessionData(sessionId);
  const { dignitariesQuery, createDignitary, updateDignitary, updateDignitaryStatus, deleteDignitary } = useDignitaries(sessionId);
  const { data: attendees = [], isLoading: loadingAtt } = dignitariesQuery;

  const confId = sessionInfo?.conf?.id;
  const conferenceRoster = useConferenceDignitaries(confId, showAddModal);
  const { data: conferenceDignitaries = [], isLoading: loadingConferenceRoster } = conferenceRoster.conferenceDignitariesQuery;
  const auditorium = sessionInfo?.conf?.auditorium;
  const { stats, usedConferenceDignitaryIds } = useMemo(() => {
    const statusCounts = {};
    const usedIds = new Set();

    attendees.forEach((dignitary) => {
      statusCounts[dignitary.status] = (statusCounts[dignitary.status] || 0) + 1;
      if (dignitary.conference_dignitary_id) {
        usedIds.add(dignitary.conference_dignitary_id);
      }
    });

    return {
      stats: STATUSES.map((statusOption) => ({ ...statusOption, cnt: statusCounts[statusOption.id] || 0 })),
      usedConferenceDignitaryIds: usedIds,
    };
  }, [attendees]);
  const availableConferenceDignitaries = useMemo(
    () => conferenceDignitaries.filter((dignitary) => !usedConferenceDignitaryIds.has(dignitary.id)),
    [conferenceDignitaries, usedConferenceDignitaryIds],
  );
  const supportsSections = auditoriumSupportsSections(auditorium);

  if (loadingInfo || loadingAtt) return <Loader text="Loading session..." />;
  if (!sessionInfo || !sessionInfo.conf) return <div className="empty-state" style={{ marginTop: 100 }}>Session not found.</div>;

  const { session, conf } = sessionInfo;

  const canManageStatus = (dignitary) => canManageConferenceDignitary(dignitary.conference_dignitary_id);

  const handleSeatClick = (rowNum, colNum, dignitary) => {
    if (dignitary) {
      setViewingAtn(dignitary);
    } else if (isEditorOrAdmin) {
      setPrefillLoc({ section: activeSec, row_num: rowNum, col_num: colNum });
      setShowAddModal(true);
    }
  };

  return (
    <div>
      <Header confName={conf.name} sessionName={session.name} backTo={`/conference/${conf.id}`} backLabel={conf.name} />
      <div className="page-container--wide fade-in">
        <div className="page-header page-header--start">
          <div>
            <h1 className="page-title">{session.name}</h1>
            <p className="page-subtitle">
              {conf.name}
              {session.date ? ` - ${formatDisplayDate(session.date)}` : ''}
              {session.time ? ` at ${formatTimeLabel(session.time)}` : ''}
            </p>
            {conf.auditorium?.name && <div className="page-chip-row"><span className="page-chip">{conf.auditorium.name}</span></div>}
          </div>
          <div className="page-header-actions">
            {isEditorOrAdmin && <button className="btn btn-gold btn-sm" onClick={() => setShowAddModal(true)}>Add From Conference</button>}
            {isEditorOrAdmin && <button className="btn btn-outline btn-sm" onClick={() => setShowImportModal(true)}>Import Arrangement</button>}
            {isEditorOrAdmin && <button className="btn btn-outline btn-sm" onClick={() => setShowConfigModal(true)}>Sections</button>}
          </div>
        </div>

        <div className="stats-bar">
          <div className="card stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-strong)' }}>{attendees.length}</div>
            <div className="stat-label">In Session</div>
          </div>
          {stats.map((statusOption) => (
            <div key={statusOption.id} className="card stat-card">
              <div className="stat-value" style={{ color: statusOption.color }}>{statusOption.cnt}</div>
              <div className="stat-label">{statusOption.label}</div>
            </div>
          ))}
        </div>

        <div className="tab-bar">
          {[
            { id: 'map', label: 'Seating Map' },
            { id: 'list', label: 'Dignitary List' },
          ].map((tabOption) => (
            <button key={tabOption.id} onClick={() => setTab(tabOption.id)} className={`tab-btn ${tab === tabOption.id ? 'active' : ''}`}>
              {tabOption.label}
            </button>
          ))}
        </div>

        {tab === 'map' && (
          <>
            <VenueMap auditorium={auditorium} cfg={session.seating_config} attendees={attendees} activeSec={activeSec} onSec={(id) => setActiveSec(activeSec === id ? null : id)} />
            {supportsSections && activeSec && (
              <div style={{ marginTop: 16 }} className="fade-in">
                <SeatGrid auditorium={auditorium} sectionId={activeSec} cfg={session.seating_config} attendees={attendees} canEdit={isEditorOrAdmin} onSeatClick={handleSeatClick} />
              </div>
            )}
          </>
        )}

        {tab === 'list' && (
          <DignitaryList
            auditorium={auditorium}
            attendees={attendees}
            canEdit={isEditorOrAdmin}
            canManageStatus={canManageStatus}
            onView={setViewingAtn}
            onEdit={setEditingAtn}
            onDelete={(id) => deleteDignitary.mutate(id)}
            onStatus={(id, statusValue) => updateDignitaryStatus.mutate({ id, status: statusValue })}
          />
        )}
      </div>

      {showAddModal && (
        <Modal onClose={() => { setShowAddModal(false); setPrefillLoc(null); }}>
          <AddDignitaryToSessionForm
            auditorium={auditorium}
            conferenceDignitaries={availableConferenceDignitaries}
            initialAssignment={prefillLoc}
            loadingConferenceDignitaries={loadingConferenceRoster}
            onSave={async (data) => {
              await createDignitary.mutateAsync(data);
              setShowAddModal(false);
              setPrefillLoc(null);
            }}
            onCancel={() => {
              setShowAddModal(false);
              setPrefillLoc(null);
            }}
          />
        </Modal>
      )}

      {editingAtn && (
        <Modal onClose={() => setEditingAtn(null)}>
          <EditSessionDignitaryForm
            auditorium={auditorium}
            init={editingAtn}
            onSave={async (data) => {
              await updateDignitary.mutateAsync({ id: editingAtn.id, data });
              setEditingAtn(null);
              if (viewingAtn) setViewingAtn(null);
            }}
            onCancel={() => setEditingAtn(null)}
          />
        </Modal>
      )}

      {viewingAtn && (
        <Modal onClose={() => setViewingAtn(null)}>
          <AttendeeProfile
            auditorium={auditorium}
            atn={viewingAtn}
            canEdit={isEditorOrAdmin}
            canManageStatus={canManageStatus(viewingAtn)}
            onEdit={() => {
              if (!isEditorOrAdmin) return;
              setEditingAtn(viewingAtn);
              setViewingAtn(null);
            }}
            onStatus={(statusValue) => {
              updateDignitaryStatus.mutate({ id: viewingAtn.id, status: statusValue });
              setViewingAtn({ ...viewingAtn, status: statusValue });
            }}
            onClose={() => setViewingAtn(null)}
          />
        </Modal>
      )}

      {showImportModal && (
        <Modal onClose={() => setShowImportModal(false)}>
          <ImportArrangementModal
            targetSessionId={sessionId}
            onClose={() => setShowImportModal(false)}
            onSuccess={() => dignitariesQuery.refetch()}
          />
        </Modal>
      )}

      {showConfigModal && (
        <Modal onClose={() => setShowConfigModal(false)}>
          <SectionConfigModal
            auditorium={auditorium}
            sessionId={sessionId}
            currentConfig={session.seating_config}
            onClose={() => setShowConfigModal(false)}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ['sessionData', sessionId] })}
          />
        </Modal>
      )}
    </div>
  );
}
