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

# ---- kids' edition: word icons, UI icons, keys, fish, snowman hat (sheets are optional: skipped if the raw is missing) ----
import json
def tight(rgba):
    ys,xs=np.where(rgba[...,3]>40)
    return rgba[ys.min():ys.max()+1,xs.min():xs.max()+1]
def put(rgba,name,w=None,h=None,maxdim=None,canvas=None,q=80):
    """resize (keeping aspect) to width w / height h / longest side maxdim, optionally centre on a transparent canvas, save webp; returns size"""
    im=Image.fromarray(rgba,'RGBA')
    sc=(w/im.width) if w else (h/im.height) if h else maxdim/max(im.size)
    im=im.resize((max(1,round(im.width*sc)),max(1,round(im.height*sc))),Image.LANCZOS)
    if canvas:
        c=Image.new('RGBA',(canvas,canvas),(0,0,0,0)); c.paste(im,((canvas-im.width)//2,(canvas-im.height)//2)); im=c
    im.save(f'{OUT}/{name}.webp',quality=q,method=6)
    return list(im.size)
GOLD=np.array([255,208,90.])
def unmix_glow(rgba,raw):
    """a lantern halo painted as gold over the magenta key reads as opaque salmon pink: un-mix it (pixel = a*gold + (1-a)*magenta, a from the green channel)"""
    R,G,B=raw[...,0],raw[...,1],raw[...,2]
    a=np.clip(G/GOLD[1],0,1); bexp=a*GOLD[2]+(1-a)*255
    m=(R>235)&(a<.97)&(np.abs(B-bexp)<28)&(a>.04)
    rgba[m,:3]=GOLD; rgba[m,3]=(a[m]*215).astype(np.uint8)
    return rgba
def grid_cells(path,cols,rows_n,minarea=150,dil=3,fix=None):
    """one icon per grid cell: regions are grouped by the cell their centre falls in (a drifting icon still lands in the right cell)"""
    rgba=cutout(path); H,W=rgba.shape[:2]
    if fix: rgba=fix(rgba,np.asarray(Image.open(path).convert('RGB'),float))
    m=rgba[...,3]>40
    lab,n=ndi.label(ndi.binary_dilation(m,iterations=dil))
    cells={}
    for i in range(1,n+1):
        reg=(lab==i)&m
        if reg.sum()<minarea: continue
        ys,xs=np.where(reg); k=(min(rows_n-1,int(ys.mean()/H*rows_n)),min(cols-1,int(xs.mean()/W*cols)))
        cells.setdefault(k,np.zeros_like(m)); cells[k]|=(lab==i)
    out={}
    for (r,c),mask in cells.items():
        crop=rgba.copy(); crop[...,3]=crop[...,3]*mask
        out[r*cols+c]=tight(crop)
    return out
def sheet_icons(sheet,spec,rule,fix=None):
    path=f'raw/{sheet}.png'
    if not os.path.exists(path): print('skip',path); return
    cells=grid_cells(path,*spec['grid'],fix=fix)
    for i,wid in enumerate(spec['cells']):
        if i not in cells: print('MISSING cell',sheet,i,wid); continue
        rule(wid,cells[i])
def glow_fix(img):
    """warm glows painted over magenta keep a pink cast in their translucent pixels: pull blue down there"""
    img=img.copy(); f=img[...,3]<240; g=img[...,1].astype(float)
    img[...,2]=np.where(f,np.minimum(img[...,2],g*.5),img[...,2]).astype(np.uint8)
    return img
def word_rule(wid,img):
    if wid.startswith('alt_'): sizes['alt_word_'+wid[4:]]=put(img,'alt_word_'+wid[4:],maxdim=232,canvas=256)   # spare pictures, not copied to game/
    else: sizes['word_'+wid]=put(img,'word_'+wid,maxdim=232,canvas=256)
if os.path.exists('raw/word_sheets.json'):
    for sh,spec in json.load(open('raw/word_sheets.json')).items(): sheet_icons(sh,spec,word_rule,fix=unmix_glow if sh=='word_sheet_3' else None)
ui_spec=json.load(open('raw/ui_sheets.json')) if os.path.exists('raw/ui_sheets.json') else {}
def ui_rule(name,img):
    if name=='hat_snowman': sizes[name]=put(img,name,w=120)
    else: sizes[name]=put(img,name,maxdim={'ui_play':256,'ui_meet':224}.get(name,192))
if 'ui_1' in ui_spec: sheet_icons('ui_1',ui_spec['ui_1'],ui_rule)
if os.path.exists('raw/ui_2.png'):
    r=cutout('raw/ui_2.png'); H=r.shape[0]
    e=[0,round(H*.51),round(H*.72),H]   # the three horizontal bands of the prompt
    top,mid,bot=r[e[0]:e[1]],r[e[1]:e[2]],r[e[2]:e[3]]
    # unlit key cluster: rects of the 4 keys inside the saved image
    ks=comps(top,minarea=3000,dil=1); assert len(ks)==4,f'expected 4 keys in the cluster, got {len(ks)}'
    ys,xs=np.where(top[...,3]>40); gx,gy=xs.min(),ys.min(); grp=tight(top); s=320/grp.shape[1]
    sizes['ui_keys']=put(grp,'ui_keys',w=320)
    ks=sorted(ks,key=lambda c:(round(c['y']/60),c['x']))   # up, left, right, space
    rect={n:[round((c['x']-gx)*s),round((c['y']-gy)*s),round(c['w']*s),round(c['h']*s)] for n,c in zip(('up','left','right','space'),ks)}
    # lit keys: scaled so the solid cap matches the unlit key, centred on it, halo spills over; layout gives the centre in ui_keys pixels
    lit=sorted(comps(mid,minarea=3000,dil=1),key=lambda c:c['x']); assert len(lit)==4,f'expected 4 lit keys, got {len(lit)}'
    layout={}
    for n,c in zip(('left','right','up','space'),lit):
        a=c['img'][...,3]; yy,xx=np.where(a>235); solid_w=xx.max()-xx.min()+1
        sc=rect[n][2]/solid_w
        sizes['ui_key_'+n]=put(glow_fix(c['img']),'ui_key_'+n,w=round(c['w']*sc))
        layout[n]=[rect[n][0]+rect[n][2]//2,rect[n][1]+rect[n][3]//2]
    sizes['ui_keys_rects']=rect; sizes['ui_keys_centers']=layout   # {up,left,right,space}: [x,y,w,h] / [cx,cy] in ui_keys pixels
    # fish: two swim frames, one common scale and canvas, aligned on the centre of mass so the body does not jump
    fs=sorted(comps(bot,minarea=3000,dil=3),key=lambda c:c['x']); assert len(fs)==2,f'expected 2 fish, got {len(fs)}'
    sc=96/max(c['w'] for c in fs); ims=[]
    for c in fs:
        im=Image.fromarray(c['img'],'RGBA'); im=im.resize((round(im.width*sc),round(im.height*sc)),Image.LANCZOS)
        a=np.asarray(im)[...,3].astype(float); yy,xx=np.mgrid[:a.shape[0],:a.shape[1]]
        ims.append((im,(xx*a).sum()/a.sum(),(yy*a).sum()/a.sum()))
    L=max(i[1] for i in ims); R=max(i[0].width-i[1] for i in ims); T=max(i[2] for i in ims); B=max(i[0].height-i[2] for i in ims)
    cw,chh=round(L+R)+1,round(T+B)+1
    for k,(im,cx,cy) in enumerate(ims):
        cv=Image.new('RGBA',(cw,chh),(0,0,0,0)); cv.paste(im,(round(L-cx),round(T-cy))); cv.save(f'{OUT}/fish_{k+1}.webp',quality=82,method=6); sizes[f'fish_{k+1}']=[cw,chh]

# ---- rooms edition (agent d): tiles/toys, notes, bunny, floe, stickers, room backgrounds, memories (every sheet is optional: skipped if the raw is missing) ----
TILE_PX=96   # tile-sized sprites are drawn 96 px for a 40 px game tile (like pinkice/iceblock); the view scales them
def canvas_bottom(rgba,scale,cw,ch):
    """scale an RGBA crop and paste it bottom-centre on a transparent cw x ch canvas"""
    im=Image.fromarray(rgba,'RGBA'); im=im.resize((max(1,round(im.width*scale)),max(1,round(im.height*scale))),Image.LANCZOS)
    cv=Image.new('RGBA',(cw,ch),(0,0,0,0)); cv.paste(im,((cw-im.width)//2,ch-im.height)); return cv
def save_rgba(im,name,q=80):
    im.save(f'{OUT}/{name}.webp',quality=q,method=6); return list(im.size)
if os.path.exists('raw/toys_1.png'):
    t=grid_cells('raw/toys_1.png',4,2)
    # slopes: a right triangle that fills the whole tile; stretch the cut to exactly TILE_PX x TILE_PX
    for k,n in ((0,'tile_slope_r'),(1,'tile_slope_l')):
        im=Image.fromarray(t[k],'RGBA').resize((TILE_PX,TILE_PX),Image.LANCZOS); sizes[n]=save_rgba(im,n)
    # springs: one common scale (the relaxed cap fills the tile width), both bottom-aligned on the same TILE_PX canvas so the base never moves
    sc=min(TILE_PX/max(t[k].shape[1],t[k].shape[0]) for k in (2,3))
    for k,n in ((2,'spring_0'),(3,'spring_1')): sizes[n]=save_rgba(canvas_bottom(t[k],sc,TILE_PX,TILE_PX),n)
    # flowers: one common scale, bottom-aligned on TILE_PX canvas
    sc=min(TILE_PX/max(t[k].shape[1],t[k].shape[0]) for k in (4,5,6))
    for k,n in ((4,'flower_0'),(5,'flower_1'),(6,'flower_2')): sizes[n]=save_rgba(canvas_bottom(t[k],sc,TILE_PX,TILE_PX),n)
    sizes['bunny_nest']=put(t[7],'bunny_nest',w=TILE_PX)
if os.path.exists('raw/notes.png'):
    t=grid_cells('raw/notes.png',5,2)
    for k in range(5):
        for lit,r in ((0,''),(1,'_lit')):
            im=Image.fromarray(t[lit*5+k],'RGBA').resize((TILE_PX,TILE_PX),Image.LANCZOS); sizes[f'note_{k+1}{r}']=save_rgba(im,f'note_{k+1}{r}')
if os.path.exists('raw/bunny.png'):
    t=grid_cells('raw/bunny.png',3,2,minarea=400,dil=5)
    names=('bunny_idle','bunny_hop1','bunny_hop2','bunny_hop3','bunny_hop4','bunny_home')
    sc=76/t[0].shape[0]   # the sitting bunny is 76 px tall; every frame uses the same scale and the same bottom-centre canvas
    cw=max(round(t[i].shape[1]*sc) for i in range(6))+2; chh=max(round(t[i].shape[0]*sc) for i in range(6))+2
    for i,n in enumerate(names): sizes[n]=save_rgba(canvas_bottom(t[i],sc,cw,chh),n)
if os.path.exists('raw/floe.png'):
    r=cutout('raw/floe.png'); fl=sorted(comps(r,minarea=20000,dil=3),key=lambda c:c['y']); assert len(fl)>=1,'no floe found'
    # floe tile pitch is TILE_PX: floe_l / floe_m / floe_r are each TILE_PX wide and share one height; floe_m tiles seamlessly; floe = single-tile floe (width 1)
    lg=Image.fromarray(fl[0]['img'],'RGBA'); H=TILE_PX; lg=lg.resize((round(lg.width*H/lg.height),H),Image.LANCZOS)
    A=np.asarray(lg).astype(float); A[...,:3]*=A[...,3:]/255   # premultiply for blending
    ov=28; c0=lg.width//2-TILE_PX//2; S=A[:,c0:c0+TILE_PX+ov]; M=S[:,:TILE_PX].copy()
    for x in range(ov):
        a=x/ov; M[:,x]=a*S[:,x]+(1-a)*S[:,TILE_PX+x]   # crossfade the tail over the head so the strip tiles seamlessly
    def unpre(P): al=np.clip(P[...,3:],1e-3,255); return Image.fromarray(np.dstack([np.clip(P[...,:3]/al*255,0,255),P[...,3]]).astype(np.uint8),'RGBA')
    sizes['floe_m']=save_rgba(unpre(M),'floe_m')
    # end caps: the painted rounded end for the first/last `cap` px, then a crossfade into floe_m so cap and middle join without a visible seam
    cap,fade=36,30; xs=np.arange(TILE_PX)
    wl=np.clip((xs-cap)/fade,0,1)[None,:,None]; wr=np.clip(((TILE_PX-1-xs)-cap)/fade,0,1)[None,:,None]
    Lp=(1-wl)*A[:,:TILE_PX]+wl*M; Rp=(1-wr)*A[:,-TILE_PX:]+wr*M
    sizes['floe_l']=save_rgba(unpre(Lp),'floe_l'); sizes['floe_r']=save_rgba(unpre(Rp),'floe_r')
    # `floe` = a one-tile floe (a run of a single M): left half of floe_l + right half of floe_r (the short floe in the raw sheet is spare)
    h=TILE_PX//2; sizes['floe']=save_rgba(unpre(np.concatenate([Lp[:,:h],Rp[:,h:]],axis=1)),'floe')
# stickers: 12 cells (4 x 3); normal sheet has hall..garden + words5, the gold sheet has the same ten rooms
ROOMS10=('hall','lake','slope','tower','spring','bunny','floe','music','ballroom','garden')
for sh,suffix,names in (('stickers_1','',ROOMS10+('words5',)),('stickers_2','_gold',ROOMS10)):
    if not os.path.exists(f'raw/{sh}.png'): continue
    t=grid_cells(f'raw/{sh}.png',4,3,minarea=2000,dil=3)
    for i,n in enumerate(names):
        if i not in t: print('MISSING sticker',sh,i,n); continue
        nm='sticker_'+n+(suffix if n!='words5' else ''); sizes[nm]=put(t[i],nm,maxdim=192,q=82)
if os.path.exists('raw/sticker_board.png'):
    Image.open('raw/sticker_board.png').convert('RGB').resize((1280,720),Image.LANCZOS).save(f'{OUT}/sticker_board.webp',quality=78,method=6); sizes['sticker_board']=[1280,720]
# new room backgrounds: same crop as bg0-bg3 (stage aspect, cut from the top is dropped), q75
for n in ('slope','spring','bunny','floe','music','garden'):
    p=f'raw/bg_{n}.png'
    if not os.path.exists(p): continue
    im=Image.open(p).convert('RGB'); im=im.resize((1672,round(im.height*1672/im.width)),Image.LANCZOS); h=round(1672*520/960)
    im=im.crop((0,im.height-h,1672,im.height)); im.save(f'{OUT}/bg_{n}.webp',quality=75,method=6); sizes[f'bg_{n}']=list(im.size)
for k in range(5,11):
    p=f'raw/mem_m{k}.png'
    if os.path.exists(p): Image.open(p).convert('RGB').resize((1280,720),Image.LANCZOS).save(f'{OUT}/mem_m{k}.webp',quality=80,method=6)


import json; json.dump(sizes,open('sizes.json','w'),indent=0); print(sizes)
