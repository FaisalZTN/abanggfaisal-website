"""Install pinned build-only dependencies without changing the Pages command."""
import importlib.metadata
import pathlib
import subprocess
import sys

def ensure():
    root=pathlib.Path(__file__).parent
    target=root/'.build-deps'
    if target.exists():sys.path.insert(0,str(target))
    wanted={'Pillow':'12.3.0','mistune':'3.4.0'}
    try:
        ready=all(importlib.metadata.version(k)==v for k,v in wanted.items())
    except importlib.metadata.PackageNotFoundError:
        ready=False
    if not ready:
        subprocess.run([sys.executable,'-m','pip','install','--disable-pip-version-check','--target',str(target),'--upgrade','-r',str(root/'requirements.txt')],check=True)
        if str(target) not in sys.path:sys.path.insert(0,str(target))
        importlib.invalidate_caches()
