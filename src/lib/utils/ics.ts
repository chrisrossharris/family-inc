export interface IcsEvent {
  uid: string;
  startDate: string;
  endDate: string | null;
  summary: string;
  description: string | null;
  location: string | null;
}

function unfoldIcs(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function unescapeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function parseIcsDate(value: string): string | null {
  const match = value.match(/(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function parseIcsEvents(raw: string): IcsEvent[] {
  const lines = unfoldIcs(raw);
  const events: IcsEvent[] = [];
  let current: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }

    if (line === 'END:VEVENT') {
      if (current?.uid && current.startDate) {
        events.push({
          uid: current.uid,
          startDate: current.startDate,
          endDate: current.endDate ?? null,
          summary: current.summary ?? 'Google Calendar Event',
          description: current.description ?? null,
          location: current.location ?? null
        });
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const rawKey = line.slice(0, separatorIndex);
    const value = line.slice(separatorIndex + 1);
    const key = rawKey.split(';')[0];

    if (key === 'UID') current.uid = value.trim();
    if (key === 'SUMMARY') current.summary = unescapeIcsText(value);
    if (key === 'DESCRIPTION') current.description = unescapeIcsText(value);
    if (key === 'LOCATION') current.location = unescapeIcsText(value);
    if (key === 'DTSTART') current.startDate = parseIcsDate(value) ?? undefined;
    if (key === 'DTEND') current.endDate = parseIcsDate(value);
  }

  return events;
}
