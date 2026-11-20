"""Build study dashboards, teacher directories and tutorials by block."""
import json
import re
from collections import Counter, defaultdict
from datetime import date

from editorial import https_url
from study_calendar import schedule_reference, write_calendar

BASE = '/ruang-belajar/'
DEFAULT_BLOCK = 'ksi'
SLUG_PATTERN = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*')
STUDY_QUOTE = '''
<figure class="study-quote">
  <blockquote lang="ar" dir="rtl">وَقُلْ رَّبِّ زِدْنِيْ عِلْمًا</blockquote>
  <figcaption>
    <span class="study-quote-translation">“Ya Tuhanku, tambahkanlah ilmu kepadaku.”</span>
    <a href="https://quran.kemenag.go.id/quran/per-ayat/surah/20?from=108&amp;to=135">QS Taha [20]: 114 · Qur’an Kemenag</a>
  </figcaption>
</figure>'''
MONTHS = ('Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
          'September', 'Oktober', 'November', 'Desember')
DATE_PATTERN = re.compile(r'[0-9]{4}-[0-9]{2}-[0-9]{2}')
TIME_PATTERN = re.compile(r'(?:[01][0-9]|2[0-3]):[0-5][0-9]')


def valid_date(value):
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def validate_lecture_schedule(item):
    title = item['title']
    day = item.get('lecture_date')
    page = item.get('schedule_page')
    week = item.get('schedule_week')
    has_day = day not in (None, '')
    has_page = page not in (None, '')
    has_week = week not in (None, '')
    if has_day and not valid_date(day):
        raise ValueError(f'{title}: tanggal kuliah harus tanggal kalender yang valid (YYYY-MM-DD).')
    if has_page and (type(page) is not int or page < 1):
        raise ValueError(f'{title}: halaman PDF jadwal harus bilangan bulat minimal 1.')
    if has_week and (type(week) is not int or week < 1):
        raise ValueError(f'{title}: minggu jadwal harus bilangan bulat minimal 1.')
    if has_day != (has_page or has_week) or (has_page and has_week):
        raise ValueError(f'{title}: isi tanggal kuliah dan salah satu sumber (halaman atau minggu) bersama-sama.')
    start, end = item.get('lecture_start') or '', item.get('lecture_end') or ''
    if (start or end) and not (has_day and isinstance(start, str) and isinstance(end, str)
                              and TIME_PATTERN.fullmatch(start) and TIME_PATTERN.fullmatch(end) and start < end):
        raise ValueError(f'{title}: isi tanggal, sumber jadwal, dan jam mulai–selesai WITA yang valid.')


def build_study(root, output, write, head, escape, render_article, preview=False):
    def records(collection):
        items = {}
        for path in sorted((root / 'content' / collection).glob('*.json')):
            entry = json.loads(path.read_text(encoding='utf-8'))
            key = entry['id']
            if not SLUG_PATTERN.fullmatch(key) or key in items:
                raise ValueError(f'ID Ruang Belajar tidak valid atau ganda: {path}')
            items[key] = entry
        return items

    blocks = records('study-blocks')
    if DEFAULT_BLOCK not in blocks:
        raise ValueError('Blok KSI diperlukan untuk tautan Ruang Belajar yang sudah ada.')
    for block in blocks.values():
        if not block.get('title', '').strip() or block.get('status') not in ('active', 'archived', 'coming-soon'):
            raise ValueError(f'Nama atau status blok tidak valid: {block["id"]}')

    teachers = records('study-teachers')
    lectures = records('study-lectures')
    tutorials = records('study-tutorials')
    guidelines = json.loads((root / 'content/study-guidelines.json').read_text(encoding='utf-8')).get('entries') or []
    for item in (*teachers.values(), *lectures.values(), *tutorials.values()):
        if entry_block(item) not in blocks:
            raise ValueError(f'Blok tidak ditemukan: {item["title"]}.')

    for item in lectures.values():
        if any(key not in teachers for key in (item.get('teachers') or [])):
            raise ValueError(f'Pengajar tidak ditemukan: {item["title"]}')
        validate_lecture_schedule(item)
        for material in item.get('materials') or []:
            if not material.get('label', '').strip() or not https_url(material.get('url', '')):
                raise ValueError(f'Materi kuliah memerlukan judul dan URL HTTPS: {item["title"]}')
    for item in tutorials.values():
        if any(key not in lectures or entry_block(lectures[key]) != entry_block(item)
               for key in item.get('related') or []):
            raise ValueError(f'Kuliah terkait harus berasal dari blok yang sama: {item["title"]}')
        for topic in item.get('topics') or []:
            if not topic['title'].strip() or not topic['body'].strip():
                raise ValueError(f'Judul dan isi topik wajib diisi: {item["title"]}')
    for item in guidelines:
        if not item.get('title', '').strip() or not https_url(item.get('url', '')):
            raise ValueError('Guideline memerlukan judul dan URL HTTPS.')
        if item.get('kind') not in (None, '', 'document', 'portal'):
            raise ValueError(f'{item["title"]}: jenis rujukan tidak dikenal.')
        reviewed = item.get('reviewed_on')
        if reviewed and not valid_date(reviewed):
            raise ValueError(f'{item["title"]}: tanggal peninjauan guideline tidak valid.')
        if item.get('review_status') not in (None, '', 'berlaku', 'perlu-dicek', 'digantikan'):
            raise ValueError(f'{item["title"]}: status guideline tidak dikenal.')

    def block_entries(items):
        grouped = {block_id: {} for block_id in blocks}
        for key, item in items.items():
            grouped[entry_block(item)][key] = item
        return grouped

    lectures_by_block = block_entries(lectures)
    tutorials_by_block = block_entries(tutorials)
    teachers_by_block = block_entries(teachers)
    shared_guidelines = render_guidelines(guidelines, escape)
    ordered = sorted(blocks.values(), key=lambda b: (b['id'] != DEFAULT_BLOCK,
                                                     b['status'] == 'coming-soon', b['title'].casefold()))
    for block in ordered:
        block_id = block['id']
        selector = block_selector(ordered, block_id, escape)
        if block['status'] == 'coming-soon':
            render_pending_block(block, selector, shared_guidelines, write, escape)
            continue
        render_block(block, selector, shared_guidelines, lectures_by_block[block_id], tutorials_by_block[block_id],
                     teachers, teachers_by_block[block_id], output, write, head, escape, render_article, preview)


def entry_block(item):
    return item.get('block') or DEFAULT_BLOCK


def block_path(block_id):
    return BASE if block_id == DEFAULT_BLOCK else f'{BASE}blok/{block_id}/'


def block_selector(blocks, current, e):
    links = []
    courses = []
    current_title = next(block['title'] for block in blocks if block['id'] == current)
    for block in blocks:
        selected = ' aria-current="page"' if current == block['id'] else ''
        status = {'archived': 'Arsip', 'coming-soon': 'Segera hadir'}.get(block['status'])
        badge = f' <span>{status}</span>' if status else ''
        group = courses if block.get('kind') == 'course' else links
        group.append(f'<a href="{block_path(block["id"])}"{selected}>{e(block["title"])}{badge}</a>')
    groups = [('Blok belajar', links), ('Jadwal mata kuliah', courses)]
    content = ''.join(f'<div class="study-selector-group"><p>{label}</p><div>{"".join(items)}</div></div>'
                      for label, items in groups if items)
    return ('<details class="study-block-picker"><summary>'
            f'<span>Ganti blok</span><strong>{e(current_title)}</strong></summary>'
            '<nav class="study-block-selector" aria-label="Pilih blok belajar">' + content + '</nav></details>')


def render_unified_search(groups, e):
    sections = []
    for label, entries in groups:
        links = []
        for title, detail, keywords, url in entries:
            pdf_link = ' target="_blank" rel="noopener"' if url.startswith('/dokumen/') else ''
            detail_text = detail + (' · Tab baru' if pdf_link else '')
            links.append(f'<li data-terms="{e(detail + " " + keywords)}">'
                         f'<a href="{e(url)}"{pdf_link}><strong>{e(title)}</strong>'
                         f'<span>{e(detail_text)}</span></a></li>')
        if links:
            sections.append(f'<section data-search-group="{e(label)}" hidden><h3>{e(label)}</h3>'
                            f'<ul></ul><details hidden><summary></summary><ul></ul></details>'
                            f'<template>{"".join(links)}</template></section>')
    return ('<div class="study-search" role="search" aria-label="Pencarian Ruang Belajar" hidden>'
            '<label for="study-search">Cari di Ruang Belajar</label>'
            '<input id="study-search" type="search" placeholder="Nama dosen, topik, atau modul" '
            'autocomplete="off" aria-controls="study-search-results">'
            '<p class="study-search-status" role="status"></p>'
            '<div id="study-search-results" hidden>' + ''.join(sections) + '</div></div>')


def render_pending_block(block, selector, guidelines, write, e):
    title = e(block['title'])
    body = ('<div class="study-block"><div class="study-heading"><h1>Ruang Belajar</h1></div>'
            + selector + '<section class="study-section study-guidelines" aria-labelledby="block-pending">'
            f'<h2 id="block-pending">{title}</h2>'
            '<p>Dashboard, jadwal kuliah, daftar dosen, dan materi blok ini sedang disiapkan.</p>'
            '<a class="text-link" href="#guideline">Lihat kumpulan guideline</a></section>'
            + guidelines + '</div>')
    write(block_path(block['id']), block['title'] + ' · Ruang Belajar',
          'Jadwal, dosen, dan materi blok ini sedang disiapkan.', body, 'study')


def render_guidelines(guidelines, e):
    documents = []
    portals = []
    statuses = {'berlaku': 'Berlaku', 'perlu-dicek': 'Perlu dicek', 'digantikan': 'Digantikan'}
    for item in guidelines:
        issuer = f'<p>{e(item["issuer"])}</p>' if item.get('issuer') else ''
        status = statuses.get(item.get('review_status'))
        review_meta = [e(status)] if status else []
        if item.get('reviewed_on'):
            day = date.fromisoformat(item['reviewed_on'])
            review_meta.append(f'Ditinjau <time datetime="{day.isoformat()}">'
                               f'{day.day} {MONTHS[day.month - 1]} {day.year}</time>')
        review = f'<p class="meta">{" · ".join(review_meta)}</p>' if review_meta else ''
        entry = f'<li><a href="{e(item["url"])}">{e(item["title"])}</a>{issuer}{review}</li>'
        group = portals if item.get('kind') == 'portal' else documents
        group.append(entry)
    body = ''
    if documents:
        body += '<h3>Pedoman dan dokumen</h3><ul class="study-guideline-list">' + ''.join(documents) + '</ul>'
    if portals:
        body += '<h3>Portal rujukan profesi</h3><ul class="study-guideline-list">' + ''.join(portals) + '</ul>'
    if not body:
        body = '<p class="study-guideline-empty">Belum ada guideline yang ditambahkan.</p>'
    return ('<section class="study-section study-guidelines" id="guideline" aria-labelledby="guideline-heading">'
            '<h2 id="guideline-heading">Kumpulan Guideline</h2>' + body + '</section>')


def render_exam_priorities(blueprint, lectures, teachers, base, e):
    departments = sorted(blueprint['departments'], key=lambda item: -item['questions'])
    total = sum(item['questions'] for item in departments)
    highest = departments[:3]
    combined = sum(item['questions'] for item in highest)
    names = ', '.join(item.get('label', item['name']) for item in highest)
    materials = defaultdict(list)
    for lecture in lectures:
        people = ', '.join(
            f'<a href="{base}pengajar/{e(key)}/">{e(teachers[key]["title"])}</a>'
            for key in (lecture.get('teachers') or [])
        )
        materials[lecture['department']].append(
            f'<li><a href="{base}#{e(lecture["id"])}">{e(lecture["title"])}</a>'
            f' <span class="study-exam-lecturers">· {people or "Dosen belum tercantum"}</span></li>')
    rows = []
    for item in departments:
        count = item['questions']
        percent = f'{count / total:.1%}'.replace('.', ',')
        links = ''.join(materials[item['name']])
        rows.append(
            '<details class="study-topic">'
            f'<summary><span>{e(item.get("label", item["name"]))}</span>'
            f'<span class="study-exam-weight">{count} soal · {percent}</span></summary>'
            f'<div class="study-topic-body"><p><strong>Fokus latihan</strong> {e(item["focus"])}</p>'
            + (f'<ul>{links}</ul>' if links else '') + '</div></details>'
        )
    share = f'{combined / total:.0%}'
    return ('<section class="study-section study-agenda study-exam" id="prioritas-ujian" '
            'aria-labelledby="study-exam-heading"><h2 id="study-exam-heading">Prioritas Ujian CBT KSI</h2>'
            '<details class="study-exam-panel"><summary>'
            '<span class="exam-panel-show">Tampilkan daftar prioritas</span>'
            '<span class="exam-panel-hide">Sembunyikan daftar prioritas</span></summary>'
            f'<p><strong>{combined} dari {total} soal ({share})</strong> dialokasikan untuk {e(names)}.'
            ' Buka departemen untuk melihat fokus latihan, topik kuliah, dan dosennya.</p>'
            + ''.join(rows)
            + f'<p class="meta">Alokasi soal per departemen mengikuti {e(blueprint["source"])}. '
            'Fokus latihan adalah saran belajar. Cetak biru merinci sasaran belajar per departemen.</p></details></section>')


def render_block(block, selector, guidelines, lectures, tutorials, teachers, roster,
                 output, write, head, e, render_article, preview):
    block_id = block['id']
    base = block_path(block_id)
    block_name = block['title']
    course = block.get('kind') == 'course'
    schedule_note = block.get('schedule_note')
    subtitle = ' · '.join(value for value in (block_name, block.get('semester'), block.get('period')) if value)
    session_name = 'sesi' if course else 'kuliah'
    module = block.get('module_label') or 'Modul ' + block_name
    schedule_source = block.get('schedule_source') or 'Sumber jadwal'
    active = sorted((x for x in lectures.values() if preview or x['status'] == 'published'),
                    key=lambda x: x['number'])
    published = {x['id'] for x in active}
    sessions = sorted((x for x in tutorials.values() if preview or x['status'] == 'published'),
                      key=lambda x: x['number'])
    counts = Counter(key for item in active for key in (item.get('teachers') or []))
    calendar_ids = write_calendar(output, active, teachers, base, block_id, block_name, schedule_source)
    roster = {**roster, **{key: teachers[key] for key in counts}}

    def link(path, title):
        return f'<a href="{base}{path}">{e(title)}</a>'

    def page(path, title, intro, body):
        write(base + path, title, intro,
              f'<div class="study-block study-block--{block_id}">{body}</div>', 'study')

    def date_label(day):
        return f'{day.day} {MONTHS[day.month - 1]} {day.year}'

    def schedule(item):
        location = f' · {e(item["lecture_location"])}' if item.get('lecture_location') else ''
        if not item.get('lecture_date'):
            note = item.get('schedule_note') or 'Jadwal belum terverifikasi'
            return f'<span class="study-date">{e(note)}{location}</span>'
        day = date.fromisoformat(item['lecture_date'])
        label = date_label(day)
        hours = lecture_hours(item)
        if hours:
            hours = f' · {e(hours)} WITA'
        elif item['department'] == 'Ujian':
            hours = ' · Jam ujian belum tercantum'
        return (f'<span class="study-date"><time datetime="{day.isoformat()}">{label}</time>{hours}'
                f'{location}<small class="study-schedule-source"> · {e(schedule_reference(item, schedule_source))}</small></span>')

    def lecture_hours(item):
        start = item.get('lecture_start')
        return f'{start}–{item["lecture_end"]}' if start else ''

    def schedule_dashboard():
        entries = defaultdict(list)
        scheduled = (item for item in active if item.get('lecture_date'))
        for item in sorted(scheduled, key=lambda x: (x['lecture_date'], x.get('lecture_start') or '99:99', x['number'])):
            hours = lecture_hours(item) or ('Jam ujian belum tercantum' if item['department'] == 'Ujian' else 'Jam belum tercatat')
            people = ', '.join(teachers[key]['title'] for key in (item.get('teachers') or []))
            location = item.get('lecture_location') or ''
            location_html = f'<p class="study-slot-location">{e(location)}</p>' if location else ''
            entries[item['lecture_date']].append(
                f'<li class="study-slot" data-day="{e(item["lecture_date"])}" '
                f'data-start="{e(item.get("lecture_start") or "")}" data-end="{e(item.get("lecture_end") or "")}" '
                f'data-people="{e(people)}" data-location="{e(location)}" data-hours="{e(hours)}">'
                f'<p class="study-slot-time">{e(hours)}<span data-session-state hidden></span></p>'
                f'<div><h4>{link("#" + item["id"], item["title"])}</h4>'
                f'<p>{e(people or "Dosen belum tercantum")}</p>{location_html}<small>{e(schedule_reference(item, schedule_source))}</small></div></li>'
            )
        days = ''.join(
            f'<section class="study-agenda-day"><div class="study-agenda-day-head">'
            f'<div><h3>{title}</h3><time data-agenda-date></time></div><span data-agenda-count></span></div>'
            f'<ul class="study-agenda-list" data-agenda-list></ul><p class="study-agenda-empty" data-agenda-empty hidden>'
            f'Tidak ada jadwal terverifikasi pada tanggal ini.</p></section>'
            for title in ('Hari ini', 'Besok')
        )
        calendar_link = (f'<a href="{base}kalender/{block_id}.ics" download>'
                         f'Unduh kalender {e(block_name)} (.ics)</a>' if calendar_ids else '')
        archived = block['status'] == 'archived'
        schedule_days = []
        for key, slots in entries.items():
            day = date.fromisoformat(key)
            schedule_days.append(f'<h3><time datetime="{key}">{date_label(day)}</time></h3>'
                                 f'<ul class="study-agenda-list">{"".join(slots)}</ul>')
        full_schedule = (f'<details class="study-full-schedule" data-full-schedule><summary>Lihat jadwal lengkap '
                         f'({sum(map(len, entries.values()))} sesi)</summary>'
                         + ''.join(schedule_days) + '</details>' if schedule_days else '')
        if archived:
            note = f'<p>{e(schedule_note)}</p>' if schedule_note else ''
            return (f'<section class="study-section study-agenda" id="jadwal-kuliah">'
                    f'<h2>Arsip Jadwal Kuliah</h2><p>WITA · {e(schedule_source)}</p>' + note
                    + (full_schedule or '<p>Jadwal belum tersedia.</p>')
                    + f'<div class="study-agenda-links">{calendar_link}{link("#kuliah", "Lihat katalog kuliah")}</div></section>')
        note = schedule_note or f'Tanggal dan jam mengikuti {schedule_source}. Lokasi mengikuti pembaruan Ruang Belajar.'
        past_classes = '''
          <details class="study-full-schedule study-past-classes" id="arsip-kelas" hidden>
            <summary>Arsip kelas <span data-past-count></span></summary>
            <p class="meta">Berdasarkan waktu selesai di jadwal WITA. Untuk sesi yang hanya mencantumkan tanggal, entri muncul mulai hari berikutnya.</p>
            <p data-past-empty hidden>Belum ada kelas yang jadwalnya sudah lewat.</p>
            <div data-past-list></div>
          </details>''' if not course else ''
        return f'''
        <section class="study-section study-agenda" id="jadwal-kuliah" aria-labelledby="study-agenda-heading">
          <div class="study-agenda-heading">
            <h2 id="study-agenda-heading">Jadwal Kuliah</h2>
            <p class="study-agenda-clock" data-agenda-clock hidden><time></time> WITA</p>
          </div>
          <div class="study-agenda-grid" data-agenda-days hidden>{days}</div>
          <noscript><p>Aktifkan JavaScript untuk melihat jadwal hari ini dan besok dalam WITA. Tanggal tiap sesi tersedia di katalog.</p></noscript>
          <div class="study-agenda-foot">
            <p>{e(note)}</p>
            <div class="study-agenda-links">{calendar_link}{link('#kuliah', 'Lihat katalog ' + session_name)}</div>
          </div>
          {full_schedule}{past_classes}
        </section>'''

    def exam_section():
        cards = ''.join(f'<li><h3>{link("#" + item["id"], item["title"])}</h3>{schedule(item)}</li>'
                        for item in active if item['department'] == 'Ujian')
        return ('<section id="ujian" class="study-section study-guidelines"><h2>Jadwal Ujian</h2>'
                f'<ul class="study-guideline-list">{cards}</ul></section>')

    def skill_lab_section(items):
        cards = []
        for index, item in enumerate(items, start=1):
            days = ' dan '.join(f'<time datetime="{day}">{date_label(date.fromisoformat(day))}</time>'
                                 for day in item['dates'])
            cards.append(f'<article class="card study-row" id="skill-lab-{index}">'
                         f'<h3>{e(item["title"])}</h3><p>{days}</p>'
                         f'<p>{e(item["focus"])}</p><p class="meta">Modul Skill Lab 4, hlm. {e(item["page"])}'
                         f' · Materi terpisah {e(item["source"])}</p></article>')
        return ('<section class="study-section" id="skill-lab"><h2>Skill Lab 4</h2>'
                '<p>Tiga materi, masing-masing terdiri atas dua pertemuan.</p>'
                '<div class="study-list">' + ''.join(cards) + '</div></section>')

    def skill_lab_module(filename, chapters):
        pdf = f'/dokumen/{e(filename)}'
        size = (output / 'dokumen' / filename).stat().st_size / 1_000_000
        file_size = f'{size:.2f}'.replace('.', ',')
        chapter_links = ''.join(
            f'<li><a href="{pdf}#page={chapter["pdf_page"]}" target="_blank" rel="noopener">'
            f'{e(chapter["title"])}<span class="visually-hidden"> (PDF, tab baru)</span></a></li>'
            for chapter in chapters)
        chapter_list = ('<details class="study-module-chapters"><summary>Daftar bab</summary>'
                        f'<ol>{chapter_links}</ol></details>') if chapter_links else ''
        return f'''
        <section class="study-section" id="skill-lab" aria-labelledby="skill-lab-heading">
          <h2 id="skill-lab-heading">Skill Lab 4</h2>
          <div class="study-module">
            <div>
              <h3>Modul Skill Lab 4 · Blok {e(block_name)}</h3>
              <p>FKIK Universitas Lambung Mangkurat · 2026</p>
              <p>PDF · {file_size} MB</p>
            </div>
            <div class="study-module-actions">
              <a class="btn" href="{pdf}" target="_blank" rel="noopener"
                 aria-label="Preview PDF Modul Skill Lab 4 (tab baru)">Preview PDF</a>
              <a class="btn study-module-download" href="{pdf}" download>Unduh PDF</a>
            </div>
          </div>
          {chapter_list}
        </section>'''

    def back():
        return '<p>' + link('', '← Ruang Belajar') + '</p>'

    def tutorial_topics(item):
        entries = ''.join(
            f'<details class="study-topic"><summary>{e(topic["title"])}</summary>'
            f'<div class="prose study-topic-body">{render_article({"article": topic["body"]})}</div></details>'
            for topic in item.get('topics') or []
        )
        if not entries:
            return ''
        return ('<section class="study-tutorial-topics" aria-labelledby="tutorial-topics">'
                '<h2 id="tutorial-topics">Persiapan Tutorial 2</h2>'
                '<p>Pilih judul untuk membuka atau menutup topik.</p>'
                + entries + '</section>')

    def listing(entries, categories, label, catalogue=False):
        options = ''.join(f'<option>{e(category)}</option>' for category in sorted(categories))
        sort_control = ('<label for="study-sort">Urutkan</label><select id="study-sort">'
                        '<option value="module">Urutan modul</option><option value="date">Tanggal kuliah</option>'
                        '</select>') if catalogue else ''
        pagination = '' if catalogue else ' data-page-size="9"'
        more = ('' if catalogue else '<button type="button" class="btn study-more" id="study-more" hidden>'
                'Tampilkan lebih banyak</button>')
        category_label = 'Jenis sesi' if course and catalogue else 'Departemen'
        return f'''
        <div class="toolbar">
          <label for="search">{e(label)}</label><input id="search" type="search">
          <label for="category">{category_label}</label><select id="category">
            <option value="">Semua {category_label.lower()}</option>{options}
          </select>{sort_control}
        </div>
        <p id="count" role="status"></p><div id="results" class="study-list"{pagination}>{entries}</div>
        <p id="empty" hidden>Tidak ada hasil. Coba kata kunci atau departemen lain.</p>
        {more}'''

    def card(category, query, body, anchor='', sort_date=''):
        attr = f' id="{e(anchor)}" data-sort-date="{e(sort_date)}"' if anchor else ''
        return f'<article class="card study-row"{attr} data-category="{e(category)}" data-search="{e(query)}">{body}</article>'

    def lecture_material(item):
        objectives = ''.join(f'<li>{e(text)}</li>' for text in item.get('objectives') or [])
        resources = [
            f'<a href="{e(entry["url"])}" rel="external">{e(entry["label"])}</a>'
            for entry in item.get('materials') or []
        ]
        resources.extend(link('tutorial/' + tutorial['id'] + '/', tutorial['title'])
                         for tutorial in sessions if item['id'] in tutorial.get('related', []))
        keywords = ', '.join(item.get('keywords') or [])
        notes = (item.get('notes') or '').strip()
        content = []
        if objectives:
            content.append(f'<p><strong>Target belajar</strong></p><ul>{objectives}</ul>')
        if resources:
            content.append('<p><strong>Bacaan dan tutorial</strong></p><ul>'
                           + ''.join(f'<li>{resource}</li>' for resource in resources) + '</ul>')
        if keywords:
            content.append(f'<p><strong>Kata kunci</strong> {e(keywords)}</p>')
        if notes:
            content.append('<div class="prose">' + render_article({'article': notes}) + '</div>')
        if not content:
            return '<p class="study-material-empty">Materi belum tersedia</p>'
        return '<details class="study-material"><summary>Bahan belajar</summary>' + ''.join(content) + '</details>'

    cards = []
    for item in active:
        people = [teachers[key] for key in (item.get('teachers') or [])]
        names = ', '.join(person['title'] for person in people)
        links = ', '.join(link('pengajar/' + person['id'] + '/', person['title']) for person in people)
        calendar_link = (f'<a class="study-calendar-link" href="{base}kalender/kuliah-{e(item["id"])}.ics" download>'
                         f'Unduh .ics<span class="visually-hidden"> untuk {e(item["title"])}</span></a>'
                         if item['id'] in calendar_ids else '')
        date_key = (item['lecture_date'] + 'T' + (item.get('lecture_start') or '99:99')
                    if item.get('lecture_date') else '')
        query = ' '.join([item['title'], names, *(item.get('keywords') or [])])
        if item.get('source_page'):
            module_ref = f'{module}, hlm. {item["source_page"]}'
        else:
            module_ref = schedule_reference(item, schedule_source) if item.get('lecture_date') else module
        cards.append(card(item['department'], query,
                          f'<p class="eyebrow">{e(item["department"])}</p><h3>{e(item["title"])}</h3>'
                          f'{schedule(item)}<p class="study-lecturers">{links or "Dosen belum tercantum"}</p>' + lecture_material(item)
                          + f'<div class="study-card-notes"><p>{e(module_ref)}</p>'
                          + calendar_link + '</div>', item['id'], date_key))
    intro = (f'Jadwal kuliah, praktikum, dan ujian {block_name}.' if course else
             f'Katalog kuliah, daftar dosen pengajar, dan catatan tutorial {block_name}.')
    study_title = 'Katalog Sesi' if course else 'Katalog Kuliah'
    catalogue_hint = (f'Jadwal dan pengajar mengikuti {schedule_source}.' if course else
                      f'Topik mengacu pada modul. Jadwal dan pengajar sesi mengikuti {schedule_source}.')
    tutorial_cards = ''.join(
        f'<article class="card study-row"><p class="eyebrow">Skenario {e(item["number"])}</p>'
        f'<h3>{link("tutorial/" + item["id"] + "/", item["title"])}</h3><p>{e(item["short"])}</p></article>'
        for item in sessions)
    resources = '''
    <section class="study-section" id="sumber-belajar" aria-labelledby="study-resources-heading">
      <h2 id="study-resources-heading">Sumber Belajar</h2>
      <div class="study-resource-grid">
        <article class="card study-resource">
          <div class="study-resource-preview study-resource-osce">
            <p class="eyebrow">Latihan OSCE</p>
            <h3>PhaseMed</h3>
            <ul aria-label="Materi dan fitur">
              <li>Daftar tilik</li><li>Peragaan interaktif</li><li>Simulasi ujian</li>
            </ul>
          </div>
          <div class="study-resource-body">
            <p>Coba pemeriksaan fisik paru dan latihan mengenali bunyi paru tanpa akun.</p>
            <div class="study-resource-links">
              <a class="btn" href="https://phasemed.id/coba" rel="external">Coba latihan PhaseMed</a>
              <a href="https://phasemed.id/" rel="external">Buka beranda PhaseMed ↗</a>
            </div>
          </div>
        </article>
        <article class="card study-resource">
          <div class="study-resource-preview study-resource-materi">
            <p class="eyebrow">Materi kedokteran</p>
            <h3>Klinik Belajar Kedokteran</h3>
            <p class="meta">klinikbelajarkedokteran.site</p>
          </div>
          <div class="study-resource-body">
            <p>Bacaan pendamping untuk meninjau materi kuliah.</p>
            <a class="btn" href="https://klinikbelajarkedokteran.site/" rel="external">Buka Klinik Belajar Kedokteran ↗</a>
          </div>
        </article>
        <article class="card study-resource">
          <div class="study-resource-preview">
            <p class="eyebrow">AI untuk belajar</p>
            <h3>Gizmo</h3>
            <ul aria-label="Fitur Gizmo">
              <li>Flashcard</li><li>Kuis</li><li>Pengulangan berjeda</li>
            </ul>
          </div>
          <div class="study-resource-body">
            <p>Ubah catatan kuliah atau PDF menjadi flashcard dan kuis untuk menguji ingatan.</p>
            <a class="btn" href="https://gizmo.ai/" rel="external">Buka Gizmo ↗</a>
          </div>
        </article>
      </div>
    </section>'''
    blueprint = block.get('exam_blueprint')
    skill_labs = block.get('skill_labs') or []
    skill_lab_pdf = block.get('skill_lab_pdf')
    skill_lab_chapters = block.get('skill_lab_chapters') or []
    skill_lab = (skill_lab_module(skill_lab_pdf, skill_lab_chapters) if skill_lab_pdf
                 else skill_lab_section(skill_labs) if skill_labs else '')
    primary_shortcuts = (
        ('#jadwal-kuliah', 'Jadwal'),
        ('#kuliah', 'Katalog'),
        *([('#skill-lab', 'Skill Lab')] if skill_lab else []),
        *([('#prioritas-ujian', 'Prioritas Ujian')] if blueprint else []),
        *([('#ujian', 'Jadwal Ujian')] if course else []),
    )
    secondary_shortcuts = (
        ('pengajar/', 'Direktori dosen'),
        *([] if course else [('#tutorial', 'Tutorial')]),
        ('#guideline', 'Guideline'),
        ('#sumber-belajar', 'Sumber belajar'),
    )
    upcoming = """
    <section class="study-next" id="ringkasan-jadwal" data-study-next aria-labelledby="study-next-heading">
      <div>
        <h2 id="study-next-heading">Ringkasan Jadwal</h2>
        <p data-next-status></p>
        <h3 data-next-title hidden></h3>
        <p data-next-details hidden></p>
        <p data-next-people hidden></p>
      </div>
      <div class="study-next-actions">
        <a class="btn" data-next-material hidden>Buka materi</a>
        <a class="text-link study-next-agenda" href="#jadwal-kuliah">Jadwal lengkap</a>
      </div>
    </section>""" if block['status'] == 'active' else ''
    shortcuts = ('<nav class="study-shortcuts" aria-label="Pintasan Ruang Belajar">'
                 '<div class="study-shortcuts-primary">'
                 + ''.join(link(path, label) for path, label in primary_shortcuts)
                 + '</div><details class="study-shortcuts-more"><summary>Lainnya</summary><div>'
                 + ''.join(link(path, label) for path, label in secondary_shortcuts)
                 + '</div></details></nav>')
    visible_teachers = [x for x in roster.values() if block_id != DEFAULT_BLOCK or counts[x['id']]]
    module_results = [(item['title'], 'Tutorial', item['short'], base + 'tutorial/' + item['id'] + '/')
                      for item in sessions]
    if skill_lab_pdf:
        module_results.append((f'Modul Skill Lab 4 · Blok {block_name}', 'PDF', '', base + '#skill-lab'))
        for chapter in skill_lab_chapters:
            module_results.append((chapter['title'], 'Modul Skill Lab 4 · PDF', chapter.get('keywords', ''),
                                   f'/dokumen/{skill_lab_pdf}#page={chapter["pdf_page"]}'))
    else:
        module_results.extend((item['title'], 'Skill Lab 4', item['focus'], base + f'#skill-lab-{index}')
                              for index, item in enumerate(skill_labs, start=1))
    unified_search = render_unified_search([
        ('Dosen', [(person['title'], person['department'], '', base + 'pengajar/' + person['id'] + '/')
                   for person in sorted(visible_teachers, key=lambda p: p['title'].casefold())]),
        ('Topik', [(item['title'], item['department'], ' '.join(item.get('keywords') or []), base + '#' + item['id'])
                   for item in active]),
        ('Modul dan tutorial', module_results),
    ], e)
    tutorial_section = (f'<section class="study-section" id="tutorial"><h2>Tutorial {e(block_name)}</h2>'
                        + (f'<div class="grid">{tutorial_cards}</div>' if tutorial_cards else '<p>Belum ada tutorial.</p>')
                        + '</section>')
    page('', 'Ruang Belajar' if block_id == DEFAULT_BLOCK else block_name + ' · Ruang Belajar', intro,
         f'<div class="study-heading"><p class="eyebrow">{e(subtitle)}</p>'
         '<h1>Ruang Belajar</h1></div>' + selector + upcoming + unified_search + shortcuts
         + schedule_dashboard()
         + (exam_section() if course else '')
         + (render_exam_priorities(blueprint, active, teachers, base, e) if blueprint else '')
         + f'<section class="study-section" id="kuliah"><h2>{study_title}</h2>'
         + '<details id="study-catalogue" class="study-catalogue"><summary>'
         + f'<span class="catalogue-show">Tampilkan katalog · {len(active)} {session_name}</span>'
         + '<span class="catalogue-hide">Sembunyikan katalog</span></summary>'
         + f'<p class="meta">{e(catalogue_hint)}</p>'
         + listing(''.join(cards), {x['department'] for x in active}, 'Cari materi atau dosen', catalogue=True)
         + '</details></section>'
         + ('' if course else tutorial_section)
         + skill_lab + guidelines + resources + STUDY_QUOTE)

    directory = []
    for person in sorted(roster.values(), key=lambda x: x['title'].casefold()):
        key = person['id']
        url = 'pengajar/' + key + '/'
        if block_id != DEFAULT_BLOCK or counts[key]:
            directory.append(card(person['department'], person['title'],
                                  f'<h2>{link(url, person["title"])}</h2>'
                                  f'<p>{e(person["department"])} · {counts[key]} topik</p>'))
        topics = ''.join('<li>' + link('#' + item['id'], item['title']) + schedule(item) + '</li>'
                         for item in active if key in (item.get('teachers') or []))
        note = f'<p class="meta">{e(person["note"])}</p>' if person.get('note') else ''
        topic_list = (f'<ul class="study-topics">{topics}</ul>' if topics
                      else '<p>Belum ada sesi yang tercantum untuk pengajar ini.</p>')
        page(url, person['title'], f'Daftar kuliah {block_name}.',
             back() + head(e(person['department']), e(person['title']), e(subtitle)) + note
             + '<section class="section"><h2>Materi kuliah</h2>' + topic_list + '</section>')
    page('pengajar/', 'Direktori Pengajar', subtitle, back()
         + '<div class="study-heading"><h1>Direktori Pengajar</h1><p>' + e(subtitle) + '</p></div>'
         + (listing(''.join(directory), {x['department'] for x in visible_teachers}, 'Cari dosen')
            if directory else '<p>Belum ada pengajar.</p>'))

    for item in sessions:
        related = [lectures[key] for key in item.get('related') or [] if key in published]
        related_links = ''.join('<li>' + link('#' + x['id'], x['title']) + '</li>' for x in related)
        page('tutorial/' + item['id'] + '/', item['title'], item['short'],
             '<article class="reading study-tutorial">' + back()
             + head(f'{e(block_name)} · SKENARIO {e(item["number"])}', e(item['title']), e(item['short']))
             + '<p class="meta">Catatan belajar Faisal</p>'
             + '<div class="prose study-tutorial-intro">' + render_article(item) + '</div>'
             + tutorial_topics(item)
             + ('<h2>Kuliah terkait</h2><ul>' + related_links + '</ul>' if related else '') + '</article>')
