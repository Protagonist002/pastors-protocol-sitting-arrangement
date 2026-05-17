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
  { id: 'choir', label: 'Choir', color: '#f4e7b0' },
  { id: 'section3', label: 'Section 3', color: '#f7d7c7' },
  { id: 'setman', label: 'Setman / VVIP / CEC', color: '#f69a62' },
  { id: 'smrs', label: 'SMRS / VIPS / Ministers', color: '#d8f060' },
  { id: 'section2', label: 'Section 2', color: '#8e90f3' },
  { id: 'section1', label: 'Section 1', color: '#e78ad2' },
  { id: 'extensionCenter', label: 'Extension Center', color: '#c1ada0' },
  { id: 'extensionSide', label: 'Extension Side', color: '#9990d8' },
  { id: 'extensionMain', label: 'Extension Main', color: '#f4668d' },
  { id: 'extensionLower', label: 'Extension Lower', color: '#ff7a43' },
  { id: 'altar', label: 'Altar', closed: true, color: '#f7c44b' },
];

const FALLBACK_GLTIFE_CONFIG = {
  choir: { rows: 8, cols: 6 },
  section3: { rows: 8, cols: 5 },
  setman: { rows: 6, cols: 6 },
  smrs: { rows: 5, cols: 6 },
  section2: { rows: 8, cols: 12 },
  section1: { rows: 10, cols: 14 },
  extensionCenter: { rows: 8, cols: 8 },
  extensionSide: { rows: 8, cols: 3 },
  extensionMain: { rows: 10, cols: 14 },
  extensionLower: { rows: 8, cols: 14 },
};

const AUDITORIUM_IMAGE_FALLBACKS = {
  [GLT_CAMP_AUDITORIUM_SLUG]: '/glt-camp-auditorium.jpeg',
  [GLTIFE_AUDITORIUM_SLUG]: '/gltife-auditorium.jpeg',
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
    { id: 'altar', left: 5.8, top: 4.8, width: 28.5, height: 27.5, interactive: false, showLabel: false, showMeta: false, showClosed: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05 },
    { id: 'smrs', left: 42.4, top: 8.3, width: 13.1, height: 13.2, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'section2', left: 55.4, top: 8.1, width: 29.4, height: 13.2, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'section1', left: 44.5, top: 26.0, width: 39.2, height: 13.6, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'setman', left: 29.3, top: 31.7, width: 16.8, height: 18.1, radius: 4, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.14)' },
    { id: 'choir', left: 8.4, top: 52.9, width: 13.7, height: 10.2, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.14)' },
    { id: 'choir', left: 8.2, top: 68.6, width: 13.8, height: 15.8, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.14)' },
    { id: 'section3', left: 24.2, top: 68.6, width: 13.3, height: 15.8, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'extensionCenter', left: 49.3, top: 50.8, width: 18.8, height: 13.7, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'extensionSide', left: 73.4, top: 50.9, width: 7.2, height: 14.3, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'extensionMain', left: 45.8, top: 71.5, width: 38.0, height: 14.8, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
    { id: 'extensionLower', left: 45.9, top: 87.9, width: 38.0, height: 12.8, radius: 8, showLabel: false, showMeta: false, backgroundAlpha: 0, borderAlpha: 0, activeBackgroundAlpha: 0.05, activeShadow: '0 0 0 2px rgba(214, 187, 117, 0.16)' },
  ],
};

export function getAuditoriumSections(auditorium) {
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
