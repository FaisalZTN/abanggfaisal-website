import hashlib
import json
import pathlib
import tempfile
import unittest
from html.parser import HTMLParser
from editorial import render_article, normalize
from images import optimize, tag, ASSETS
from PIL import Image

class AdvancedTests(unittest.TestCase):
 def render(self,s):return render_article({'article':s,'body':[]})
 def test_tables(self):
  s=self.render('| Nama | Isi |\n| --- | --- |\n| A | **B** |')
  self.assertIn('<table>',s);self.assertIn('tabindex="0"',s);self.assertIn('<strong>B</strong>',s)
 def test_nested_lists(self):
  s=self.render('1. Induk\n   - Anak\n   - Anak kedua\n2. Induk kedua')
  self.assertIn('<ol>',s);self.assertIn('<ul>',s)
 def test_code(self):
  s=self.render('```html\n<script>alert(1)</script>\n```')
  self.assertIn('<pre><code',s);self.assertIn('&lt;script&gt;',s);self.assertNotIn('<script>',s)
 def test_escape_html_and_unsafe_links(self):
  for source in ['<iframe src="https://evil.test"></iframe>','<img src=x onerror=alert(1)>','[test](javascript:alert(1))']:
   s=self.render(source);self.assertNotIn('<iframe',s);self.assertNotIn('<img',s);self.assertNotIn('href="javascript:',s)
 def test_inline_image(self):
  s=self.render('![Contoh](/uploads/example.png)');self.assertIn('class="inline-media"',s);self.assertIn('alt="Contoh"',s)
 def test_remote_image_rejected(self):
  for url in ['https://evil.test/x.png','/uploads/../x.png','/uploads/x.svg']:
   with self.assertRaises(ValueError):self.render('![X]('+url+')')
 def test_heading_one_becomes_two(self):self.assertIn('<h2>',self.render('# Judul'))
 def test_strikethrough(self):self.assertIn('<del>',self.render('~~lama~~'))
 def test_image_derivatives(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);public=root/'public';dist=root/'dist';(public/'uploads').mkdir(parents=True);dist.mkdir()
   path=public/'uploads/large.png';Image.new('RGBA',(2400,1600),(20,90,50,128)).save(path)
   original=path.read_bytes();before=hashlib.sha256(original).hexdigest()
   report=optimize(public,dist);x=ASSETS['/uploads/large.png']
   self.assertEqual([v['width'] for v in x['variants']],[480,960,1440]);self.assertLess(x['default']['bytes'],len(original));self.assertEqual(before,hashlib.sha256(path.read_bytes()).hexdigest())
   for v in x['variants']:
    with Image.open(dist/v['src'].lstrip('/')) as im:self.assertIn('A',im.getbands());self.assertEqual(im.width,v['width'])
   self.assertIn('srcset=',tag('/uploads/large.png','Test'))
 def test_small_images_never_upscale(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);p=root/'p';d=root/'d';(p/'uploads').mkdir(parents=True);d.mkdir();Image.new('RGB',(80,40),'blue').save(p/'uploads/small.png')
   optimize(p,d);self.assertTrue(all(v['width']<=80 for v in ASSETS['/uploads/small.png']['variants']))
 def test_animation_preserved(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);p=root/'p';d=root/'d';(p/'uploads').mkdir(parents=True);d.mkdir()
   Image.new('RGB',(20,20),'red').save(p/'uploads/a.gif',save_all=True,append_images=[Image.new('RGB',(20,20),'blue')],duration=100,loop=0)
   r=optimize(p,d);self.assertEqual(r[0]['status'],'animated-preserved');self.assertNotIn('/uploads/a.gif',ASSETS)
 def test_invalid_image_fails(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);p=root/'p';d=root/'d';(p/'uploads').mkdir(parents=True);d.mkdir();(p/'uploads/x.png').write_text('bad')
   with self.assertRaises(ValueError):optimize(p,d)
if __name__=='__main__':unittest.main()
