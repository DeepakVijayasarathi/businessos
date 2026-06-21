function toIcsDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcsText(text) {
  return String(text || '').replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

/**
 * Builds a minimal RFC 5545 .ics file for a single appointment so it can be
 * downloaded/attached and dropped straight into Google/Outlook/Apple Calendar.
 */
function buildAppointmentIcs(appointment) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BusinessOS//Appointments//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${appointment.id}@businessos`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(appointment.startAt)}`,
    `DTEND:${toIcsDate(appointment.endAt)}`,
    `SUMMARY:${escapeIcsText(appointment.title)}`,
    ...(appointment.description ? [`DESCRIPTION:${escapeIcsText(appointment.description)}`] : []),
    ...(appointment.location ? [`LOCATION:${escapeIcsText(appointment.location)}`] : []),
    ...(appointment.meetingUrl ? [`URL:${escapeIcsText(appointment.meetingUrl)}`] : []),
    `STATUS:${appointment.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

module.exports = { buildAppointmentIcs };
