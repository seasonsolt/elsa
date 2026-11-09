"""Assemble the published page: shares its game logic with the 2D build."""
import re, base64
s=open('../ice-castle.html',encoding='utf8').read()
logic=re.search(r'<script id="logic">\n(.*?)</script>',s,re.S).group(1)
for a,b in (('elsa','frost'),('anna','nuan'),('艾莎','霜霜'),('安娜','暖暖')):
    logic=logic.replace(a,b)
t=open('page.template.html',encoding='utf8').read().replace('/*LOGIC*/',logic)
open('ice-castle-3d.html','w',encoding='utf8').write(t)
print(len(t))
for f in ('frost.glb','nuan.glb','props.glb','hall_env.hdr'):
    open(f'assets/{f}.b64.txt','w').write(base64.b64encode(open(f'assets/{f}','rb').read()).decode())
