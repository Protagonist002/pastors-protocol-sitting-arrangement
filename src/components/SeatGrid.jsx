import { memo, useMemo } from 'react';

import { STATUSES, getEffectiveConfig, getSectionById, statusColor } from '../lib/constants';

export const SeatGrid = memo(function SeatGrid({ auditorium, sectionId, cfg, attendees, canEdit, onSeatClick }) {
  const sec = getSectionById(auditorium, sectionId);
  const cfgMap = getEffectiveConfig(auditorium, cfg);
  const sectionConfig = cfgMap[sectionId] || { rows: 5, cols: 5 };
  const statusLabels = useMemo(() => {
    const labels = {};
    STATUSES.forEach((statusOption) => {
      labels[statusOption.id] = statusOption.label;
    });
    return labels;
  }, []);
  const seatAssignments = useMemo(() => {
    const assignments = {};
    attendees.forEach((dignitary) => {
      if (dignitary.section !== sectionId || !dignitary.row_num || !dignitary.col_num) return;
      assignments[`${dignitary.row_num}-${dignitary.col_num}`] = dignitary;
    });
    return assignments;
  }, [attendees, sectionId]);
  const rows = useMemo(() => Array.from({ length: sectionConfig.rows }, (_, index) => index + 1), [sectionConfig.rows]);
  const cols = useMemo(() => Array.from({ length: sectionConfig.cols }, (_, index) => index + 1), [sectionConfig.cols]);

  return (
    <div className="seat-grid-wrap fade-in">
      <div className="seat-grid-header">
        <div className="seat-grid-legend-dot" style={{ width: 12, height: 12, borderRadius: 3, background: sec?.color }} />
        <h4 className="seat-grid-title">{sec?.label}</h4>
        <span className="seat-grid-info">{sectionConfig.rows} rows x {sectionConfig.cols} seats</span>
        <div className="seat-grid-legend">
          {STATUSES.map((statusOption) => (
            <div key={statusOption.id} className="seat-grid-legend-item">
              <div className="seat-grid-legend-dot" style={{ background: statusOption.color }} />
              {statusOption.label}
            </div>
          ))}
        </div>
      </div>

        <div className="seat-grid-scroll">
          <div className="seat-grid-cols">
          {cols.map((col) => (
            <div key={col} className="seat-grid-col-label">{col}</div>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row} className="seat-grid-row">
            <div className="seat-grid-row-label">{row}</div>
            {cols.map((col) => {
              const dignitary = seatAssignments[`${row}-${col}`];
              return (
                <div
                  key={col}
                  className={`seat ${dignitary ? `occ-${dignitary.status}` : 'empty'}`}
                  onClick={() => onSeatClick(row, col, dignitary)}
                  title={dignitary ? `${dignitary.name} - ${statusLabels[dignitary.status]}` : `Seat ${row}-${col}`}
                  style={{
                    background: dignitary ? `${statusColor[dignitary.status]}1a` : 'var(--surface-soft)',
                    borderColor: dignitary ? `${statusColor[dignitary.status]}55` : 'var(--line-strong)',
                  }}
                >
                  {dignitary ? (
                    <span style={{ color: statusColor[dignitary.status], fontSize: 8, fontWeight: 700 }}>
                      {dignitary.name?.split(' ').map((word) => word[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  ) : canEdit ? <span style={{ color: 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}>+</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="seat-grid-hint">
        {canEdit ? 'Click an occupied seat to view the profile, or an empty seat to assign a dignitary.' : 'Click a seat to view the dignitary profile.'}
      </p>
    </div>
  );
});
