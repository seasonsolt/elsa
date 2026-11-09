"""Cut generated sheets into game sprites: key out magenta, unmix edges, normalise scale, save webp."""
import os, numpy as np
from PIL import Image
from scipy import ndimage as ndi
OUT='game'; os.makedirs(OUT,exist_ok=True)
KEY=np.array([255,0,255],float)

def cutout(path):
    a=np.asarray(Image.open(path).convert('RGB'),float)
    # pure-key distance: magenta has high R,B and low G
    keyness=np.clip((np.minimum(a[...,0],a[...,2])-a[...,1])/255,0,1)
    d=np.linalg.norm(a-KEY,axis=2)
    alpha=np.clip((d-60)/110,0,1)
    alpha=np.where(keyness>.75,0,alpha)
    al=alpha[...,None]
    rgb=np.where(al>.02,(a-(1-al)*KEY)/np.maximum(al,.02),a)
    rgb=np.clip(rgb,0,255)
    # remove any remaining magenta cast on the fringe
    spill=np.clip(np.minimum(rgb[...,0],rgb[...,2])-rgb[...,1]-40,0,None)
    fringe=(alpha<.95)
    rgb[...,0]-=spill*fringe; rgb[...,2]-=spill*fringe
    return np.dstack([np.clip(rgb,0,255),alpha*255]).astype(np.uint8)

def comps(rgba,minarea=1500,dil=7):
    m=rgba[...,3]>40
    lab,n=ndi.label(ndi.binary_dilation(m,iterations=dil))
    out=[]
    for i,sl in enumerate(ndi.find_objects(lab)):
        reg=(lab[sl]==i+1)&m[sl]
        if reg.sum()<minarea: continue
        crop=rgba[sl].copy(); crop[...,3]=crop[...,3]*(lab[sl]==i+1)
        ys,xs=np.where(crop[...,3]>40)
        crop=crop[ys.min():ys.max()+1,xs.min():xs.max()+1]
        out.append(dict(img=crop,x=sl[1].start,y=sl[0].start,w=crop.shape[1],h=crop.shape[0],area=int(reg.sum())))
    return out

def rows(cs,tol):
    cs=sorted(cs,key=lambda c:c['y']+c['h']/2); res=[]; cur=[]
    for c in cs:
        cy=c['y']+c['h']/2
        if cur and cy-np.mean([k['y']+k['h']/2 for k in cur])>tol: res.append(cur); cur=[]
        cur.append(c)
    res.append(cur)
    return [sorted(r,key=lambda c:c['x']) for r in res]

def save(c,name,scale=None,size=None,q=88):
    im=Image.fromarray(c['img'],'RGBA')
    if size: im=im.resize(size,Image.LANCZOS)
    elif scale: im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.LANCZOS)
    im.save(f'{OUT}/{name}.webp',quality=q,method=6)
    return im.size

sizes={}
# sisters: one pose sheet and one run sheet each, scaled so a standing sister has a fixed height
def six(path):
    cs=sorted(comps(cutout(path)),key=lambda c:-c['area'])[:6]
    top=sorted(cs,key=lambda c:c['y']+c['h']/2)
    return sorted(top[:3],key=lambda c:c['x'])+sorted(top[3:],key=lambda c:c['x'])
def head_x(c):
    a=c['img'][...,3]>40; ys=np.where(a.any(1))[0]
    band=a[ys[0]:ys[0]+max(8,int(c['h']*.2))]
    return float(np.where(band)[1].mean())
def sister(c,name,scale):
    w,h=save(c,name,scale)
    sizes[name]=[w,h,round(head_x(c)*w/c['w'],1)]
for name,px in (('frost',170),('nuan',153)):
    poses=six(f'raw/poses_{name}.png'); run=six(f'raw/run_{name}.png')
    sp=px/poses[0]['h']; sr=px*.97/max(c['h'] for c in run)
    for fr,c in zip(('idle','blink','jump','fall','cast','cheer'),poses): sister(c,f'{name}_{fr}',sp)
    for i,c in enumerate(run): sister(c,f'{name}_run{i+1}',sr)
# tiles
t=rows(comps(cutout('raw/sheet_tiles.png')),130)
print([len(r) for r in t])
for n,c in zip(('shelf0','shelf1','shelf2','pinkice'),t[0]): sizes[n]=save(c,n,.6 if n.startswith('shelf') else None,(96,96) if n=='pinkice' else None)
for n,c in zip(('iceblock','frozen','plate_up','plate_down'),t[1]): sizes[n]=save(c,n,None,(96,96)) if n in('iceblock','frozen') else save(c,n,.5)
for n,c in zip(('gate','drift0','drift1','water'),t[2]): sizes[n]=save(c,n,.8)
g=rows(comps(cutout('raw/sheet_goals.png')),250)
print([len(r) for r in g])
for n,c,s in zip(('door_closed','door_open','flake','heart'),g[0],(.9,.9,.45,.45)): sizes[n]=save(c,n,s)
for n,c,s in zip(('ball','two','snowman','pile'),g[1],(.5,.8,.8,.5)): sizes[n]=save(c,n,s)
# backgrounds at the stage aspect, cut from the top
for n,src in (('bg0','hall_style'),('bg1','bg_lake'),('bg2','bg_tower'),('bg3','bg_ballroom')):
    im=Image.open(f'raw/{src}.png').convert('RGB'); h=round(im.width*520/960)
    im=im.crop((0,im.height-h,im.width,im.height)); im.save(f'{OUT}/{n}.webp',quality=82,method=6); sizes[n]=im.size
for n in ('door','gloves','lake','fall'):
    Image.open(f'raw/mem_{n}.png').convert('RGB').resize((1280,720),Image.LANCZOS).save(f'{OUT}/mem_{n}.webp',quality=82,method=6)
for n in ('frost','nuan'):
    im=Image.open(f'raw/portrait_{n}.png').convert('RGB'); h=round(im.width*4/3); im=im.crop((0,0,im.width,min(h,im.height)))
    im.resize((312,416),Image.LANCZOS).save(f'{OUT}/portrait_{n}.webp',quality=84,method=6)
for n in ('prologue','winter','thaw'):
    Image.open(f'raw/story_{n}.png').convert('RGB').resize((1280,720),Image.LANCZOS).save(f'{OUT}/story_{n}.webp',quality=82,method=6)
im=Image.open('raw/key_art2.png').convert('RGB'); h=round(im.width*520/960); im.crop((0,im.height-h,im.width,im.height)).save(f'{OUT}/key.webp',quality=84,method=6)
Image.open('raw/tex_brick.png').convert('RGB').resize((480,480),Image.LANCZOS).save(f'{OUT}/brick.webp',quality=82,method=6)
# effects painted on black: light becomes alpha, so they glow when layered
fx=np.asarray(Image.open('raw/sheet_fx.png').convert('RGB'),float)
ch,cw=fx.shape[0]/3,fx.shape[1]/3
for k,(n,px) in enumerate((('burst',200),('glow',200),('ring',200),('flake',56),('heart',56),('star',56),('steam',160),('dust',160),('splash',140))):
    cell=fx[int(k//3*ch):int((k//3+1)*ch),int(k%3*cw):int((k%3+1)*cw)]
    al=np.clip((cell.max(2)-14)/200,0,1)**.8
    m=al>.03
    if px<100:  # keep only the main shape
        lab,_=ndi.label(ndi.binary_dilation(m,iterations=6)); big=np.bincount(lab[m]).argmax(); al=al*(lab==big); m=al>.03
    ys,xs=np.where(m); cell,al=cell[ys.min():ys.max()+1,xs.min():xs.max()+1],al[ys.min():ys.max()+1,xs.min():xs.max()+1]
    rgb=np.clip(cell/np.maximum(al[...,None],.05),0,255)
    im=Image.fromarray(np.dstack([rgb,al*255]).astype(np.uint8),'RGBA')
    sc=px/max(im.size); im=im.resize((round(im.width*sc),round(im.height*sc)),Image.LANCZOS)
    im.save(f'{OUT}/fx_{n}.webp',quality=86,method=6); sizes[f'fx_{n}']=im.size
import json; json.dump(sizes,open('sizes.json','w'),indent=0); print(sizes)
