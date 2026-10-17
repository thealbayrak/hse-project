/** Minimal iCalendar (RFC 5545) invitation: opens in Outlook, Gmail and Apple Calendar. */
export interface IcsEvent {
  uid: string;
  start: Date;
  durationMinutes: number;
  summary: string;
  description: string;
  location?: string;
  organizer: { name: string; email: string };
  attendees: { name: string; email: string }[];
  url?: string;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function icsDate(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Escapes commas, semicolons, backslashes and newlines as the format requires. */
export function icsText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replaceAll(/\r?\n/g, "\\n");
}

/** Folds lines longer than 75 octets (continuation lines start with a space). */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

export function buildIcs(event: IcsEvent) {
  const end = new Date(event.start.getTime() + event.durationMinutes * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SiteSafety Nordic//Emergency meeting//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(event.summary)}`,
    `DESCRIPTION:${icsText(event.description)}`,
    event.location ? `LOCATION:${icsText(event.location)}` : "",
    event.url ? `URL:${event.url}` : "",
    `ORGANIZER;CN=${icsText(event.organizer.name)}:mailto:${event.organizer.email}`,
    ...event.attendees.map(
      (attendee) =>
        `ATTENDEE;CN=${icsText(attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`
    ),
    "STATUS:CONFIRMED",
    "PRIORITY:1",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(event.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n") + "\r\n";
}
