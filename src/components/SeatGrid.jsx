import { memo, useEffect, useMemo, useRef } from 'react';

import { STATUSES, getEffectiveConfig, getSectionById, statusColor } from '../lib/constants';
import { getInitials } from '../lib/formatters';

export const SeatGrid = memo(function SeatGrid({ auditorium, sectionId, cfg, attendees, protocolSeats = [], canEdit, onSeatClick, highlightedSeat }) {
  const gridScrollRef = useRef(null);
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
      assignments[`${dignitary.row_num}-${dignitary.col_num}`] = {
        type: 'dignitary',
        data: dignitary,
      };
    });
    protocolSeats.forEach((protocolSeat) => {
      if (protocolSeat.section !== sectionId || !protocolSeat.row_num || !protocolSeat.col_num) return;
      const key = `${protocolSeat.row_num}-${protocolSeat.col_num}`;
      if (assignments[key]) return;
      assignments[key] = {
        type: 'protocol',
        data: protocolSeat,
      };
    });
    return assignments;
  }, [attendees, protocolSeats, sectionId]);
  const rows = useMemo(() => Array.from({ length: sectionConfig.rows }, (_, index) => index + 1), [sectionConfig.rows]);
  const cols = useMemo(() => Array.from({ length: sectionConfig.cols }, (_, index) => index + 1), [sectionConfig.cols]);
  const activeHighlight = highlightedSeat?.section === sectionId ? highlightedSeat : null;

  useEffect(() => {
    if (!activeHighlight || !gridScrollRef.current) return undefined;

    const timer = window.setTimeout(() => {
      const target = gridScrollRef.current.querySelector(
        `[data-seat-row="${activeHighlight.row_num}"][data-seat-col="${activeHighlight.col_num}"]`,
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, 120);

    return () => window.clearTimeout(timer);
  }, [activeHighlight]);

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
          <div className="seat-grid-legend-item">
            <div className="seat-grid-legend-dot seat-grid-legend-dot--protocol" />
            Protocol
          </div>
        </div>
      </div>

        <div className="seat-grid-scroll" ref={gridScrollRef}>
          <div className="seat-grid-cols">
          {cols.map((col) => (
            <div key={col} className="seat-grid-col-label">{col}</div>
          ))}
        </div>

        {rows.map((row) => (
          <div key={row} className="seat-grid-row">
            <div className="seat-grid-row-label">{row}</div>
            {cols.map((col) => {
              const occupant = seatAssignments[`${row}-${col}`];
              const dignitary = occupant?.type === 'dignitary' ? occupant.data : null;
              const protocolSeat = occupant?.type === 'protocol' ? occupant.data : null;
              const protocolName = protocolSeat?.protocol_name || protocolSeat?.protocol_profile?.full_name || 'Protocol officer';
              const occupantName = dignitary?.name || protocolName;
              const occupantImage = dignitary?.picture_url || protocolSeat?.protocol_picture_url || protocolSeat?.protocol_profile?.picture_url || '';
              const occupantInitials = getInitials(occupantName, '?');
              const isHighlighted = activeHighlight?.row_num === row && activeHighlight?.col_num === col;
              return (
                <div
                  key={col}
                  className={`seat ${dignitary ? `occ-${dignitary.status}` : protocolSeat ? 'occ-protocol' : 'empty'}${isHighlighted ? ' seat--highlighted' : ''}`}
                  data-seat-row={row}
                  data-seat-col={col}
                  onClick={() => onSeatClick(row, col, occupant)}
                  title={
                    dignitary
                      ? `${dignitary.name} - ${statusLabels[dignitary.status]}`
                      : protocolSeat
                        ? `${protocolName} - Protocol${protocolSeat.assigned_dignitary?.name ? ` for ${protocolSeat.assigned_dignitary.name}` : ''}`
                        : `Seat ${row}-${col}`
                  }
                  style={{
                    background: dignitary ? `${statusColor[dignitary.status]}1a` : protocolSeat ? 'rgba(14, 165, 233, 0.15)' : 'var(--surface-soft)',
                    borderColor: dignitary ? `${statusColor[dignitary.status]}55` : protocolSeat ? 'rgba(14, 165, 233, 0.6)' : 'var(--line-strong)',
                  }}
                >
                  {dignitary ? (
                    <span className="seat-person" style={{ color: statusColor[dignitary.status] }}>
                      <span className="seat-avatar">
                        {occupantImage ? <img src={occupantImage} alt="" /> : occupantInitials}
                      </span>
                      <span className="seat-name">{occupantName}</span>
                    </span>
                  ) : protocolSeat ? (
                    <span className="seat-person seat-person--protocol">
                      <span className="seat-avatar">
                        {occupantImage ? <img src={occupantImage} alt="" /> : occupantInitials}
                      </span>
                      <span className="seat-name">{occupantName}</span>
                    </span>
                  ) : canEdit ? <span style={{ color: 'var(--text-faint)', fontSize: 16, lineHeight: 1 }}>+</span> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="seat-grid-hint">
        {canEdit ? 'Click an occupied seat to view details, or an empty seat to assign a dignitary or protocol officer.' : 'Click a seat to view details.'}
      </p>
    </div>
  );
});
