"""Tileable ice-masonry maps covering 4x2 tiles (bricks 1 tile wide, half a tile high)."""
import bpy, sys, os
import numpy as np
OUT = sys.argv[sys.argv.index('--') + 1]
W, H = 1024, 512
rng = np.random.default_rng(5)

def fbm(beta, w=W, h=H):
    f = np.fft.fft2(rng.normal(size=(h, w)))
    fy = np.fft.fftfreq(h)[:, None] * h / 2; fx = np.fft.fftfreq(w)[None, :] * w / 4
    r = np.sqrt(fx ** 2 + fy ** 2); r[0, 0] = 1
    n = np.fft.ifft2(f / r ** beta).real
    return (n - n.min()) / (n.max() - n.min())

rows = 4; bw = W // 4; rh = H // rows
yy, xx = np.mgrid[0:H, 0:W]
row = yy // rh
off = (row % 2) * (bw // 2)
xs = (xx + off) % W
col = xs // bw
dx = np.minimum(xs % bw, bw - xs % bw); dy = np.minimum(yy % rh, rh - yy % rh)
edge = np.minimum(dx, dy).astype(float) + (fbm(1.4) - .5) * 9
mortar = np.clip(edge / 7, 0, 1)                # 0 in the joint, 1 on the brick face
pillow = np.clip(edge / 26, 0, 1) ** .6
seed = rng.random((rows, 8))
tone = seed[row, col]
n1, n2, n3 = fbm(1.5), fbm(1.05), fbm(.8)
cracks = np.clip(1 - np.abs(fbm(1.3) - .5) * 60, 0, 1) * (seed[row, (col + 3) % 8] > .55)
height = pillow * .62 + n1 * .24 + n2 * .1 + n3 * .04 - cracks * .1
gy, gx = np.gradient(np.pad(height, 2, mode='wrap'))
gx, gy = gx[2:-2, 2:-2], gy[2:-2, 2:-2]
s = 13.
nx, ny, nz = -gx * s, gy * s, np.ones_like(gx)
ln = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2)
normal = np.stack([nx / ln * .5 + .5, ny / ln * .5 + .5, nz / ln * .5 + .5], -1)

deep = np.array([.13, .22, .36]); pale = np.array([.46, .6, .76]); frost = np.array([.86, .94, 1.])
t = (tone * .5 + n1 * .5)[..., None]
alb = deep * (1 - t) + pale * t
alb = alb * (1 - (1 - mortar[..., None]) * .85) + frost * (1 - mortar[..., None]) * .85
crk = cracks[..., None] * .55
alb = alb * (1 - crk) + frost * crk
rough = np.clip(.16 + (1 - mortar) * .6 + n2 * .22 + cracks * .3, 0, 1)

def save(name, rgb):
    img = bpy.data.images.new(name, W, H, alpha=False)
    px = np.concatenate([rgb[::-1], np.ones((H, W, 1))], -1).astype(np.float32)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(px.ravel())
    s = bpy.context.scene.render.image_settings
    s.file_format = 'JPEG'; s.quality = 86
    img.filepath_raw = os.path.join(OUT, name + '.jpg'); img.file_format = 'JPEG'
    img.save_render(os.path.join(OUT, name + '.jpg'))

save('brick_albedo', alb ** (1 / 2.2))
save('brick_normal', normal)
save('brick_rough', np.repeat(rough[..., None], 3, -1))
print('tex ok')
