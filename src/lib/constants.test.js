import {
  GLTIFE_AUDITORIUM_SLUG,
  auditoriumSupportsSections,
  getAuditoriumHotspots,
  getAuditoriumImageUrl,
  getAuditoriumSections,
  getDefaultConfig,
  getOpenSections,
  getSectionById,
  STATUSES,
  statusColor,
} from './constants';

describe('constants helpers', () => {
  it('returns fallback sections when auditorium data is missing', () => {
    const sections = getAuditoriumSections();

    expect(sections.length).toBeGreaterThan(0);
    expect(sections.some((section) => section.id === 'choir')).toBe(true);
  });

  it('prefers provided auditorium sections', () => {
    const sections = getAuditoriumSections({
      sections: [{ id: 'custom', label: 'Custom Section', color: '#000000' }],
    });

    expect(sections).toEqual([{ id: 'custom', label: 'Custom Section', color: '#000000' }]);
  });

  it('filters out closed sections and resolves section lookup', () => {
    const auditorium = {
      sections: [
        { id: 'open', label: 'Open', color: '#111111' },
        { id: 'closed', label: 'Closed', color: '#222222', closed: true },
      ],
    };

    expect(getOpenSections(auditorium)).toEqual([{ id: 'open', label: 'Open', color: '#111111' }]);
    expect(getSectionById(auditorium, 'closed')).toEqual({
      id: 'closed',
      label: 'Closed',
      color: '#222222',
      closed: true,
    });
    expect(auditoriumSupportsSections(auditorium)).toBe(true);
  });

  it('returns default config and image/hotspot fallbacks for known auditoriums', () => {
    const auditorium = { slug: GLTIFE_AUDITORIUM_SLUG };

    expect(getDefaultConfig(auditorium)).toHaveProperty('section1');
    expect(getAuditoriumImageUrl(auditorium)).toBe('/gltife-auditorium.jpeg');
    expect(getAuditoriumHotspots(auditorium).length).toBeGreaterThan(0);
  });

  it('exposes all arrival statuses with matching color lookup', () => {
    expect(STATUSES).toHaveLength(4);
    expect(statusColor.arrived).toBe('#f59e0b');
    expect(STATUSES.map((status) => status.id)).toEqual(['pending', 'arrived', 'seated', 'absent']);
  });
});
