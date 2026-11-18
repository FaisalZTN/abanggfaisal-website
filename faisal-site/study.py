"""Build the KSI study catalogue, teacher directory and tutorials."""
import json
import re
from collections import Counter
from datetime import date

BASE = '/ruang-belajar/'
MODULE = 'Buku Modul KSI, semester V, TA 2026/2027'
BLOCK_THEME = 'ksi'
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


def build_study(root, write, head, escape, render_article, preview=False):
    def records(collection):
        items = {}
        for path in sorted((root / 'content' / collection).glob('*.json')):
            entry = json.loads(path.read_text(encoding='utf-8'))
            key = entry['id']
            if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', key) or key in items:
                raise ValueError(f'ID Ruang Belajar tidak valid atau ganda: {path}')
            items[key] = entry
        return items

    teachers = records('study-teachers')
    lectures = records('study-lectures')
    tutorials = records('study-tutorials')
    for item in lectures.values():
        if not item['teachers'] or any(key not in teachers for key in item['teachers']):
            raise ValueError(f'Pengajar tidak ditemukan: {item["title"]}')
    for item in tutorials.values():
        if any(key not in lectures for key in item.get('related', [])):
            raise ValueError(f'Kuliah terkait tidak ditemukan: {item["title"]}')
        for topic in item.get('topics') or []:
            if not topic['title'].strip() or not topic['body'].strip():
                raise ValueError(f'Judul dan isi topik wajib diisi: {item["title"]}')

    active = sorted((x for x in lectures.values() if preview or x['status'] == 'published'),
                    key=lambda x: x['number'])
    published = {x['id'] for x in active}
    sessions = sorted((x for x in tutorials.values() if preview or x['status'] == 'published'),
                      key=lambda x: x['number'])
    counts = Counter(key for item in active for key in item['teachers'])

    e = escape

    def link(path, title):
        return f'<a href="{BASE}{path}">{e(title)}</a>'

    def page(path, title, intro, body):
        write(BASE + path, title, intro,
              f'<div class="study-block study-block--{BLOCK_THEME}">{body}</div>', 'study')

    def schedule(item):
        if not item.get('lecture_date') or not item.get('schedule_page'):
            return ''
        day = date.fromisoformat(item['lecture_date'])
        label = f'{day.day} {MONTHS[day.month - 1]} {day.year}'
        return (f'<span class="study-date"><time datetime="{day.isoformat()}">{label}</time>'
                f' · Jadwal KSI, hlm. {e(item["schedule_page"])}</span>')

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

    def listing(entries, categories, label):
        options = ''.join(f'<option>{e(category)}</option>' for category in sorted(categories))
        return f'''
        <div class="toolbar">
          <label for="search">{e(label)}</label><input id="search" type="search">
          <label for="category">Departemen</label><select id="category">
            <option value="">Semua departemen</option>{options}
          </select>
        </div>
        <p id="count" role="status"></p><div id="results" class="study-list" data-page-size="9">{entries}</div>
        <p id="empty" hidden>Tidak ada hasil. Coba kata kunci atau departemen lain.</p>
        <button type="button" class="btn study-more" id="study-more" hidden>Tampilkan lebih banyak</button>'''

    def card(category, query, body, anchor=''):
        attr = f' id="{e(anchor)}"' if anchor else ''
        return f'<article class="card study-row"{attr} data-category="{e(category)}" data-search="{e(query)}">{body}</article>'

    cards = []
    for item in active:
        people = [teachers[key] for key in item['teachers']]
        names = ', '.join(person['title'] for person in people)
        links = ', '.join(link('pengajar/' + person['id'] + '/', person['title']) for person in people)
        notes = render_article({'article': item['notes']}) if item.get('notes', '').strip() else ''
        cards.append(card(item['department'], item['title'] + ' ' + names,
                          f'<p class="eyebrow">{e(item["department"])}</p><h3>{e(item["title"])}</h3>'
                          f'<p>{links}</p>{schedule(item)}<p class="meta">Modul KSI, hlm. {e(item["source_page"])}</p>'
                          f'<div class="prose">{notes}</div>', item['id']))
    intro = 'Katalog kuliah, daftar dosen pengajar, dan catatan tutorial Blok KSI.'
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
            <p>Tautan bacaan pendamping untuk meninjau materi kuliah.</p>
            <a class="btn" href="http://klinikbelajarkedokteran.site/" rel="external">Buka Klinik Belajar Kedokteran ↗</a>
          </div>
        </article>
      </div>
    </section>'''
    page('', 'Ruang Belajar', intro,
         '<div class="study-heading"><p class="eyebrow">KSI · SEMESTER V · 2026/2027</p>'
         '<h1>Ruang Belajar</h1><p>' + e(intro) + '</p>'
         '<div class="study-shortcuts">' + link('pengajar/', 'Cari dosen →')
         + link('#tutorial', 'Buka tutorial ↓') + link('#sumber-belajar', 'Sumber belajar ↓') + '</div></div>'
         + STUDY_QUOTE
         + f'<section class="study-section" id="kuliah"><h2>Katalog Kuliah</h2><p class="meta">Tanggal ditampilkan jika topik dan pengajarnya cocok antara modul dan jadwal KSI.</p>'
         + listing(''.join(cards), {x['department'] for x in active}, 'Cari materi atau dosen') + '</section>'
         + '<section class="study-section" id="tutorial"><h2>Tutorial KSI</h2><div class="grid">'
         + tutorial_cards + '</div></section>' + resources)

    directory = []
    visible_teachers = [x for x in teachers.values() if counts[x['id']]]
    for person in sorted(visible_teachers, key=lambda x: x['title'].casefold()):
        key = person['id']
        url = 'pengajar/' + key + '/'
        directory.append(card(person['department'], person['title'],
                              f'<h2>{link(url, person["title"])}</h2>'
                              f'<p>{e(person["department"])} · {counts[key]} topik</p>'))
        topics = ''.join('<li>' + link('#' + item['id'], item['title']) + schedule(item) + '</li>'
                         for item in active if key in item['teachers'])
        note = f'<p class="meta">{e(person["note"])}</p>' if person.get('note') else ''
        page(url, person['title'], 'Daftar kuliah menurut Modul KSI.',
             back() + head(e(person['department']), e(person['title']), e(MODULE)) + note
             + '<section class="section"><h2>Materi kuliah</h2><ul class="study-topics">'
             + topics + '</ul></section>')
    page('pengajar/', 'Direktori Pengajar', MODULE, back()
         + '<div class="study-heading"><h1>Direktori Pengajar</h1><p>' + e(MODULE) + '</p></div>'
         + listing(''.join(directory), {x['department'] for x in visible_teachers}, 'Cari dosen'))

    for item in sessions:
        related = [lectures[key] for key in item.get('related', []) if key in published]
        related_links = ''.join('<li>' + link('#' + x['id'], x['title']) + '</li>' for x in related)
        page('tutorial/' + item['id'] + '/', item['title'], item['short'],
             '<article class="reading study-tutorial">' + back()
             + head(f'KSI · SKENARIO {e(item["number"])}', e(item['title']), e(item['short']))
             + '<p class="meta">Catatan belajar Faisal</p>'
             + '<div class="prose study-tutorial-intro">' + render_article(item) + '</div>'
             + tutorial_topics(item)
             + ('<h2>Kuliah terkait</h2><ul>' + related_links + '</ul>' if related else '') + '</article>')
