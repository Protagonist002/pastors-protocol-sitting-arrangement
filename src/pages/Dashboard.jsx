import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/auth-context';
import { Loader, Modal, ModalHeader, FormField } from '../components/UI';
import { Header } from '../components/Header';
import { useConferences } from '../hooks/useConferences';
import { useAuditoriums } from '../hooks/useAuditoriums';
import { formatDisplayDate } from '../lib/formatters';

function toDateInputValue(value) {
  if (!value || typeof value !== 'string') return '';
  return value.slice(0, 10);
}

function toTimeInputValue(value) {
  if (!value || typeof value !== 'string') return '';
  return value.slice(0, 5);
}

function formatTimeLabel(value) {
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

function ConfForm({ auditoriums = [], isEdit, loadingAuditoriums = false, onSave, onCancel }) {
  const [f, setF] = useState({ name:'', date:'', time:'', venue:'', description:'', auditorium_id:'' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const s = (k, v) => setF(x => ({ ...x, [k]:v }));

  const handleSave = async () => {
    if (!f.name) return;
    setSaving(true);
    setError('');
    try {
      const cleaned = Object.fromEntries(
        Object.entries(f).filter(([, value]) => value !== '')
      );
      await onSave(cleaned);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      const msg = typeof detail === 'string' ? detail
        : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
        : err?.message || 'Failed to create conference';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };
  
  return <>
    <ModalHeader title={isEdit ? 'Edit Conference' : 'New Conference'} onClose={onCancel}/>
    <div className="modal-body">
      {error && <p style={{ color: '#ef4444', marginBottom: 12, fontSize: 13, padding: 8, background: '#ef444422', borderRadius: 6 }}>{error}</p>}
      <FormField label="Conference Name *"><input className="input" placeholder="General Council 2025" value={f.name} onChange={e=>s('name',e.target.value)}/></FormField>
      <div className="form-grid-2">
        <FormField label="Date"><input className="input" type="date" value={toDateInputValue(f.date)} onChange={e=>s('date',e.target.value)}/></FormField>
        <FormField label="Time"><input className="input" type="time" step="60" value={toTimeInputValue(f.time)} onChange={(e) => handleTimeSelection(e.currentTarget, (value) => s('time', value))}/></FormField>
      </div>
      <FormField label="Venue"><input className="input" placeholder="National Auditorium, Accra" value={f.venue} onChange={e=>s('venue',e.target.value)}/></FormField>
      <FormField label="Auditorium *">
        <select className="input" value={f.auditorium_id} onChange={e=>s('auditorium_id', e.target.value)} disabled={loadingAuditoriums}>
          <option value="">{loadingAuditoriums ? 'Loading auditoriums...' : 'Select auditorium'}</option>
          {auditoriums.map((auditorium) => (
            <option key={auditorium.id} value={auditorium.id}>{auditorium.name}</option>
          ))}
        </select>
      </FormField>
      <FormField label="Description"><textarea className="input" rows={3} placeholder="Brief overview…" value={f.description} onChange={e=>s('description',e.target.value)} style={{ resize:'vertical' }}/></FormField>
      <div className="form-actions">
        <button className="btn btn-outline" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn btn-gold" onClick={handleSave} disabled={!f.name || !f.auditorium_id || saving || loadingAuditoriums}>{saving ? 'Creating...' : (isEdit ? 'Save Changes' : 'Create Conference')}</button>
      </div>
    </div>
  </>;
}

export function Dashboard() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);

  const { conferencesQuery, createConference, deleteConference } = useConferences();
  const auditoriumsQuery = useAuditoriums(showNew);
  const { data: confs, isLoading } = conferencesQuery;
  const { data: auditoriums = [], isLoading: loadingAuditoriums } = auditoriumsQuery;

  if (isLoading) return <Loader text="Loading Conferences..." />;

  const confList = confs || [];
  return (
    <div>
      <Header />
      <div className="page-container fade-in">
        <div className="dashboard-shell">
          <section className="dashboard-hero">
            <div className="card dashboard-hero-main">
              <div className="dashboard-hero-top">
                <div className="dashboard-hero-copy">
                  <h1 className="dashboard-hero-title">Conferences</h1>
                  <p className="dashboard-hero-subtitle">{confList.length} conference{confList.length!==1?'s':''} on record</p>
                </div>
                {isAdmin && (
                  <button className="btn btn-gold dashboard-hero-action" onClick={() => setShowNew(true)}>
                    + NEW CONFERENCE
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="dashboard-list-block">
            {confList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p className="empty-state-text">No conferences yet</p>
                {isAdmin && <p className="empty-state-sub">Create your first conference to get started</p>}
              </div>
            ) : (
              <div className="grid-cards grid-cards--wide">
                {confList.map((c, i) => (
                  <div key={c.id} className="card card-hover card-content dashboard-conference-card"
                    style={{ animationDelay:`${i*.05}s` }}
                    onClick={() => navigate(`/conference/${c.id}`)}>
                    <div className="dashboard-card-head">
                      <div style={{ flex:1, minWidth:0 }}>
                        <div className="dashboard-card-kicker">Conference</div>
                        <h3 className="card-title dashboard-card-title">{c.name}</h3>
                        <p className="card-meta dashboard-card-meta">
                          {formatDisplayDate(c.date, '—')}
                          {c.time ? ` at ${formatTimeLabel(c.time)}` : ''}
                          {c.venue ? ` • ${c.venue}` : ''}
                        </p>
                      </div>
                      {isAdmin && (
                        <button className="btn btn-ghost btn-sm dashboard-delete-btn"
                          onClick={e => { e.stopPropagation(); if (window.confirm('Delete this conference and all its sessions?')) deleteConference.mutate(c.id); }}>🗑</button>
                      )}
                    </div>
                    {c.description && <p className="card-desc dashboard-card-desc">{c.description}</p>}
                    <div className="dashboard-card-tags">
                      {c.auditorium?.name && (
                        <span className="dashboard-card-tag">{c.auditorium.name}</span>
                      )}
                      <span className="dashboard-card-link">
                        Manage Sessions →
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showNew && (
        <Modal onClose={() => setShowNew(false)}>
          <ConfForm auditoriums={auditoriums} loadingAuditoriums={loadingAuditoriums} isEdit={false} onSave={async (f) => {
            try {
              await createConference.mutateAsync(f);
              setShowNew(false);
            } catch (err) {
              const detail = err?.response?.data?.detail;
              const msg = typeof detail === 'string' ? detail
                : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join(', ')
                : typeof err?.message === 'string' ? err.message
                : 'Failed to create conference';
              throw new Error(msg);
            }
          }} onCancel={() => setShowNew(false)} />
        </Modal>
      )}
    </div>
  );
}
