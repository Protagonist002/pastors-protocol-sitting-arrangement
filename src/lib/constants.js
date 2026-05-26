export const GLT_CAMP_AUDITORIUM_SLUG = 'glt-camp-auditorium';
export const GLTIFE_AUDITORIUM_SLUG = 'gltife-auditorium';

const FALLBACK_CAMP_SECTIONS = [
  { id: 'choir', label: 'Choir', color: '#e8843a' },
  { id: 'left', label: 'Left Section', color: '#c0392b' },
  { id: 'middle', label: 'Middle Section', color: '#2471a3' },
  { id: 'right', label: 'Right Section', color: '#b8920a' },
  { id: 'minister', label: 'Minister Section', color: '#4a5568' },
  { id: 'vvip', label: 'SETMAN / VVIP / CEC', closed: true, color: '#d1d5db' },
  { id: 'altar', label: 'Altar', closed: true, color: '#5eac24' },
];

const FALLBACK_CAMP_CONFIG = {
  choir: { rows: 5, cols: 4 },
  left: { rows: 8, cols: 5 },
  middle: { rows: 10, cols: 6 },
  right: { rows: 8, cols: 5 },
  minister: { rows: 6, cols: 5 },
};

const FALLBACK_GLTIFE_SECTIONS = [
  { id: 'choir', label: 'Choir', color: '#b56df0' },
  { id: 'smrs', label: 'SMRS VIP Minister', color: '#f58bf2' },
  { id: 'setman', label: 'Set Man CEC', color: '#ff6868' },
  { id: 'assPastor', label: 'Ass Pastor', color: '#68a9ef' },
];

const FALLBACK_GLTIFE_CONFIG = {
  choir: { rows: 8, cols: 6 },
  smrs: { rows: 5, cols: 6 },
  setman: { rows: 6, cols: 6 },
  assPastor: { rows: 6, cols: 6 },
};

const AUDITORIUM_IMAGE_FALLBACKS = {
  [GLT_CAMP_AUDITORIUM_SLUG]: '/glt-camp-auditorium.jpeg',
  [GLTIFE_AUDITORIUM_SLUG]: '/gltife-auditorium.png',
};

const AUDITORIUM_HOTSPOTS = {
  [GLT_CAMP_AUDITORIUM_SLUG]: [
    { id: 'choir', left: 10.42, top: 4.91, width: 10.34, height: 14.87 },
    { id: 'choir', left: 8.28, top: 33.8, width: 10.88, height: 19.64 },
    { id: 'altar', left: 24.83, top: 4.49, width: 29.81, height: 15.99, closed: true },
    { id: 'vvip', left: 57.85, top: 4.35, width: 15.63, height: 16.69, closed: true },
    { id: 'left', left: 23.45, top: 33.8, width: 10.11, height: 18.93 },
    { id: 'middle', left: 35.1, top: 33.8, width: 9.88, height: 18.23 },
    { id: 'right', left: 46.82, top: 33.66, width: 9.42, height: 17.95 },
    { id: 'minister', left: 58.7, top: 33.8, width: 15.1, height: 27.63 },
  ],
  [GLTIFE_AUDITORIUM_SLUG]: [
    { id: 'smrs', left: 33.01, top: 24.88, width: 11.0, height: 6.33, radius: 0, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.16, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.22)' },
    { id: 'setman', left: 20.19, top: 32.11, width: 9.55, height: 6.76, clipPath: 'polygon(73% 0, 100% 27%, 27% 100%, 0 73%)', showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.16, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.22)' },
    { id: 'assPastor', left: 23.82, top: 34.63, width: 14.51, height: 10.3, clipPath: 'polygon(47% 0, 100% 52%, 53% 100%, 0 47%)', showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.16, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.22)' },
    { id: 'choir', left: 9.43, top: 41.43, width: 9.92, height: 5.3, radius: 0, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.16, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.22)' },
  ],
};

export function getAuditoriumSections(auditorium) {
  if (auditorium?.slug === GLTIFE_AUDITORIUM_SLUG) {
    return FALLBACK_GLTIFE_SECTIONS;
  }
  if (Array.isArray(auditorium?.sections) && auditorium.sections.length) {
    return auditorium.sections;
  }
  if (auditorium?.slug === GLT_CAMP_AUDITORIUM_SLUG || !auditorium?.slug) {
    return FALLBACK_CAMP_SECTIONS;
  }
  if (auditorium?.slug === GLTIFE_AUDITORIUM_SLUG) {
    return FALLBACK_GLTIFE_SECTIONS;
  }
  return [];
}

export function getOpenSections(auditorium) {
  return getAuditoriumSections(auditorium).filter((section) => !section.closed);
}

export function getSectionById(auditorium, sectionId) {
  return getAuditoriumSections(auditorium).find((section) => section.id === sectionId);
}

export function getDefaultConfig(auditorium) {
  if (auditorium?.slug === GLTIFE_AUDITORIUM_SLUG) {
    return FALLBACK_GLTIFE_CONFIG;
  }
  const config = auditorium?.default_seating_config;
  if (config && Object.keys(config).length) {
    return config;
  }
  if (auditorium?.slug === GLT_CAMP_AUDITORIUM_SLUG || !auditorium?.slug) {
    return FALLBACK_CAMP_CONFIG;
  }
  if (auditorium?.slug === GLTIFE_AUDITORIUM_SLUG) {
    return FALLBACK_GLTIFE_CONFIG;
  }
  return {};
}

export function getEffectiveConfig(auditorium, config) {
  return { ...getDefaultConfig(auditorium), ...(config || {}) };
}

export function getAuditoriumImageUrl(auditorium) {
  if (auditorium?.slug === GLTIFE_AUDITORIUM_SLUG && AUDITORIUM_IMAGE_FALLBACKS[GLTIFE_AUDITORIUM_SLUG]) {
    return AUDITORIUM_IMAGE_FALLBACKS[GLTIFE_AUDITORIUM_SLUG];
  }
  if (auditorium?.image_url) {
    return auditorium.image_url;
  }
  if (auditorium?.slug && AUDITORIUM_IMAGE_FALLBACKS[auditorium.slug]) {
    return AUDITORIUM_IMAGE_FALLBACKS[auditorium.slug];
  }
  if (!auditorium?.slug) {
    return AUDITORIUM_IMAGE_FALLBACKS[GLT_CAMP_AUDITORIUM_SLUG];
  }
  return null;
}

export function getAuditoriumHotspots(auditorium) {
  if (auditorium?.slug && AUDITORIUM_HOTSPOTS[auditorium.slug]) {
    return AUDITORIUM_HOTSPOTS[auditorium.slug];
  }
  if (!auditorium?.slug) {
    return AUDITORIUM_HOTSPOTS[GLT_CAMP_AUDITORIUM_SLUG] || [];
  }
  return [];
}

export function auditoriumSupportsSections(auditorium) {
  return getOpenSections(auditorium).length > 0;
}

export const STATUSES = [
  { id: 'pending', label: 'Not Arrived', color: '#64748b', bg: '#1e293b' },
  { id: 'arrived', label: 'Arrived', color: '#f59e0b', bg: '#451a0344' },
  { id: 'seated', label: 'Seated', color: '#22c55e', bg: '#05291644' },
  { id: 'absent', label: 'Absent', color: '#ef4444', bg: '#1c050544' },
];

export const statusColor = {
  pending: '#64748b',
  arrived: '#f59e0b',
  seated: '#22c55e',
  absent: '#ef4444',
};
