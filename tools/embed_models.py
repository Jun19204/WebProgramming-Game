"""Optional Blender-asset maintenance only. No tool is needed to play."""
from pathlib import Path
import base64
root=Path(__file__).resolve().parent.parent
names=['kestrel','needle','island']
s="(function () { 'use strict'; window.SkyStrike = window.SkyStrike || {}; window.SkyStrike.modelData = {\n"
s+=',\n'.join(repr(n)+': '+repr(base64.b64encode((root/'assets'/'models'/(n+'.glb')).read_bytes()).decode()) for n in names)
s+='\n}; })();\n'
(root/'assets'/'models.js').write_text(s,encoding='utf-8')
