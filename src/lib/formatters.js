const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let mediumDateFormatter = null;

function getMediumDateFormatter() {
  if (mediumDateFormatter) return mediumDateFormatter;

  try {
    mediumDateFormatter = new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    mediumDateFormatter = null;
  }

  return mediumDateFormatter;
}

function formatFallbackDate(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = monthNames[date.getMonth()] || '';
  const year = date.getFullYear();
  return month ? `${day} ${month} ${year}` : `${day}/${String(date.getMonth() + 1).padStart(2, '0')}/${year}`;
}

export function formatDisplayDate(value, fallback = '') {
  if (!value) return fallback;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const formatter = getMediumDateFormatter();
  return formatter ? formatter.format(date) : formatFallbackDate(date);
}

export function getInitials(value, fallback = '?') {
  const cleaned = String(value || '').trim();
  if (!cleaned) return fallback;

  const parts = cleaned
    .split(/[\s@._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  }

  const [firstPart = ''] = parts;
  return firstPart.slice(0, 2).toUpperCase() || fallback;
}
