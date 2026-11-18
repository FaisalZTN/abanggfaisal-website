import subprocess,os,pathlib,json
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
P=pathlib.Path(__file__).parent
class Parser(HTMLParser):
    def __init__(self):super().__init__();self.links=[];self.ids=set();self.h1=0
    def handle_starttag(self,t,a):
        a=dict(a)
        if a.get('id'):self.ids.add(a['id'])
        if t=='a':self.links.append(a.get('href',''))
        if t=='h1':self.h1+=1
for preview in [False,True]:
    env=dict(os.environ,PREVIEW_CONTENT='1' if preview else '0');subprocess.run(['python3','build.py'],cwd=P,env=env,check=True)
    files=list((P/'dist').rglob('*.html'))
    for f in files:
        if 'admin' in f.parts:continue
        s=f.read_text();p=Parser();p.feed(s);assert p.h1==1,f
        assert '<link rel="canonical"' in s and 'name="description"' in s
        for u in p.links:
            if not u.startswith('/') or u.startswith('//'):continue
            target=urlsplit(u)
            path=P/'dist'/target.path.lstrip('/')
            if path.is_dir():path=path/'index.html'
            assert path.is_file(),(f,u)
            if target.fragment:
                linked=Parser()
                linked.feed(path.read_text())
                assert unquote(target.fragment) in linked.ids,(f,u)
    for folder,route in [('journal','journal'),('products','shop')]:
        for file in (P/'content'/folder).glob('*.json'):
            item=json.loads(file.read_text())
            assert (P/'dist'/route/item['id']/'index.html').exists()==(preview or item['status']=='published')
    assert ('noindex,nofollow' in (P/'dist/index.html').read_text())==preview
subprocess.run(['python3','build.py'],cwd=P,env=dict(os.environ,PREVIEW_CONTENT='0'),check=True)
print('PASS: production/preview builds, internal links, one H1, metadata, draft isolation')
