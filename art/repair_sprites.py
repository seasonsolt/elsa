"""Deterministic high-precision sprite cleanup and pose repair for art/character_atlas.py.

Fixes:
1. Green-screen unpremultiplication + interior chroma propagation (eliminates #00FF00 fringes on fingers, hair, hems, sparkles).
2. frost_blink & nuan_blink: true closed-eye blink frames aligned 1:1 with idle (zero width/anchor twitch).
3. frost_cast: grounded full-length standing gown instead of airborne tucked jump legs.
4. nuan_idle: calm standing boots under the skirt instead of wide mid-walk scissors stride.
5. nuan_run6: natural running upper body & arms matching run1..5 instead of overhead cheer flail.
6. nuan_fall: dark olive-green right sleeve instead of pale cyan-blue bleed.
7. nuan_jump: Anna's dark olive-green sleeves, royal-blue skirt, and tall brown boots instead of Elsa's ice-blue dress & bare legs.
"""
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi


def rgb2hsv(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    nz = d > 1e-6
    rc = nz & (mx == r)
    gc = nz & (mx == g) & ~rc
    bc = nz & ~rc & ~gc
    h[rc] = ((g - b)[rc] / d[rc]) % 6
    h[gc] = (b - r)[gc] / d[gc] + 2
    h[bc] = (r - g)[bc] / d[bc] + 4
    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0)
    return h * 60.0, s, mx


def hsv2rgb(h, s, v):
    h = (h % 360.0) / 60.0
    c = v * s
    x = c * (1.0 - np.abs(h % 2.0 - 1.0))
    z = np.zeros_like(h)
    i = np.floor(h).astype(int) % 6
    r = np.choose(i, [c, x, z, z, x, c])
    g = np.choose(i, [x, c, c, x, z, z])
    b = np.choose(i, [z, z, x, c, c, x])
    m = v - c
    return np.stack([r + m, g + m, b + m], -1)


def remove_green_clean(image):
    """Unpremultiply against sampled neon-green backdrop and decontaminate edge green spill."""
    rgb = np.asarray(image.convert('RGB'), dtype=np.float32)
    corners = np.concatenate([
        rgb[:10, :10].reshape(-1, 3),
        rgb[:10, -10:].reshape(-1, 3),
        rgb[-10:, :10].reshape(-1, 3),
        rgb[-10:, -10:].reshape(-1, 3),
    ], axis=0)
    key = np.median(corners, axis=0)  # ~ [13, 239, 14]
    max_rb = np.maximum(rgb[..., 0], rgb[..., 2])
    excess = rgb[..., 1] - max_rb

    # Anna's dark olive sleeves have low R/B (< 75) and modest green (< 95), whereas the backdrop has G ~ 239.
    dark_cloth = (max_rb < 75) & (rgb[..., 1] < 96)
    allow = np.where(dark_cloth, 26.0, 3.0)
    key_ex = max(float(key[1] - max(key[0], key[2])), 180.0)

    # Smooth alpha ramp from background (excess >= 98) to solid foreground (excess <= allow)
    alpha = np.clip((98.0 - excess) / (98.0 - allow), 0.0, 1.0)
    alpha = np.where(excess > 105.0, 0.0, alpha)
    alpha = np.where(alpha < 0.06, 0.0, alpha)

    # Unpremultiply semi-transparent edge pixels against the sampled key colour
    a_safe = np.maximum(alpha[..., None], 0.22)
    unpremult = (rgb - (1.0 - alpha[..., None]) * key) / a_safe
    fg = np.where((alpha[..., None] > 0.0) & (alpha[..., None] < 0.98), unpremult, rgb)
    fg = np.clip(fg, 0.0, 255.0)

    # Suppress residual JPEG chroma bleed (1-2 px inside solid alpha where G still exceeds max(R,B))
    fg_max_rb = np.maximum(fg[..., 0], fg[..., 2])
    fg_dark = (fg_max_rb < 75) & (fg[..., 1] < 96) & (alpha > 0.92)
    cap_g = np.where(fg_dark, fg_max_rb + 24.0, fg_max_rb + 2.0)
    spilled = (fg[..., 1] > cap_g) & (alpha > 0.0)
    # Preserve perceived brightness slightly when desaturating bright green spill on skin/blonde hair
    over = np.maximum(0.0, fg[..., 1] - cap_g)
    fg[..., 1] = np.where(spilled, cap_g, fg[..., 1])
    fg[..., 0] = np.where(spilled & ~fg_dark, np.minimum(255.0, fg[..., 0] + over * 0.22), fg[..., 0])
    fg[..., 2] = np.where(spilled & ~fg_dark, np.minimum(255.0, fg[..., 2] + over * 0.22), fg[..., 2])

    # Propagate clean interior RGB into very thin outer fringe (alpha < 0.72) so anti-aliased edges have zero grey/green cast
    clean_core = (alpha > 0.92) & (excess <= allow + 8.0)
    if np.any(clean_core):
        dist, nearest = ndi.distance_transform_edt(~clean_core, return_indices=True)
        nearest_fg = fg[tuple(nearest)]
        fringe = (alpha > 0.0) & (alpha < 0.78) & (dist <= 6.0)
        w = np.clip((0.78 - alpha) / 0.72, 0.0, 1.0)[..., None]
        fg = np.where(fringe[..., None], fg * (1.0 - w) + nearest_fg * w, fg)

    out = np.dstack([np.clip(fg + 0.5, 0, 255).astype(np.uint8), np.clip(alpha * 255.0 + 0.5, 0, 255).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def trim_alpha(im, thresh=32):
    bbox = im.getchannel('A').point(lambda a: 255 if a > thresh else 0).getbbox()
    return im.crop(bbox) if bbox else im


def make_blink(idle_im, eye_box):
    """Paint a gentle closed eyelid + curved dark lash over the open eye of an idle sprite."""
    arr = np.asarray(idle_im.convert('RGBA')).copy()
    x0, y0, x1, y1 = eye_box
    # Sample warm cheek skin right below the eye (avoids sampling dark eyebrows above the eye!)
    cheek = arr[min(arr.shape[0] - 1, y1 + 2):min(arr.shape[0], y1 + 7), max(0, x0 - 3):min(arr.shape[1], x1 + 1), :3].astype(np.float32)
    cheek_a = arr[min(arr.shape[0] - 1, y1 + 2):min(arr.shape[0], y1 + 7), max(0, x0 - 3):min(arr.shape[1], x1 + 1), 3] > 200
    bright = (cheek[..., 0] > 175) & cheek_a
    skin_bot = np.median(cheek[bright], axis=0) if np.any(bright) else np.array([238.0, 188.0, 162.0], dtype=np.float32)
    skin_top = np.clip(skin_bot * np.array([0.96, 0.92, 0.90]), 0, 255)

    for y in range(y0, y1 + 1):
        t = (y - y0) / max(1, y1 - y0)
        base = skin_top * (1.0 - t * 0.65) + skin_bot * (t * 0.65)
        for x in range(x0, x1 + 1):
            if arr[y, x, 3] > 120:
                arr[y, x, :3] = np.clip(base, 0, 255).astype(np.uint8)

    # Draw delicate curved dark-brown closed eyelash line at 4x supersampling for silky anti-aliasing
    S = 4
    patch_w, patch_h = (x1 - x0 + 4), (y1 - y0 + 4)
    overlay = Image.new('RGBA', (patch_w * S, patch_h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    lash_y = (y1 - y0 + 1.1) * S
    pts = []
    for k in range(13):
        u = k / 12.0
        px = (1.2 + u * (x1 - x0 + 0.6)) * S
        py = lash_y + np.sin(u * np.pi) * (1.05 * S) - (0.35 * S if u > 0.85 else 0.0)
        pts.append((px, py))
    d.line(pts, fill=(58, 34, 30, 235), width=max(3, round(1.15 * S)))
    # Soft warm crease hint 1.6 px above lash
    crease = [(px, py - 1.7 * S) for (px, py) in pts[2:-1]]
    d.line(crease, fill=(178, 118, 96, 110), width=max(2, round(0.7 * S)))
    overlay = overlay.resize((patch_w, patch_h), Image.Resampling.LANCZOS)

    out = Image.fromarray(arr, 'RGBA')
    out.alpha_composite(overlay, (max(0, x0 - 2), max(0, y0 - 2)))
    return out


def repair_nuan_fall(im):
    """Recolor Anna's pale cyan-blue raised right sleeve in nuan_fall to match her dark olive-green left sleeve."""
    arr = np.asarray(im.convert('RGBA')).copy()
    rgb = arr[..., :3].astype(np.float32) / 255.0
    h, s, v = rgb2hsv(rgb)
    H, W = arr.shape[:2]
    yy = np.arange(H)[:, None]
    # Upper-body cyan-blue sleeve pixels (y < 78, hue 168..248), excluding her royal-blue skirt below y=85
    mask_bool = (yy < 78) & (arr[..., 3] > 20) & (h >= 165.0) & (h <= 250.0) & (s > 0.08) & (v > 0.25)
    mask = ndi.gaussian_filter(mask_bool.astype(np.float32), 0.7)
    mask = np.where(yy < 80, mask, 0.0)
    # Match Anna's dark olive-forest sleeve (hue ~ 98 deg, moderate sat, darker value preserving folds)
    new_rgb = hsv2rgb(np.full_like(h, 98.0), np.clip(s * 0.95 + 0.14, 0.22, 0.52), np.clip(v * 0.42, 0.12, 0.42))
    blended = rgb * (1.0 - mask[..., None]) + new_rgb * mask[..., None]
    arr[..., :3] = np.clip(blended * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def repair_nuan_jump(jump_im):
    """Fix Elsa-blue colour bleed on nuan_jump: olive-green sleeves, royal-blue folk skirt, and tall brown boots."""
    arr = np.asarray(jump_im.convert('RGBA')).copy()
    rgb = arr[..., :3].astype(np.float32) / 255.0
    h, s, v = rgb2hsv(rgb)
    H, W = arr.shape[:2]
    yy, xx = np.meshgrid(np.arange(H), np.arange(W), indexing='ij')
    vis = arr[..., 3] > 20
    blue_cloth = vis & (h >= 168.0) & (h <= 252.0) & (s > 0.08)

    # 1. Upper sleeves (y < 86): pale blue -> Anna's dark olive-forest green
    sleeve_m = ndi.gaussian_filter((blue_cloth & (yy < 86)).astype(np.float32), 0.75) * (yy < 88)
    sleeve_rgb = hsv2rgb(np.full_like(h, 98.0), np.clip(s * 0.95 + 0.15, 0.22, 0.52), np.clip(v * 0.41, 0.12, 0.40))
    rgb = rgb * (1.0 - sleeve_m[..., None]) + sleeve_rgb * sleeve_m[..., None]

    # 2. Skirt (84 <= y < 156): pale ice-blue -> Anna's deep royal-cobalt skirt (exclude only the two tiny silver shoes below y=156 and at x=71..83, y>=149)
    front_shoe = (yy >= 149) & (xx >= 70) & (xx <= 84)
    back_shoe = (yy >= 166)
    skirt_raw = blue_cloth & (yy >= 84) & ~front_shoe & ~back_shoe
    # Keep only the main contiguous skirt component so detached shoe highlights are never included
    slab, sn = ndi.label(skirt_raw)
    if sn > 1:
        areas = np.bincount(slab.ravel()); areas[0] = 0
        skirt_raw = slab == areas.argmax()
    skirt_m = ndi.gaussian_filter(skirt_raw.astype(np.float32), 0.75)
    skirt_rgb = hsv2rgb(218.0 + (h - 205.0) * 0.25, np.clip(s * 2.15 + 0.22, 0.52, 0.86), np.clip(v * 0.68, 0.18, 0.72))
    rgb = rgb * (1.0 - skirt_m[..., None]) + skirt_rgb * skirt_m[..., None]

    # 3. Bare lower legs & silver slippers below the skirt -> Anna's warm brown leather boots + dark stockings
    # Locate the skirt's bottom edge per column so everything sticking out below the skirt becomes stockings/boots
    leg_zone = vis & (yy >= 118) & (skirt_m < 0.35) & ~((h >= 315.0) | ((h <= 12.0) & (s > 0.38) & (xx < 54)))
    # Exclude magenta cape on the far left (x < 54, reddish-magenta hue)
    cape = vis & (xx < 56) & ((h > 300.0) | (h < 18.0)) & (s > 0.25)
    leg_zone = leg_zone & ~ndi.binary_dilation(cape, iterations=2)
    leg_m = ndi.gaussian_filter(leg_zone.astype(np.float32), 0.65)
    # Upper thigh/knee just under hem (y < 136): dark navy-charcoal tights; calf & foot (y >= 136): warm saddle-brown leather boot
    tights_w = np.clip((139.0 - yy) / 8.0, 0.0, 1.0)
    boot_rgb = hsv2rgb(np.full_like(h, 28.0), np.full_like(s, 0.58), np.clip(v * 0.44 + 0.04, 0.14, 0.44))
    tights_rgb = hsv2rgb(np.full_like(h, 220.0), np.full_like(s, 0.32), np.clip(v * 0.28, 0.10, 0.28))
    lower_rgb = tights_rgb * tights_w[..., None] + boot_rgb * (1.0 - tights_w[..., None])
    rgb = rgb * (1.0 - leg_m[..., None]) + lower_rgb * leg_m[..., None]

    arr[..., :3] = np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')


def repair_nuan_run6(run6_im, run5_im):
    """Replace nuan_run6's overhead cheering arms with nuan_run5's natural running upper body, keeping run6's wide stride legs."""
    # Bodice V-waist in run6 is (x=95, y=100); in run5 it is (x=102, y=94).
    # Shift run5 by (+0, 0) on a shared canvas aligned on the waist: run6 placed at y_off=0, run5 placed so (102,94)->(95,100) => (-7, +6).
    W, H = 176, 196
    c6 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c5 = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c6.paste(run6_im, (8, 0))          # run6 waist now at (103, 100)
    c5.paste(run5_im, (1, 6))          # run5 waist (102+1=103, 94+6=100) -> exact 1:1 waist alignment!

    a6 = np.asarray(c6, dtype=np.float32)
    a5 = np.asarray(c5, dtype=np.float32)
    yy, xx = np.meshgrid(np.arange(H), np.arange(W), indexing='ij')

    # Blend weight w5 = 1 above waist (use run5 head, braid, running arms & upper cape), 0 below waist (use run6 wide stride skirt & boots).
    # Keep run5's forward right hand (x > 118, y < 104) and left hand (x in 52..78, y in 82..110) cleanly visible.
    seam_y = np.where(xx < 65, 112.0, 99.0)  # let run5's billowing cape flow slightly lower on the left
    w5 = np.clip((seam_y + 4.0 - yy) / 8.0, 0.0, 1.0)
    hand_l = (xx >= 52) & (xx <= 80) & (yy >= 80) & (yy <= 112) & (a5[..., 3] > 80)
    w5 = np.maximum(w5, ndi.gaussian_filter(hand_l.astype(np.float32), 1.0))

    # Premultiplied alpha blend across the 8px waist seam so there is zero halo
    p5 = a5[..., :3] * (a5[..., 3:4] / 255.0)
    p6 = a6[..., :3] * (a6[..., 3:4] / 255.0)
    pa = a5[..., 3:4] * w5[..., None] + a6[..., 3:4] * (1.0 - w5[..., None])
    prgb = p5 * w5[..., None] + p6 * (1.0 - w5[..., None])
    rgb = np.where(pa > 1.0, prgb / np.maximum(pa / 255.0, 1e-3), 0.0)
    out = np.dstack([np.clip(rgb + 0.5, 0, 255).astype(np.uint8), np.clip(pa[..., 0] + 0.5, 0, 255).astype(np.uint8)])
    return trim_alpha(Image.fromarray(out, 'RGBA'))


def repair_nuan_idle(idle_im):
    """Bring Anna's wide mid-walk scissors boots in nuan_idle together into a calm standing stance under her skirt."""
    arr = np.asarray(idle_im.convert('RGBA')).copy()
    H, W = arr.shape[:2]
    # Extract the cleanly painted upright front boot (x=72..106, y=158..194) before clearing below the skirt hem
    boot_crop = arr[158:H, 72:min(W, 106)].copy()
    # Darken a copy slightly for the tucked rear boot standing just behind the front boot
    back_boot = boot_crop.copy()
    back_boot[..., :3] = (back_boot[..., :3].astype(np.float32) * 0.78).astype(np.uint8)

    # Clear the wide-split legs below the horizontal blue skirt hem (y >= 161, x >= 26; x < 26 is the magenta cape tip around y=140..158)
    for y in range(159, H):
        fade = np.clip((y - 159) / 3.0, 0.0, 1.0)
        arr[y, 24:, 3] = (arr[y, 24:, 3].astype(np.float32) * (1.0 - fade)).astype(np.uint8)

    # Composite back boot then front boot right under Anna's standing centre of gravity (x ~ 66), behind the skirt hem!
    under = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    under.alpha_composite(Image.fromarray(back_boot, 'RGBA'), (50, 157))
    under.alpha_composite(Image.fromarray(boot_crop, 'RGBA'), (60, 158))
    under.alpha_composite(Image.fromarray(arr, 'RGBA'), (0, 0))
    return trim_alpha(under)


def repair_frost_cast(cast_im, idle_im):
    """Give frost_cast Elsa's grounded full-length standing gown instead of airborne tucked jump legs."""
    # First paint over frost_idle's side-hanging hand (warm peach skin around y=80..115) with adjacent icy gown folds
    idle_arr = np.asarray(idle_im.convert('RGBA')).copy()
    ih, iw = idle_arr.shape[:2]
    irgb = idle_arr[..., :3].astype(np.float32) / 255.0
    h_i, _, _ = rgb2hsv(irgb)
    iy, ix = np.meshgrid(np.arange(ih), np.arange(iw), indexing='ij')
    hand_px = (iy >= 76) & (iy <= 128) & (ix >= 58) & (ix <= 96) & (idle_arr[..., 3] > 80) & ((h_i < 165.0) | (h_i > 275.0))
    hand_dil = ndi.binary_dilation(hand_px, iterations=2) & (idle_arr[..., 3] > 80)
    blue_gown = (idle_arr[..., 3] > 180) & ~hand_dil & (iy >= 74) & (iy <= 134) & (ix >= 58)
    if np.any(blue_gown) and np.any(hand_dil):
        _, near = ndi.distance_transform_edt(~blue_gown, return_indices=True)
        filled = idle_arr[..., :3][tuple(near)].astype(np.float32)
        w = ndi.gaussian_filter(hand_dil.astype(np.float32), 1.2)[..., None]
        idle_arr[..., :3] = np.clip(idle_arr[..., :3] * (1.0 - w) + filled * w + 0.5, 0, 255).astype(np.uint8)
    clean_idle = Image.fromarray(idle_arr, 'RGBA')

    W, H = 206, 198
    c_cast = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c_idle = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    c_cast.paste(cast_im, (4, 0))       # cast waist at (92, 84)
    c_idle.paste(clean_idle, (8, 4))    # idle waist at (92, 84), standing floor at y=195

    ac = np.asarray(c_cast, dtype=np.float32)
    ai = np.asarray(c_idle, dtype=np.float32)
    yy, xx = np.meshgrid(np.arange(H), np.arange(W), indexing='ij')

    # Keep frost_idle's standing gown below waist (x >= 60, y >= 84), fading in smoothly across y=84..94
    ai_mask = np.clip((xx - 58.0) / 8.0, 0.0, 1.0) * np.clip((yy - 82.0) / 10.0, 0.0, 1.0)
    ai_clean = ai.copy()
    ai_clean[..., 3] *= ai_mask

    # Remove ALL of frost_cast's tucked jumping skirt, legs & trailing heel below y=88 (while keeping billowing sheer cape on upper-left)
    drop_jump_legs = (yy >= 88) & (xx >= 36) & (xx <= 135)
    keep_cast = 1.0 - ndi.gaussian_filter(drop_jump_legs.astype(np.float32), 2.5)
    cape_keep = (xx < 68) & (yy < 138.0 - np.maximum(0.0, xx - 42.0) * 1.65) & (ac[..., 3] > 30)
    keep_cast = np.maximum(keep_cast, ndi.gaussian_filter(cape_keep.astype(np.float32), 1.2))
    ac_clean = ac.copy()
    ac_clean[..., 3] *= keep_cast

    base = Image.fromarray(np.clip(ai_clean + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    top = Image.fromarray(np.clip(ac_clean + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    base.alpha_composite(top)
    return trim_alpha(base)


def apply_all_repairs(frames):
    """Apply all character pose & blink repairs in-place on extracted atlas frames."""
    frames['frost']['cast'] = repair_frost_cast(frames['frost']['cast'], frames['frost']['idle'])
    frames['nuan']['fall'] = repair_nuan_fall(frames['nuan']['fall'])
    frames['nuan']['jump'] = repair_nuan_jump(frames['nuan']['jump'])
    frames['nuan']['run6'] = repair_nuan_run6(frames['nuan']['run6'], frames['nuan']['run5'])
    frames['nuan']['idle'] = repair_nuan_idle(frames['nuan']['idle'])
    # Blink frames derived 1:1 from repaired idle frames so eyes close cleanly with zero body shift
    frames['frost']['blink'] = make_blink(frames['frost']['idle'], (91, 20, 98, 24))
    frames['nuan']['blink'] = make_blink(frames['nuan']['idle'], (73, 18, 81, 21))
    return frames
