import { STATUSES, getSectionById, statusColor } from '../lib/constants';
import { getInitials } from '../lib/formatters';
import { ModalHeader } from './UI';

export function AttendeeProfile({ auditorium, atn, canEdit, canRemoveFromMap, canManageStatus, onEdit, onRemoveFromMap, onStatus, onLocateSeat, onClose }) {
  const sec = getSectionById(auditorium, atn.section);
  const hasSeatAssignment = Boolean(atn.section && atn.row_num && atn.col_num);

  return (
    <>
      <ModalHeader
        title="Dignitary Profile"
        onClose={onClose}
      />
      <div className="modal-body">
        <div className="profile-header">
          <div className="profile-avatar" style={{ border: `3px solid ${statusColor[atn.status] || 'var(--line-strong)'}` }}>
            {atn.picture_url
              ? <img src={atn.picture_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : getInitials(atn.name, '?')}
          </div>
          <div style={{ flex: 1 }}>
            <h2 className="profile-name">{atn.name}</h2>
            <p className="profile-title-text">{atn.title}</p>
            <div className="profile-tags">
              <span className={`badge ${atn.status}`}>{STATUSES.find((status) => status.id === atn.status)?.label}</span>
              {sec && (
                <span className="section-tag" style={{ color: sec.color, background: `${sec.color}11`, borderColor: `${sec.color}33` }}>
                  {sec.label}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="profile-info-grid">
          {[
            ['Seat Assignment', atn.row_num && atn.col_num ? `Row ${atn.row_num}, Seat ${atn.col_num}` : 'Not yet assigned'],
            ['Section', sec?.label || 'Not assigned'],
            ['Church', atn.church || 'Not provided'],
            ['Extension / Branch', atn.extension || 'Not provided'],
          ].map(([label, value]) => (
            <div key={label} className="profile-info-cell">
              <div className="profile-info-label">{label}</div>
              <div className="profile-info-value">{value}</div>
            </div>
          ))}
        </div>

        {atn.notes && (
          <div className="profile-notes">
            <div className="profile-info-label">Protocol Notes</div>
            <p className="profile-notes-text">{atn.notes}</p>
          </div>
        )}

        <div className="status-section">
          <div className="status-section-label">Arrival Status</div>
          <div className="status-buttons">
            {STATUSES.map((statusOption) => (
              <button
                key={statusOption.id}
                onClick={() => canManageStatus && onStatus(statusOption.id)}
                className={`status-btn ${atn.status === statusOption.id ? 'active' : ''}`}
                disabled={!canManageStatus}
                style={{
                  borderColor: `${statusOption.color}${atn.status === statusOption.id ? '' : '44'}`,
                  background: atn.status === statusOption.id ? `${statusOption.color}22` : 'transparent',
                  color: statusOption.color,
                }}
              >
                {statusOption.label}
              </button>
            ))}
          </div>
        </div>

        <div className="profile-modal-actions">
          <button className="btn btn-outline btn-sm" onClick={onClose}>Close</button>
          {hasSeatAssignment && (
            <button className="btn btn-outline btn-sm" onClick={() => onLocateSeat?.(atn)}>Show Seating</button>
          )}
          {canRemoveFromMap && (
            <button
              className="btn btn-outline btn-sm"
              style={{ color: 'var(--danger-strong)' }}
              onClick={() => {
                if (window.confirm(`Remove ${atn.name} from this seat?`)) onRemoveFromMap();
              }}
            >
              Remove From Map
            </button>
          )}
          {canEdit && <button className="btn btn-gold btn-sm" onClick={onEdit}>Edit Seating Details</button>}
        </div>
      </div>
    </>
  );
}
