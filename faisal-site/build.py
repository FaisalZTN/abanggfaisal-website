import json, html, pathlib, shutil, os, re, hashlib, subprocess
from urllib.parse import urlparse
from build_deps import ensure
ensure()
from study import build_study
from images import optimize, tag, ASSETS
from editorial import normalize, media, render_article, available, label, https_url
P=pathlib.Path(__file__).parent
D=P/'dist'
if D.exists(): shutil.rmtree(D)
shutil.copytree(P/'public',D)
optimize(P/'public',D)
def asset(name, data=None):
    if data is None: data=(P/'public'/name).read_bytes()
    path=pathlib.Path(name)
    versioned=path.stem+'.'+hashlib.sha256(data).hexdigest()[:12]+path.suffix
    (D/versioned).write_bytes(data)
    return '/'+versioned
gentleface_url = asset('gentleface-icons.svg')

def site_icon(name):
    return f'<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="{gentleface_url}#{name}"/></svg>'

def workroom_asset_data(name):
    return (P / 'public' / name).read_bytes().replace(b'/gentleface-icons.svg', gentleface_url.encode())

workroom_worker = D / '_worker.js'
workroom_source = workroom_worker.read_text(encoding='utf-8').replace('/gentleface-icons.svg', gentleface_url)
# Bundle the editor only for the Notes panel. Keep the existing Pages build command.
editor_lock = hashlib.sha256((P / 'package-lock.json').read_bytes()).hexdigest()
editor_stamp = P / 'node_modules/.workroom-editor-lock'
editor_bundler = P / 'node_modules/.bin/esbuild'
if not editor_bundler.exists() or not editor_stamp.exists() or editor_stamp.read_text() != editor_lock:
    subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=P, check=True)
    editor_stamp.write_text(editor_lock)
editor_bundle = subprocess.check_output([str(editor_bundler), 'workroom-block-editor.js', '--bundle', '--format=esm', '--minify'], cwd=P)
editor_url = asset('workroom-block-editor.js', editor_bundle)
workroom_note_format = asset('workroom-note-format.js')
workroom_image_upload = asset('workroom-image-upload.js')
workroom_source = workroom_source.replace(
    "import { notePreview, readBlockNote, noteBodyText } from './workroom-note-format.js';",
    (P / 'public/workroom-note-format.js').read_text(encoding='utf-8').replace('export function ', 'function '),
)
workroom_notes = D / 'workroom-notes.js'
workroom_notes_source = workroom_asset_data('workroom-notes.js').decode('utf-8').replace(
    "'./workroom-note-format.js'", f"'.{workroom_note_format}'"
)
workroom_notes_source = workroom_notes_source.replace('/workroom-block-editor.js', editor_url).replace('/workroom-image-upload.js', workroom_image_upload)
workroom_notes.write_text(workroom_notes_source, encoding='utf-8')
workroom_notes_url = asset('workroom-notes.js', workroom_notes_source.encode('utf-8'))
workroom_source = workroom_source.replace('"/workroom-notes.js"', f'"{workroom_notes_url}"')
for workroom_asset in ('workroom.css', 'workroom-theme.js', 'workroom-nav.js', 'workroom-greeting.js', 'workroom-calendar.js', 'workroom-agenda-check.js', 'workroom-review.js', 'workroom-private-notes.js', 'workroom-task-detail.js', 'workroom-quick-check.js', 'workroom-link-options.js', 'workroom-image-upload.js', 'workroom-hero.webp', 'workroom-favicon.svg'):
    source = workroom_asset_data(workroom_asset)
    if workroom_asset == 'workroom-task-detail.js':
        source = source.replace(b'/workroom-image-upload.js', workroom_image_upload.encode()).replace(
            b'/workroom-block-editor.js', editor_url.encode(),
        ).replace(b'/workroom-note-format.js', workroom_note_format.encode())
    workroom_source = workroom_source.replace(
        f'"/{workroom_asset}"', f'"{asset(workroom_asset, source)}"'
    )
workroom_worker.write_text(workroom_source, encoding='utf-8')
style_url=asset('style.css')
script_url=asset('app.js')
theme_bootstrap = '''<script>
(() => {
  let dark = matchMedia('(prefers-color-scheme: dark)').matches;
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light') dark = saved === 'dark';
  } catch {}
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name=theme-color]').content = dark ? '#18261f' : '#f6f4ed';
})();
</script>'''
editor_url=asset('admin/editor.js')
admin=D/'admin/index.html'
admin.write_text(admin.read_text().replace('/admin/editor.js',editor_url))
e=lambda x:html.escape(str(x),quote=True)
preview=os.getenv('PREVIEW_CONTENT')=='1'
noindex=preview or (bool(os.getenv('CF_PAGES_BRANCH')) and os.getenv('CF_PAGES_BRANCH')!='main')
def load(folder):
    items=[json.loads(p.read_text()) for p in sorted((P/'content'/folder).glob('*.json'))]
    items=[normalize(x,folder) for x in items]
    for x in items:
        for key in ['cover','thumbnail']:
            if x.get(key) and not (P/'public'/x[key].lstrip('/')).is_file():raise ValueError('Missing image: '+x[key])
        for img in x.get('previews') or []:
            if not (P/'public'/img['image'].lstrip('/')).is_file():raise ValueError('Missing preview image')
    if folder=='journal':items.sort(key=lambda x:(x['iso_date'],x['id']),reverse=True)
    else:items.sort(key=lambda x:(not x.get('featured',False),x['title']))
    assert len({x['id'] for x in items})==len(items),'Duplicate slug'
    return [x for x in items if preview or x['status']=='published']
articles=load('journal');products=load('products'); paths=[]
def art(n,label): return f'<div class="art tone-{int(n)%3}" aria-hidden="true"><span>{e(label)}</span><i></i></div>'
def card(x,kind,heading=3):
    url=f'/{kind}/{x["id"]}/'
    meta=x['category']+(' · '+x['iso_date']+' · '+str(x['minutes'])+' menit baca' if kind=='journal' else ' · Digital')
    return f'<a class="card" data-category="{e(x["category"])}" data-search="{e(x["title"]+" "+x["short"])}" href="{url}">{media(x,art(x["art"],"a thought to keep" if kind=="journal" else x["title"]))}<div class="meta">{e(meta)}</div><h{heading}>{e(x["title"])}</h{heading}><p>{e(x["short"])}</p><span class="text-link">'+('Baca tulisan @@external-link@@' if kind=='journal' else label(x))+'</span></a>'
def grid(items,kind,heading=3):return '<div class="grid">'+''.join(card(x,kind,heading) for x in items)+'</div>' if items else '<p class="notice">'+('Tulisan sedang dipersiapkan.' if kind=='journal' else 'Karya digital sedang dipersiapkan. Nantikan pembaruannya di sini.')+'</p>'
def head(eyebrow,title,desc):return f'<section class="page-hero"><div class="eyebrow">{eyebrow}</div><h1>{title}</h1><p class="intro">{desc}</p></section>'
def write(path,title,desc,body,section='home',item=None):
    item=item or {}
    brand = 'Faysaruworks' if section == 'shop' else 'abangfaisal'
    title=item.get('seo_title') or title
    desc=item.get('seo_description') or desc
    extra=''
    image = item.get('cover') or item.get('thumbnail') or '/social-cover.jpg'
    extra = f'<meta property="og:image" content="https://abanggfaisal.my.id{e(image)}">'
    if section=='journal' and item:
        extra+='<meta property="article:published_time" content="'+e(item['iso_date'])+'">'
    extra+='<meta name="twitter:card" content="summary_large_image">'
    canonical='https://abanggfaisal.my.id'+path
    nav=''.join(f'<a href="{url}"'+(' aria-current="page"' if section==key else '')+f'>{name}</a>' for key,url,name in [('home','/','Home'),('journal','/journal/','Journal'),('study','/ruang-belajar/','Ruang Belajar'),('shop','/shop/','Shop'),('about','/about/','About')])
    page=f'''<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{e(title)} — {brand}.</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{canonical}"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{canonical}"><meta property="og:type" content="{'article' if section=='journal' and item else 'website'}">{extra}<meta name="theme-color" content="#f6f4ed">{theme_bootstrap}<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="{style_url}"><script src="{script_url}" defer></script>{'<meta name="robots" content="noindex,nofollow">' if noindex or path=='/404.html' else ''}</head><body><a class="skip" href="#main">Lewati ke konten</a><header><div class="container header-inner"><a class="brand" href="/">{brand}<span>.</span></a><button id="menu" aria-controls="nav" aria-expanded="false">Menu ☰</button><nav id="nav" aria-label="Navigasi utama">{nav}<a href="https://abanggfaisal.my.id/workroom/">Workroom</a></nav><button id="theme" aria-label="Aktifkan mode gelap">◐</button></div></header><main id="main" class="container">{'<p class="notice">PRATINJAU · Termasuk konten draft untuk pemeriksaan.</p>' if preview else ''}{body}</main><footer class="container site-footer">
      <div class="site-footer-main">
        <div class="site-footer-brand">
          <a class="brand" href="/">{brand}<span>.</span></a>
          <p>Catatan, proses, dan karya yang terus bertumbuh.</p>
        </div>
        <nav aria-label="Navigasi footer">{nav}</nav>
      </div>
      <div class="site-footer-bottom">
        <small>© 2026 {brand}.</small>
        <a class="site-footer-social" href="https://www.instagram.com/abanggfaisal/">
          {site_icon("brand-instagram")}
          <span><span class="site-footer-platform">Instagram</span> @abanggfaisal</span>
        </a>
      </div>
    </footer><button id="back-to-top" type="button" aria-label="Kembali ke atas" title="Kembali ke atas" hidden>{site_icon("arrow-up")}</button></body></html>'''
    page = re.sub(r'@@(arrow-left|external-link|chevron-left|chevron-right)@@',
                  lambda match: site_icon(match[1]), page)
    for src in re.findall(r'<img[^>]+src="([^"]+)"',body):
        if not (D/html.unescape(src).lstrip('/')).is_file():raise ValueError('Missing rendered image: '+src)
    out=D/('404.html' if path=='/404.html' else path.strip('/')+'/index.html' if path!='/' else 'index.html');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(page)
    if path!='/404.html':paths.append(path)
journal_cover = next((item['cover'] for item in articles if item.get('cover')), '')
shop_cover = next((item['thumbnail'] for item in products if item.get('thumbnail')), '')
home_destinations = (
    ('Ruang Belajar', '/ruang-belajar/', 'Jadwal, materi, dan tutorial kuliah.', ''),
    ('Journal', '/journal/', 'Tulisan dan refleksi personal.', journal_cover),
    ('Shop', '/shop/', 'Karya digital dan materi belajar.', shop_cover),
    ('About', '/about/', 'Kenali Faisal dan cerita di balik situs ini.', ''),
)
carousel_cards = []
for destination_title, url, summary, cover in home_destinations:
    image = f'<img src="{e(cover)}" alt="" loading="lazy" decoding="async">' if cover else ''
    carousel_cards.append(
        f'<li><a href="{url}" class="{"has-cover" if image else "solid-panel"}">{image}'
        f'<strong>{destination_title}</strong><span>{summary}</span></a></li>'
    )
home_carousel = f"""
<section class="section home-carousel" aria-labelledby="home-carousel-title">
  <h2 id="home-carousel-title">Jelajahi situs</h2>
  <div class="home-carousel-window">
    <ul class="home-carousel-cards">{''.join(carousel_cards)}</ul>
  </div>
  <div class="home-carousel-controls" hidden>
    <button type="button" data-step="-1" aria-label="Kartu sebelumnya">@@chevron-left@@</button>
    <span class="home-carousel-status" aria-live="polite"></span>
    <button type="button" data-step="1" aria-label="Kartu berikutnya">@@chevron-right@@</button>
  </div>
</section>
"""
write('/','Ruang untuk berpikir, menulis, dan berkarya','Journal personal dan karya digital Faisal.',f'''<section class="hero"><div><div class="eyebrow">A PERSONAL SPACE · EST. 2026</div><h1>Thoughts to keep.<br><em>Stories to share.</em></h1><p class="intro">Ruang kecil untuk merawat rasa ingin tahu, menuliskan pengalaman, dan membagikan karya yang berguna.</p><div class="actions"><a class="btn" href="/journal/">Jelajahi Journal @@external-link@@</a><a class="text-link" href="/shop/">Temukan karya saya @@external-link@@</a><a class="text-link" href="/ruang-belajar/#ringkasan-jadwal">Jadwal kuliah hari ini</a></div></div>{art(1,'a quiet place to begin')}</section>{home_carousel}<section class="section"><div class="section-head"><div><div class="eyebrow">01 / WORDS & REFLECTIONS</div><h2>From the journal.</h2></div><a href="/journal/">Semua tulisan @@external-link@@</a></div>{grid(articles[:3],'journal')}</section><section class="section"><div class="section-head"><div><div class="eyebrow">02 / DIGITAL CREATIONS</div><h2>Made with intention.</h2></div><a href="/shop/">Kunjungi Shop @@external-link@@</a></div>{grid(products[:3],'shop')}</section><section class="section split"><div><div class="eyebrow">03 / THE PERSON BEHIND IT</div><h2>Belajar. Mencatat.<br><em>Berbagi.</em></h2></div><div><p class="intro">Saya Faisal, mahasiswa kedokteran yang tertarik pada proses belajar, tulisan reflektif, dan desain. Website ini menjadi ruang untuk mempertemukan ketiganya.</p><a href="/about/">Kenali saya lebih dekat @@external-link@@</a></div></section>''')
for kind,items,title,desc in [('journal',articles,'A collection of thoughts.','Refleksi, opini, dan catatan personal. Satu tulisan, satu cara baru melihat pengalaman.'),('shop',products,'Useful things, thoughtfully made.','E-book, template, desain, dan materi pembelajaran untuk menemani proses Anda.')]:
    cats=sorted({x['category'] for x in items})
    toolbar='<div class="toolbar"><label for="search">Cari '+('tulisan' if kind=='journal' else 'produk')+'</label><input id="search" type="search" placeholder="Ketik kata kunci…"><label for="category">Kategori</label><select id="category"><option value="">Semua kategori</option>'+''.join(f'<option>{e(c)}</option>' for c in cats)+'</select></div><p id="count" role="status"></p>' if items else ''
    write('/'+kind+'/',kind.title(),desc,head('THE '+kind.upper(),title,desc)+toolbar+'<div id="results">'+grid(items,kind,2)+'</div>'+'<p id="empty" hidden>Tidak ditemukan. Coba kata kunci atau kategori lain.</p>',kind)
for a in articles:
    body='<article class="reading"><a href="/journal/">@@arrow-left@@ Kembali ke Journal</a>'+head(e(a['category'])+' · '+e(a['iso_date']),e(a['title']),e(a['short']))+f'<p class="meta">{a["minutes"]} menit baca · Faisal</p>'+media(a,'',True)+'<div class="prose">'+render_article(a)+'</div>'+'<hr><a href="/journal/">Jelajahi tulisan lainnya @@external-link@@</a></article>'
    related=sorted([x for x in articles if x['id']!=a['id']],key=lambda x:x['category']!=a['category'])[:3]
    if related:body+='<section class="section"><h2>Lanjutkan membaca.</h2>'+grid(related,'journal')+'</section>'
    write('/journal/'+a['id']+'/',a['title'],a['short'],body,'journal',a)
for p in products:
    checkout=p.get('checkout','');price='Rp'+format(p['price'],',').replace(',','.') if p['price'] else 'Gratis'
    purchasable = available(p)
    cta = (f'<a class="btn" href="{e(checkout)}" rel="noopener noreferrer">Beli melalui penyedia checkout @@external-link@@</a>'
           if purchasable else '')
    status = '' if purchasable else f'<p class="notice">{e(label(p))}. Produk ini belum bisa dibeli.</p>'
    provider_link=('<p><a href="'+e(p['catalog_url'])+'" rel="noopener noreferrer">Lihat informasi produk di Mayar @@external-link@@</a></p>') if p.get('catalog_url') else ''
    fulfillment = p.get('fulfillment_note') or ('Pembayaran dan pengiriman file ditangani penyedia checkout. '
                  'Periksa ketentuan produk di halaman checkout.' if purchasable else '')
    fulfillment_html = f'<p class="meta">{e(fulfillment)}</p>' if fulfillment else ''
    info = (f'<div class="product-info"><a href="/shop/">@@arrow-left@@ Kembali ke Shop</a>'
            f'<section class="page-hero"><div class="eyebrow">{e(p["category"])}</div>'
            f'<h1>{e(p["title"])}</h1>{status}<p class="intro">{e(p["description"])}</p></section>'
            f'<p>{price}</p><p>Format: {e(p["format"])}</p><p>{e(p["license"])}</p>'
            f'{cta}{provider_link}{fulfillment_html}</div>')
    body = f'<section class="product-layout">{info}{media(p,art(p["art"],p["title"]),True)}</section>'
    previews=p.get('previews') or []
    if previews:body+='<section class="section"><h2>Lebih dekat dengan produk.</h2><div class="grid">'+''.join('<figure>'+tag(x['image'],x['alt'])+'<figcaption>'+e(x.get('caption',''))+'</figcaption></figure>' for x in previews)+'</div></section>'
    write('/shop/'+p['id']+'/',p['title'],p['short'],body,'shop',p)
profile=json.loads((P/'content/profile.json').read_text())
contact=profile.get('contact_url','')
if contact and not https_url(contact):raise ValueError('Kontak harus URL HTTPS lengkap')
about=head('BEHIND THE WORDS','Hello, I’m Faisal.',e(profile['intro']))+'<section class="section split"><div class="monogram" aria-hidden="true">f.</div><div class="about"><h2>Rasa ingin tahu<br>sebagai titik berangkat.</h2>'+''.join('<p>'+e(t)+'</p>' for t in profile['story'])+'<a class="btn" href="/journal/">Baca catatan saya @@external-link@@</a></div></section><section class="section"><div class="eyebrow">WHAT I KEEP COMING BACK TO</div><h2>Bidang yang saya jelajahi.</h2><ul class="interests">'+''.join('<li>'+e(t)+'</li>' for t in profile['interests'])+'</ul></section><section class="section split"><div><h2>Dari pemikiran<br>menjadi karya.</h2></div><div><p class="intro">Tulisan personal saya tersimpan di Journal. Karya digital dan materi pembelajaran dapat dijelajahi melalui Shop.</p><a href="/shop/">Jelajahi karya digital @@external-link@@</a></div></section>'
if contact and profile.get('contact_approved') is True:about+='<section class="section"><h2>Mari terhubung.</h2><a class="btn" href="'+e(contact)+'" rel="noopener noreferrer">Hubungi saya @@external-link@@</a></section>'
write('/about/','Tentang Faisal','Mengenal Faisal, pembelajar di antara kedokteran, tulisan, dan desain.',about,'about')
build_study(P, D, write, head, e, render_article, preview)
write('/404.html','Halaman tidak ditemukan','Halaman tidak tersedia.',head('404','A little off the page.','Halaman yang Anda cari tidak tersedia.')+'<a class="btn" href="/">Kembali ke Home</a>')
(D/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>https://abanggfaisal.my.id'+x+'</loc></url>' for x in paths)+'</urlset>')
(D/'robots.txt').write_text('User-agent: *\n'+('Disallow: /' if noindex else 'Allow: /\nSitemap: https://abanggfaisal.my.id/sitemap.xml')+'\n')
print(f'Built {len(paths)} pages; preview={preview}')
