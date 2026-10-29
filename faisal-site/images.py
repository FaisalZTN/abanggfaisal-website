"""Responsive WebP derivatives; sources and animated images remain untouched."""
import hashlib
import html
import json
import pathlib
from PIL import Image, ImageOps

ASSETS={}

def optimize(public, dist):
    ASSETS.clear()
    uploads=public/'uploads'
    out=dist/'generated';out.mkdir(exist_ok=True)
    report=[]
    if uploads.exists():
        for source in sorted(uploads.rglob('*')):
            if not source.is_file() or source.suffix.lower() not in {'.jpg','.jpeg','.png','.webp','.avif','.gif'}:continue
            url='/'+source.relative_to(public).as_posix()
            raw=source.read_bytes()
            try:
                with Image.open(source) as opened:
                    if getattr(opened,'n_frames',1)>1:
                        report.append({'source':url,'status':'animated-preserved','original_bytes':len(raw)});continue
                    im=ImageOps.exif_transpose(opened)
                    im=im.convert('RGBA' if 'A' in im.getbands() or 'transparency' in im.info else 'RGB')
                    w,h=im.size
                    if w<1 or h<1:raise ValueError('Invalid image dimensions')
                    variants=[]
                    digest=hashlib.sha256(raw+b'webp-q82-v1').hexdigest()[:20]
                    for width in sorted({min(w,480),min(w,960),min(w,1440)}):
                        resized=im.resize((width,max(1,round(h*width/w))),Image.Resampling.LANCZOS)
                        name=f'{digest}-{width}.webp';dest=out/name
                        resized.save(dest,'WEBP',quality=82,method=6)
                        if dest.stat().st_size<len(raw):variants.append({'src':'/generated/'+name,'width':width,'height':resized.height,'bytes':dest.stat().st_size})
                        else:dest.unlink()
                    default=variants[-1] if variants else {'src':url,'width':w,'height':h,'bytes':len(raw)}
                    ASSETS[url]={'default':default,'variants':variants,'width':w,'height':h}
                    report.append({'source':url,'status':'optimized' if variants else 'original-smaller','original_bytes':len(raw),'default_bytes':default['bytes'],'variants':variants})
            except (OSError,ValueError,Image.DecompressionBombError) as exc:
                raise ValueError('Cannot process image '+url+': '+str(exc)) from exc
    (dist/'image-report.json').write_text(json.dumps(report,indent=2))
    return report

def tag(src, alt, eager=False, css='cover'):
    e=lambda s:html.escape(str(s),quote=True)
    data=ASSETS.get(src); attrs=''
    if data:
        default=data['default'];src=default['src'];w=default['width'];h=default['height']
        if data['variants']:
            attrs=' srcset="'+e(', '.join(f'{v["src"]} {v["width"]}w' for v in data['variants']))+'" sizes="(max-width: 600px) calc(100vw - 36px), (max-width: 900px) 50vw, 720px"'
    else:w,h=1200,800
    return f'<img class="{e(css)}" src="{e(src)}" alt="{e(alt)}" width="{w}" height="{h}"{attrs} loading="{"eager" if eager else "lazy"}" decoding="async">'
