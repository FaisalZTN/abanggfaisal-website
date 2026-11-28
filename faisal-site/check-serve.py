"""Serve the built site with gzip for browser and Lighthouse checks."""
import gzip
import io
from functools import lru_cache
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent / 'dist'
COMPRESSIBLE = {'.html', '.css', '.js', '.json', '.svg', '.xml'}


@lru_cache(maxsize=128)
def compressed(path, _mtime):
    return gzip.compress(path.read_bytes(), compresslevel=6, mtime=0)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = Path(self.translate_path(self.path))
        if path.is_dir() and self.path.partition('?')[0].endswith('/'):
            path = path / 'index.html'
        accepts_gzip = any(encoding.strip().lower() == 'gzip'
                           for encoding in self.headers.get('Accept-Encoding', '').split(','))
        if not path.is_file() or path.suffix not in COMPRESSIBLE or not accepts_gzip:
            return super().send_head()
        body = compressed(path, path.stat().st_mtime_ns)
        self.send_response(HTTPStatus.OK)
        self.send_header('Content-Type', self.guess_type(str(path)))
        self.send_header('Content-Encoding', 'gzip')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Vary', 'Accept-Encoding')
        self.end_headers()
        return io.BytesIO(body)


if __name__ == '__main__':
    with ThreadingHTTPServer(('127.0.0.1', 8080), Handler) as server:
        server.serve_forever()
