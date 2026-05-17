import { memo, useMemo } from 'react';

import {
  auditoriumSupportsSections,
  getAuditoriumHotspots,
  getAuditoriumImageUrl,
  getAuditoriumSections,
  getDefaultConfig,
  getSectionById,
} from '../lib/constants';

export const VenueMap = memo(function VenueMap({ auditorium, cfg, attendees, activeSec, onSec }) {
  const sections = getAuditoriumSections(auditorium);
  const defaultConfig = getDefaultConfig(auditorium);
  const imageUrl = getAuditoriumImageUrl(auditorium);
  const hotspots = getAuditoriumHotspots(auditorium);
  const cfgMap = useMemo(() => ({ ...defaultConfig, ...(cfg || {}) }), [cfg, defaultConfig]);
  const sectionCounts = useMemo(() => {
    const counts = {};
    attendees.forEach((dignitary) => {
      if (!dignitary.section) return;
      counts[dignitary.section] = (counts[dignitary.section] || 0) + 1;
    });
    return counts;
  }, [attendees]);

  const getCount = (id) => sectionCounts[id] || 0;

  const getTotal = (id) => {
    const sectionConfig = cfgMap[id] || defaultConfig[id];
    return (sectionConfig?.rows || 0) * (sectionConfig?.cols || 0);
  };

  const withAlpha = (hex, alpha) => {
    if (!hex || !hex.startsWith('#')) {
      return `rgba(201, 168, 76, ${alpha})`;
    }
    const normalized = hex.replace('#', '');
    const value = normalized.length === 3
      ? normalized.split('').map((char) => char + char).join('')
      : normalized;
    const intValue = Number.parseInt(value, 16);
    const red = (intValue >> 16) & 255;
    const green = (intValue >> 8) & 255;
    const blue = intValue & 255;
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  };

  const renderImageMap = () => (
    <div className="venue-map">
      <div className="venue-map-frame">
        <div className="venue-map-stage">
          <img src={imageUrl} alt={auditorium?.name || 'Auditorium map'} className="venue-map-image" />
          {hotspots.map((hotspot, index) => {
            const section = getSectionById(auditorium, hotspot.id);
            if (!section) return null;
            if (hotspot.interactive === false) return null;

            const count = getCount(hotspot.id);
            const total = getTotal(hotspot.id);
            const isActive = activeSec === hotspot.id;
            const isClosed = hotspot.closed || section.closed;
            const showLabel = hotspot.showLabel !== false;
            const showMeta = hotspot.showMeta !== false && !isClosed && total > 0;
            const showClosed = hotspot.showClosed !== false && isClosed;
            const borderAlpha = isActive ? 0.96 : hotspot.borderAlpha ?? 0.78;
            const backgroundAlpha = isClosed
              ? 0.08
              : isActive
                ? hotspot.activeBackgroundAlpha ?? 0.28
                : hotspot.backgroundAlpha ?? 0.18;

            return (
              <button
                key={`${hotspot.id}-${index}`}
                type="button"
                className={`venue-map-hotspot${isActive ? ' active' : ''}${isClosed ? ' closed' : ''}`}
                style={{
                  left: `${hotspot.left}%`,
                  top: `${hotspot.top}%`,
                  width: `${hotspot.width}%`,
                  height: `${hotspot.height}%`,
                  borderRadius: hotspot.radius ? `${hotspot.radius}px` : undefined,
                  borderColor: isActive ? '#d6bb75' : withAlpha(section.color, borderAlpha),
                  background: isClosed ? 'rgba(255, 255, 255, 0.08)' : withAlpha(section.color, backgroundAlpha),
                  boxShadow: isActive && hotspot.activeShadow ? hotspot.activeShadow : undefined,
                }}
                onClick={() => {
                  if (!isClosed) {
                    onSec(activeSec === hotspot.id ? null : hotspot.id);
                  }
                }}
                aria-label={isClosed ? `${section.label} closed` : `${section.label} ${count} of ${total} assigned`}
                title={isClosed ? `${section.label} (Closed)` : `${section.label} - ${count} of ${total} assigned`}
              >
                {showLabel && <span className="venue-map-hotspot-label">{section.label}</span>}
                {showMeta && <span className="venue-map-hotspot-meta">{count}/{total}</span>}
                {showClosed && <span className="venue-map-hotspot-closed">Closed</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!auditoriumSupportsSections(auditorium)) {
    return (
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ color: '#e2f0e6', marginBottom: 4 }}>{auditorium?.name || 'Auditorium Preview'}</h3>
            <p style={{ color: '#8cb398', fontSize: 13 }}>Sections for this auditorium will be configured later. You can still add conference dignitaries and session attendees now.</p>
          </div>
        </div>
        {imageUrl ? (
          <div className="venue-map-static-frame">
            <img src={imageUrl} alt={auditorium?.name || 'Auditorium map'} className="venue-map-static-image" />
          </div>
        ) : (
          <div className="empty-state" style={{ minHeight: 220 }}>
            <div className="empty-state-icon">Map</div>
            <p className="empty-state-text">No auditorium preview available yet</p>
          </div>
        )}
      </div>
    );
  }

  if (imageUrl) {
    return renderImageMap();
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {sections.map((section) => (
          <div
            key={section.id}
            className={`section-block${activeSec === section.id ? ' active-sec' : ''}`}
            style={{
              minHeight: 110,
              background: section.color,
              color: section.closed ? '#000' : '#fff',
              border: activeSec === section.id ? '3px solid #c9a84c' : '1px solid rgba(0,0,0,0.15)',
              cursor: section.closed ? 'not-allowed' : 'pointer',
            }}
            onClick={() => !section.closed && onSec(activeSec === section.id ? null : section.id)}
          >
            <div style={{ fontWeight: 800, textTransform: 'uppercase' }}>{section.label}</div>
            <div style={{ fontSize: 11, marginTop: 8 }}>{section.closed ? 'Closed' : `${getCount(section.id)} / ${getTotal(section.id)} assigned`}</div>
          </div>
        ))}
      </div>
    </div>
  );
});
