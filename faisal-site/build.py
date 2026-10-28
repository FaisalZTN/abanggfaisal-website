import json, html, pathlib, shutil, os, re
from urllib.parse import urlparse
P=pathlib.Path(__file__).parent
D=P/'dist'
if D.exists(): shutil.rmtree(D)
shutil.copytree(P/'public',D)
e=lambda x:html.escape(str(x),quote=True)
preview=os.getenv('PREVIEW_CONTENT')=='1'
def load(folder):
    items=[json.loads(p.read_text()) for p in sorted((P/'content'/folder).glob('*.json'))]
    for x in items:
        assert re.fullmatch(r'[a-z0-9-]+',x['id']), 'Invalid slug'
        assert x['status'] in ['draft','published']
        if x.get('checkout'): assert urlparse(x['checkout']).scheme=='https','Checkout must be HTTPS'
    assert len({x['id'] for x in items})==len(items),'Duplicate slug'
    return [x for x in items if preview or x['status']=='published']
articles=load('journal');products=load('products'); paths=[]
def art(n,label): return f'<div class="art tone-{int(n)%3}" aria-hidden="true"><span>{e(label)}</span><i></i></div>'
def card(x,kind):
    url=f'/{kind}/{x["id"]}/'
    meta=x['category']+(' · '+str(x['minutes'])+' menit baca' if kind=='journal' else ' · Digital')
    return f'<a class="card" data-category="{e(x["category"])}" data-search="{e(x["title"]+" "+x["short"])}" href="{url}">{art(x["art"],"a thought to keep" if kind=="journal" else x["title"])}<div class="meta">{e(meta)}</div><h3>{e(x["title"])}</h3><p>{e(x["short"])}</p><span class="text-link">'+('Baca tulisan ↗' if kind=='journal' else ('Lihat produk ↗' if x.get('checkout') else 'Segera hadir'))+'</span></a>'
def grid(items,kind):return '<div class="grid" id="results">'+''.join(card(x,kind) for x in items)+'</div>' if items else '<p class="notice">'+('Tulisan sedang dipersiapkan.' if kind=='journal' else 'Karya digital sedang dipersiapkan. Nantikan pembaruannya di sini.')+'</p>'
def head(eyebrow,title,desc):return f'<section class="page-hero"><div class="eyebrow">{eyebrow}</div><h1>{title}</h1><p class="intro">{desc}</p></section>'
def write(path,title,desc,body,section='home'):
    canonical='https://abanggfaisal.my.id'+path
    nav=''.join(f'<a href="{url}"'+(' aria-current="page"' if section==key else '')+f'>{name}</a>' for key,url,name in [('home','/','Home'),('journal','/journal/','Journal'),('shop','/shop/','Shop'),('about','/about/','About')])
    page=f'''<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{e(title)} — abangfaisal.</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{canonical}"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{canonical}"><meta property="og:type" content="website"><meta name="theme-color" content="#f6f4ed"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><script src="/app.js" defer></script>{'<meta name="robots" content="noindex,nofollow">' if preview else ''}</head><body><a class="skip" href="#main">Lewati ke konten</a><header><div class="container header-inner"><a class="brand" href="/">abangfaisal<span>.</span></a><button id="menu" aria-controls="nav" aria-expanded="false">Menu ☰</button><nav id="nav" aria-label="Navigasi utama">{nav}</nav><button id="theme" aria-label="Aktifkan mode gelap">◐</button></div></header><main id="main" class="container">{'<p class="notice">PRATINJAU · Tulisan dan produk berikut adalah contoh, belum diterbitkan.</p>' if preview else ''}{body}</main><footer class="container"><a class="brand" href="/">abangfaisal.</a><p>Catatan, proses, dan karya yang terus bertumbuh.</p><nav aria-label="Navigasi footer">{nav}</nav><small>© 2026 abangfaisal.</small></footer></body></html>'''
    out=D/('404.html' if path=='/404.html' else path.strip('/')+'/index.html' if path!='/' else 'index.html');out.parent.mkdir(parents=True,exist_ok=True);out.write_text(page)
    if path!='/404.html':paths.append(path)
write('/','Ruang untuk berpikir, menulis, dan berkarya','Journal personal dan karya digital Faisal.',f'''<section class="hero"><div><div class="eyebrow">A PERSONAL SPACE · EST. 2026</div><h1>Thoughts to keep.<br><em>Stories to share.</em></h1><p class="intro">Ruang kecil untuk merawat rasa ingin tahu, menuliskan pengalaman, dan membagikan karya yang berguna.</p><div class="actions"><a class="btn" href="/journal/">Jelajahi Journal ↗</a><a class="text-link" href="/shop/">Temukan karya saya ↗</a></div></div>{art(1,'a quiet place to begin')}</section><section class="section"><div class="section-head"><div><div class="eyebrow">01 / WORDS & REFLECTIONS</div><h2>From the journal.</h2></div><a href="/journal/">Semua tulisan ↗</a></div>{grid(articles[:3],'journal')}</section><section class="section"><div class="section-head"><div><div class="eyebrow">02 / DIGITAL CREATIONS</div><h2>Made with intention.</h2></div><a href="/shop/">Kunjungi Shop ↗</a></div>{grid(products[:3],'shop')}</section><section class="section split"><div><div class="eyebrow">03 / THE PERSON BEHIND IT</div><h2>Belajar. Mencatat.<br><em>Berbagi.</em></h2></div><div><p class="intro">Saya Faisal, mahasiswa kedokteran yang tertarik pada proses belajar, tulisan reflektif, dan desain. Website ini menjadi ruang untuk mempertemukan ketiganya.</p><a href="/about/">Kenali saya lebih dekat ↗</a></div></section>''')
for kind,items,title,desc in [('journal',articles,'A collection of thoughts.','Refleksi, opini, dan catatan personal. Satu tulisan, satu cara baru melihat pengalaman.'),('shop',products,'Useful things, thoughtfully made.','E-book, template, desain, dan materi pembelajaran untuk menemani proses Anda.')]:
    cats=sorted({x['category'] for x in items})
    toolbar='<div class="toolbar"><label for="search">Cari '+('tulisan' if kind=='journal' else 'produk')+'</label><input id="search" type="search" placeholder="Ketik kata kunci…"><label for="category">Kategori</label><select id="category"><option value="">Semua kategori</option>'+''.join(f'<option>{e(c)}</option>' for c in cats)+'</select></div><p id="count" role="status"></p>' if items else ''
    write('/'+kind+'/',kind.title(),desc,head('THE '+kind.upper(),title,desc)+toolbar+grid(items,kind)+'<p id="empty" hidden>Tidak ditemukan. Coba kata kunci atau kategori lain.</p>',kind)
for a in articles:
    body='<article class="reading"><a href="/journal/">← Kembali ke Journal</a>'+head(e(a['category'])+' · '+e(a['date']),e(a['title']),e(a['short']))+f'<p class="meta">{a["minutes"]} menit baca · Faisal</p>'+''.join('<p>'+e(p)+'</p>' for p in a['body'])+'<hr><a href="/journal/">Jelajahi tulisan lainnya ↗</a></article>'
    write('/journal/'+a['id']+'/',a['title'],a['short'],body,'journal')
for p in products:
    checkout=p.get('checkout','');price='Rp'+format(p['price'],',').replace(',','.') if p['price'] else 'Harga belum ditetapkan'
    cta=f'<a class="btn" href="{e(checkout)}" rel="noopener noreferrer">Beli melalui penyedia checkout ↗</a>' if checkout else '<p class="notice">Segera hadir. Produk ini belum dapat dibeli.</p>'
    body=f'<section class="product-layout">{art(p["art"],p["title"])}<div><a href="/shop/">← Kembali ke Shop</a>'+head(e(p['category']),e(p['title']),e(p['description']))+f'<p>{price}</p><p>Format: {e(p["format"])}</p><p>{e(p["license"])}</p>'+cta+'<p class="meta">Jika tersedia, pembayaran dan pengiriman file ditangani penyedia checkout. Periksa ketentuan produk di halaman checkout.</p></div></section>'
    write('/shop/'+p['id']+'/',p['title'],p['short'],body,'shop')
write('/about/','Tentang Faisal','Mengenal Faisal, pembelajar di antara kedokteran, tulisan, dan desain.',head('BEHIND THE WORDS','Hello, I’m Faisal.','Pembelajar di antara kedokteran, tulisan, dan desain.')+'<section class="section split"><div class="monogram" aria-hidden="true">f.</div><div class="about"><h2>Rasa ingin tahu<br>sebagai titik berangkat.</h2><p>Saya mahasiswa kedokteran di FKIK Universitas Lambung Mangkurat. Saya menyukai cara anatomi dan fisiologi membantu menjelaskan hubungan sebab dan akibat dalam tubuh manusia.</p><p>Di luar proses belajar, saya tertarik pada desain dan media pendidikan. Menulis menjadi cara untuk merapikan pemikiran dan memahami pengalaman.</p><p>Di Journal, saya membagikan refleksi dan catatan personal. Di Shop, saya menyiapkan karya digital yang diharapkan dapat membantu orang lain belajar dan berkarya.</p><a class="btn" href="/journal/">Baca catatan saya ↗</a></div></section>','about')
write('/404.html','Halaman tidak ditemukan','Halaman tidak tersedia.',head('404','A little off the page.','Halaman yang Anda cari tidak tersedia.')+'<a class="btn" href="/">Kembali ke Home</a>')
(D/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>https://abanggfaisal.my.id'+x+'</loc></url>' for x in paths)+'</urlset>')
(D/'robots.txt').write_text('User-agent: *\n'+('Disallow: /' if preview else 'Allow: /\nSitemap: https://abanggfaisal.my.id/sitemap.xml')+'\n')
print(f'Built {len(paths)} pages; preview={preview}')
