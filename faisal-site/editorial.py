"""Content normalization and deliberately small, escaped editorial markup."""
from build_deps import ensure
ensure()
import mistune
from images import tag
import datetime as dt
import html
import math
import re
from urllib.parse import urlsplit, unquote

def esc(value):
    return html.escape(str(value), quote=True)

def https_url(value):
    try:
        p = urlsplit(value)
        return p.scheme == 'https' and bool(p.hostname) and not p.username and not p.password and not re.search(r'[\s\\]',value)
    except ValueError:
        return False

def image_url(value):
    return bool(re.fullmatch(r'/uploads/[A-Za-z0-9_./-]+\.(?:png|jpe?g|webp|gif|avif)',value,re.I)) and '..' not in unquote(value)

def date_value(value):
    value=str(value)
    try:
        return dt.date.fromisoformat(value[:10])
    except ValueError:
        months='Januari Februari Maret April Mei Juni Juli Agustus September Oktober November Desember'.split()
        day,month,year=value.split()
        return dt.date(int(year),months.index(month)+1,int(day))

def normalize(x,kind):
    x=dict(x)
    for key in ['id','title','category','short','status']:
        if not isinstance(x.get(key),str) or not x[key].strip():raise ValueError(f'{key} wajib berupa teks')
    if not re.fullmatch(r'[a-z0-9-]+',x['id']):raise ValueError('Slug tidak valid')
    if x['status'] not in ['draft','published']:raise ValueError('Status tidak valid')
    x.setdefault('art',0)
    if type(x['art']) is not int or not 0<=x['art']<=6:raise ValueError('Palet harus 0–6')
    for key in ['cover','thumbnail']:
        value=x.get(key) or ''
        if value and not image_url(value):raise ValueError(f'{key}: gunakan gambar lokal /uploads/ tanpa spasi')
    if kind=='journal':
        body=x.get('body',[])
        if not isinstance(body,list) or not all(isinstance(p,str) for p in body):raise ValueError('body harus daftar paragraf teks')
        if not isinstance(x.get('article',''),str):raise ValueError('article harus teks')
        x['body']=body
        x['iso_date']=date_value(x['date']).isoformat()
        words=re.findall(r'\w+',x.get('article') or ' '.join(body))
        x['minutes']=max(1,math.ceil(len(words)/200))
    else:
        if type(x.get('price')) is not int or x['price']<0:raise ValueError('Harga harus bilangan bulat >= 0')
        x['checkout']=x.get('checkout') or ''
        if x['checkout'] and not https_url(x['checkout']):raise ValueError('Checkout harus URL HTTPS lengkap')
        x['availability']=x.get('availability') or ('available' if x['checkout'] else 'coming-soon')
        if x['availability'] not in ['available','coming-soon','unavailable']:raise ValueError('Ketersediaan tidak valid')
        if x['availability']=='available' and not x['checkout']:raise ValueError('Produk tersedia memerlukan checkout')
        for key in ['description','format','license']:
            if not isinstance(x.get(key),str):raise ValueError(f'{key} wajib teks')
        for p in x.get('previews') or []:
            if not isinstance(p,dict) or not image_url(p.get('image','')) or not p.get('alt'):raise ValueError('Preview memerlukan gambar lokal dan alt')
    return x

class ArticleRenderer(mistune.HTMLRenderer):
    def link(self, text, url, title=None):
        if not https_url(url):return text
        return '<a href="'+esc(url)+'" rel="noopener noreferrer">'+text+'</a>'
    def image(self, text, url, title=None):
        if not image_url(url):raise ValueError('Gambar artikel harus lokal /uploads/: '+url)
        return tag(url,html.unescape(re.sub('<[^>]*>','',text)),css='inline-media')
    def heading(self, text, level, **attrs):
        level=max(2,min(level,4))
        return f'<h{level}>'+text+f'</h{level}>\n'

renderer=ArticleRenderer(escape=True)
markdown=mistune.create_markdown(renderer=renderer,plugins=['table','strikethrough'])
def table(renderer,text):
    return '<div class="table-scroll" role="region" aria-label="Tabel artikel" tabindex="0"><table>'+text+'</table></div>\n'
renderer.register('table',table)

def render_article(x):
    if not x.get('article','').strip():return ''.join('<p>'+esc(p)+'</p>' for p in x['body'])
    return markdown(x['article'])

def media(x, fallback, eager=False):
    src=x.get('cover') or x.get('thumbnail')
    if not src:return fallback
    return tag(src,x.get('cover_alt') or x.get('thumbnail_alt') or x['title'],eager)

def available(x):return x.get('availability')=='available' and bool(x.get('checkout'))

def label(x):
    return {'coming-soon':'Segera hadir','unavailable':'Belum tersedia','available':'Rp'+format(x['price'],',').replace(',','.') if x['price'] else 'Gratis'}.get(x['availability'])
