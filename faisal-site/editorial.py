"""Content normalization and deliberately small, escaped editorial markup."""
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

def inline(text):
    # Tokenize before rendering: user input can never become HTML attributes.
    pattern=r'\[([^\]\n]+)\]\((https://[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*'
    out=[]; last=0
    for m in re.finditer(pattern,text):
        out.append(esc(text[last:m.start()]))
        if m[1]:out.append(f'<a href="{esc(m[2])}" rel="noopener noreferrer">{esc(m[1])}</a>' if https_url(m[2]) else esc(m[0]))
        elif m[3]:out.append('<strong>'+esc(m[3])+'</strong>')
        else:out.append('<em>'+esc(m[4])+'</em>')
        last=m.end()
    return ''.join(out)+esc(text[last:])

def render_article(x):
    if not x.get('article','').strip():return ''.join('<p>'+esc(p)+'</p>' for p in x['body'])
    out=[]
    for block in re.split(r'\n\s*\n',x['article'].strip()):
        lines=block.splitlines()
        if all(l.startswith('- ') for l in lines):out.append('<ul>'+''.join('<li>'+inline(l[2:])+'</li>' for l in lines)+'</ul>')
        elif block.startswith('### '):out.append('<h3>'+inline(block[4:])+'</h3>')
        elif block.startswith('## '):out.append('<h2>'+inline(block[3:])+'</h2>')
        elif block.startswith('> '):out.append('<blockquote>'+inline(block[2:])+'</blockquote>')
        else:out.append('<p>'+inline(block)+'</p>')
    return ''.join(out)

def media(x, fallback, eager=False):
    src=x.get('cover') or x.get('thumbnail')
    if not src:return fallback
    return f'<img class="cover" src="{esc(src)}" alt="{esc(x.get("cover_alt") or x.get("thumbnail_alt") or x["title"])}" width="1200" height="800" loading="{"eager" if eager else "lazy"}" decoding="async">'

def available(x):return x.get('availability')=='available' and bool(x.get('checkout'))

def label(x):
    return {'coming-soon':'Segera hadir','unavailable':'Belum tersedia','available':'Rp'+format(x['price'],',').replace(',','.') if x['price'] else 'Gratis'}.get(x['availability'])
