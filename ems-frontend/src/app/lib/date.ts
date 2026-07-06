const INDIA_LOCALE = 'en-IN';
export const INDIA_TIME_ZONE = 'Asia/Kolkata';
const INDIA_UTC_OFFSET_MINUTES = 330;
const PLAIN_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

type DateValue = string | number | Date;

function parsePlainDateTime(value: string) {
  const match = value.trim().match(PLAIN_DATE_TIME_PATTERN);

  if (!match) {
    return null;
  }

  const [, year, month, day, hour, minute, second = '00'] = match;
  const utcTime =
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ) -
    INDIA_UTC_OFFSET_MINUTES * 60 * 1000;

  return new Date(utcTime);
}

function toDate(value: DateValue) {
  if (typeof value === 'string') {
    const parsedPlainDateTime = parsePlainDateTime(value);

    if (parsedPlainDateTime) {
      return parsedPlainDateTime;
    }
  }

  return value instanceof Date ? value : new Date(value);
}

export function toDateTimeLocalValue(value?: string | null) {
  if (!value) {
    return '';
  }

  const match = value.trim().match(PLAIN_DATE_TIME_PATTERN);

  if (match) {
    const [, year, month, day, hour, minute] = match;
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDateTimeInIndia(
  value: DateValue,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(INDIA_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(toDate(value));
}

export function formatDateInIndia(
  value: DateValue,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(INDIA_LOCALE, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(toDate(value));
}

export function formatTimeInIndia(
  value: DateValue,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(INDIA_LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: INDIA_TIME_ZONE,
    ...options,
  }).format(toDate(value));
}

export function formatWeekdayInIndia(value: DateValue) {
  return new Intl.DateTimeFormat(INDIA_LOCALE, {
    weekday: 'long',
    timeZone: INDIA_TIME_ZONE,
  }).format(toDate(value));
}
