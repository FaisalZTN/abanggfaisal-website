import unittest

from study import validate_lecture_schedule


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
