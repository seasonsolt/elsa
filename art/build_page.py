"""Assemble ice-castle.html: keeps the shared game logic, inlines sprite sizes and the spoken lines."""
import re, json
p='../ice-castle.html'
s=open(p,encoding='utf8').read()
logic=re.search(r'<script id="logic">\n(.*?)</script>',s,re.S).group(1)
sizes=json.load(open('sizes.json'))
t=open('page.template.html',encoding='utf8').read().replace('/*LOGIC*/\n',logic).replace('/*SIZES*/',json.dumps(sizes,separators=(',',':'))).replace('/*LINES*/',json.dumps(json.load(open('lines.json',encoding='utf8')),ensure_ascii=False,separators=(',',':')))
open(p,'w',encoding='utf8').write(t)
print(len(t))
