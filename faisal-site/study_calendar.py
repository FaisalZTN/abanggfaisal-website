"""Generate downloadable iCalendar files from the published study timetables."""

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


def schedule_reference(item, source):
    source = item.get('schedule_source') or source
    if item.get('schedule_week'):
        return f'{source}, minggu {item["schedule_week"]}'
    return f'{source}, hlm. {item["schedule_page"]}'


def write_calendar(output, lectures, teachers, base, block_id, block_name, schedule_source):
    scheduled = sorted(
        (item for item in lectures if item.get('lecture_start')
         or (item['department'] == 'Ujian' and item.get('lecture_date'))),
        key=lambda item: (item['lecture_date'], item.get('lecture_start') or '99:99', item['number']),
    )
    if not scheduled:
        return set()
    folder = output / base.strip('/') / 'kalender'
    folder.mkdir(parents=True, exist_ok=True)
    header = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//abangfaisal.my.id//Ruang Belajar//ID',
              'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + calendar_text('Jadwal Kuliah ' + block_name)]
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    events = []
    for item in scheduled:
        slug = item['id']
        day = item['lecture_date']
        names = ', '.join(teachers[key]['title'] for key in (item.get('teachers') or [])) or 'Dosen belum tercantum'
        source = f'Pengajar: {names}\n{schedule_reference(item, schedule_source)}. Waktu sumber: WITA.'
        if item.get('lecture_start'):
            timing = [
                'DTSTART:' + calendar_datetime(day, item['lecture_start']),
                'DTEND:' + calendar_datetime(day, item['lecture_end']),
            ]
            reminder = ['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT30M',
                        'DESCRIPTION:' + calendar_text(item['title']), 'END:VALARM']
        else:
            # An exam date without a specified hour stays an all-day entry.
            timing = ['DTSTART;VALUE=DATE:' + day.replace('-', '')]
            reminder = []
            source += '\nJam ujian belum tercantum.'
        event = [
            'BEGIN:VEVENT',
            f'UID:{block_id}-{slug}@abanggfaisal.my.id',
            f'DTSTAMP:{stamp}',
            *timing,
            'SUMMARY:' + calendar_text(item['title']),
            'DESCRIPTION:' + calendar_text(source),
            f'URL:{SITE}{base}#{slug}',
            *([f'LOCATION:{calendar_text(item["lecture_location"])}'] if item.get('lecture_location') else []),
            *reminder, 'END:VEVENT',
        ]
        (folder / f'kuliah-{slug}.ics').write_bytes(calendar_bytes([*header, *event, 'END:VCALENDAR']))
        events.extend(event)
    (folder / f'{block_id}.ics').write_bytes(calendar_bytes([*header, *events, 'END:VCALENDAR']))
    return {item['id'] for item in scheduled}
