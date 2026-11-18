"""Generate downloadable iCalendar files from the published KSI timetable."""

from datetime import datetime, timedelta, timezone


WITA = timezone(timedelta(hours=8))
SITE = 'https://abanggfaisal.my.id'


def calendar_text(value):
    value = value.replace('\r\n', '\n').replace('\r', '\n')
    return value.replace('\\', '\\\\').replace('\n', '\\n').replace(';', '\\;').replace(',', '\\,')


def calendar_bytes(lines):
    # RFC 5545 folds by UTF-8 octets, including the space starting a continuation.
    folded = []
    for line in lines:
        chunk = bytearray()
        for char in line:
            encoded = char.encode('utf-8')
            if len(chunk) + len(encoded) > 75:
                folded.append(bytes(chunk))
                chunk = bytearray(b' ')
            chunk.extend(encoded)
        folded.append(bytes(chunk))
    return b'\r\n'.join(folded) + b'\r\n'


def calendar_datetime(day, clock):
    value = datetime.fromisoformat(f'{day}T{clock}').replace(tzinfo=WITA)
    return value.astimezone(timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def write_calendar(output, lectures, teachers):
    scheduled = sorted(
        (item for item in lectures if item.get('lecture_start') and item.get('lecture_end')),
        key=lambda item: (item['lecture_date'], item['lecture_start'], item['number']),
    )
    if not scheduled:
        return set()
    folder = output / 'ruang-belajar' / 'kalender'
    folder.mkdir(parents=True, exist_ok=True)
    header = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//abangfaisal.my.id//Jadwal Kuliah KSI//ID',
              'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Jadwal Kuliah KSI']
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    events = []
    for item in scheduled:
        slug = item['id']
        day = item['lecture_date']
        names = ', '.join(teachers[key]['title'] for key in item['teachers'])
        source = f'Pengajar: {names}\nJadwal KSI, hlm. {item["schedule_page"]}. Waktu sumber: WITA.'
        event = [
            'BEGIN:VEVENT',
            f'UID:ksi-{slug}@abanggfaisal.my.id',
            f'DTSTAMP:{stamp}',
            'DTSTART:' + calendar_datetime(day, item['lecture_start']),
            'DTEND:' + calendar_datetime(day, item['lecture_end']),
            'SUMMARY:' + calendar_text(item['title']),
            'DESCRIPTION:' + calendar_text(source),
            f'URL:{SITE}/ruang-belajar/#{slug}',
            'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M',
            'DESCRIPTION:' + calendar_text(item['title']),
            'END:VALARM', 'END:VEVENT',
        ]
        (folder / f'kuliah-{slug}.ics').write_bytes(calendar_bytes([*header, *event, 'END:VCALENDAR']))
        events.extend(event)
    (folder / 'ksi.ics').write_bytes(calendar_bytes([*header, *events, 'END:VCALENDAR']))
    return {item['id'] for item in scheduled}
