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
