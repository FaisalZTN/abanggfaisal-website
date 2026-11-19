import json
import unittest
from html import escape
from pathlib import Path
from tempfile import TemporaryDirectory

from study import build_study, validate_lecture_schedule


class LectureScheduleTests(unittest.TestCase):
    def test_date_and_page_are_required_together(self):
        for fields in ({'lecture_date': '2026-11-19'}, {'schedule_page': 2}):
            with self.subTest(fields=fields), self.assertRaisesRegex(ValueError, 'bersama-sama'):
                validate_lecture_schedule({'title': 'Contoh kuliah', **fields})

    def test_error_identifies_lecture_with_invalid_calendar_date(self):
        with self.assertRaisesRegex(ValueError, 'Contoh kuliah: tanggal kuliah'):
            validate_lecture_schedule({
                'title': 'Contoh kuliah', 'lecture_date': '2026-02-29', 'schedule_page': 2,
            })

    def test_missing_schedule_and_date_without_time_are_valid(self):
        validate_lecture_schedule({'title': 'Belum dijadwalkan'})
        validate_lecture_schedule({
            'title': 'Contoh kuliah', 'lecture_date': '2028-02-29', 'schedule_page': 2,
        })

    def test_schedule_page_is_positive_integer(self):
        for page in (0, -1, '2', True):
            with self.subTest(page=page), self.assertRaisesRegex(ValueError, 'bilangan bulat'):
                validate_lecture_schedule({
                    'title': 'Contoh kuliah', 'lecture_date': '2026-11-19', 'schedule_page': page,
                })


class StudyBlockTests(unittest.TestCase):
    def test_block_pages_and_calendar_use_only_their_own_entries(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            content = root / 'content'
            content.mkdir()
            (content / 'study-guidelines.json').write_text(json.dumps({'entries': [
                {'title': 'Rujukan bersama', 'url': 'https://example.org/guidelines', 'kind': 'portal'},
            ]}))
            fixtures = {
                'blocks': [
                    {'id': 'ksi', 'title': 'KSI', 'status': 'active'},
                    {'id': 'aktif-baru', 'title': 'Blok aktif baru', 'status': 'active',
                     'schedule_source': 'Jadwal Blok Baru'},
                    {'id': 'blok-berikutnya', 'title': 'Blok berikutnya', 'status': 'coming-soon'},
                ],
                'lectures': [
                    {'id': 'lama', 'title': 'Kuliah lama', 'teachers': ['pengajar-ksi']},
                    {'id': 'baru', 'title': 'Kuliah baru', 'block': 'aktif-baru', 'teachers': ['pengajar-baru']},
                    {'id': 'belum-aktif', 'title': 'Jadwal khusus pratinjau', 'block': 'blok-berikutnya',
                     'teachers': ['pengajar-ksi']},
                ],
                'teachers': [
                    {'id': 'pengajar-ksi', 'title': 'Pengajar KSI', 'department': 'Departemen KSI'},
                    {'id': 'pengajar-baru', 'title': 'Pengajar Baru', 'department': 'Departemen Baru',
                     'block': 'aktif-baru'},
                ],
                'tutorials': [
                    {'id': 'tutorial-baru', 'title': 'Tutorial Baru', 'block': 'aktif-baru',
                     'number': 1, 'status': 'published', 'short': 'Pengantar', 'article': 'Isi',
                     'related': ['baru']},
                ],
            }
            for lecture in fixtures['lectures']:
                lecture.update(department='Departemen', number=1, source_page='4', status='published',
                               lecture_date='2026-11-19', schedule_page=2,
                               lecture_start='08:00', lecture_end='10:00', objectives=['Sasaran belajar'])
            for collection, records in fixtures.items():
                folder = content / ('study-' + collection)
                folder.mkdir()
                for record in records:
                    (folder / (record['id'] + '.json')).write_text(json.dumps(record))

            pages = {}

            def write(path, title, description, body, section):
                pages[path] = body

            output = root / 'dist'
            build_study(root, output, write, lambda *args: '',
                        lambda value: escape(str(value)), lambda item: item['article'])
            legacy = '/ruang-belajar/'
            active = legacy + 'blok/aktif-baru/'
            pending = legacy + 'blok/blok-berikutnya/'
            self.assertIn('id="lama"', pages[legacy])
            self.assertNotIn('id="baru"', pages[legacy])
            self.assertIn('id="baru"', pages[active])
            self.assertIn('Jadwal Blok Baru', pages[active])
            self.assertIn('Sasaran belajar', pages[active])
            self.assertIn('Pengajar Baru', pages[active + 'pengajar/'])
            self.assertNotIn('Pengajar KSI', pages[active + 'pengajar/'])
            self.assertIn(active + '#baru', pages[active + 'tutorial/tutorial-baru/'])
            self.assertNotIn('Jadwal khusus pratinjau', pages[pending])
            self.assertNotIn('id="jadwal-kuliah"', pages[pending])
            for path in (legacy, active, pending):
                self.assertIn('Rujukan bersama', pages[path])

            old_calendar = (output / 'ruang-belajar/kalender/ksi.ics').read_text()
            new_calendar = (output / 'ruang-belajar/blok/aktif-baru/kalender/aktif-baru.ics').read_text()
            self.assertIn('UID:ksi-lama@', old_calendar)
            self.assertIn('UID:aktif-baru-baru@', new_calendar)
            self.assertNotIn('SUMMARY:Kuliah lama', new_calendar)
            self.assertFalse((output / 'ruang-belajar/blok/blok-berikutnya/kalender').exists())
