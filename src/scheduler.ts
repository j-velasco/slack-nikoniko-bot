export function getLocalTime(utcDate: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(utcDate);
  const hour = parts.find((p) => p.type === 'hour')!.value;
  const minute = parts.find((p) => p.type === 'minute')!.value;
  return `${hour}:${minute}`;
}

export function isWeekday(utcDate: Date, timezone: string): boolean {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  });
  const day = formatter.format(utcDate);
  return !['Sat', 'Sun'].includes(day);
}

export function roundToFiveMinutes(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const rounded = Math.floor(m / 5) * 5;
  return `${h.toString().padStart(2, '0')}:${rounded.toString().padStart(2, '0')}`;
}
