import unittest, json, pathlib, tempfile, shutil, subprocess, os
from editorial import normalize, render_article, image_url, https_url, available
P=pathlib.Path(__file__).parent
class ContentTests(unittest.TestCase):
 def article(self):return dict(id='fixture',title='Fixture',category='Life',short='Ringkasan',status='published',date='2026-10-29',body=['Paragraf lama.'],art=0)
 def product(self):return dict(id='fixture-product',title='Produk',category='Design',short='Ringkasan',status='published',price=99000,art=0,description='Deskripsi',format='PDF',license='Personal',checkout='')
 def test_legacy(self):
  for folder in ['journal','products']:
   for f in (P/'content'/folder).glob('*.json'):normalize(json.loads(f.read_text()),folder)
 def test_old_body_preserved(self):
  x=normalize(self.article(),'journal');self.assertIn(x['body'][0],render_article(x));self.assertEqual(x['minutes'],1)
 def test_markup_escaping(self):
  x=self.article();x['article']='## Judul\n\n**Tebal** dan *miring*\n\n- Satu\n- Dua\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))'
  result=render_article(x);self.assertIn('<h2>Judul</h2>',result);self.assertIn('<strong>Tebal</strong>',result);self.assertIn('<ul>',result);self.assertNotIn('<script>',result);self.assertNotIn('href="javascript:',result)
 def test_new_article_precedence(self):
  x=self.article();x['article']='Teks baru';self.assertEqual(render_article(x).strip(),'<p>Teks baru</p>')
 def test_legacy_date(self):
  x=self.article();x['date']='28 Oktober 2026';self.assertEqual(normalize(x,'journal')['iso_date'],'2026-10-28')
 def test_unsafe_urls(self):
  for u in ['javascript:alert(1)','https:foo','https://user:pass@example.com','https://example.com\\evil','//example.com']:self.assertFalse(https_url(u))
  self.assertTrue(https_url('https://example.com/product?id=123'))
 def test_media(self):
  for u in ['/uploads/../secret.png','//evil/x.png','/uploads/x.svg','/uploads/%2e%2e/x.png']:self.assertFalse(image_url(u))
  self.assertTrue(image_url('/uploads/cover.webp'))
 def test_availability(self):
  x=self.product();x['availability']='available'
  with self.assertRaises(ValueError):normalize(x,'products')
  x['checkout']='https://example.com/product';self.assertTrue(available(normalize(x,'products')))
  x['availability']='unavailable';self.assertFalse(available(normalize(x,'products')))
 def test_zero_price(self):
  x=self.product();x['price']=0;self.assertEqual(normalize(x,'products')['price'],0)
 def test_bad_price(self):
  for p in [-1,'100',True]:
   x=self.product();x['price']=p
   with self.assertRaises(ValueError):normalize(x,'products')
 def test_build_fixtures(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp)/'site';shutil.copytree(P,root,ignore=shutil.ignore_patterns('dist','__pycache__','.openai','.build-deps'))
   x=self.article();x.update(id='qa-article',article='## Section\n\nA **test**.',seo_title='SEO override',seo_description='SEO description',date='2026-10-30')
   (root/'content/journal/qa-article.json').write_text(json.dumps(x))
   p=self.product();p.update(id='qa-product',availability='available',checkout='https://example.com/pay',price=0)
   (root/'content/products/qa-product.json').write_text(json.dumps(p))
   draft=self.article();draft.update(id='qa-draft-hidden',status='draft')
   (root/'content/journal/qa-draft-hidden.json').write_text(json.dumps(draft))
   env=dict(os.environ,PREVIEW_CONTENT='0',CF_PAGES_BRANCH='review')
   subprocess.run(['python3','build.py'],cwd=root,env=env,check=True,capture_output=True)
   a=(root/'dist/journal/qa-article/index.html').read_text();self.assertIn('SEO override',a);self.assertIn('<strong>test</strong>',a);self.assertIn('noindex,nofollow',a);self.assertIn('Lanjutkan membaca',a)
   b=(root/'dist/shop/qa-product/index.html').read_text();self.assertIn('https://example.com/pay',b);self.assertIn('Gratis',b)
   self.assertFalse((root/'dist/journal/qa-draft-hidden').exists())
   h=(root/'dist/index.html').read_text();self.assertIn('/journal/qa-article/',h)
   self.assertIn('<h2>Fixture</h2>',(root/'dist/journal/index.html').read_text())
   self.assertIn('<h3>Fixture</h3>',h)
if __name__=='__main__':unittest.main()
