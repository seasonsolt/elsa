"""Render the camera-matched hall plate and its environment panorama with Cycles.
Run: blender -b -P build_hall.py -- <assets dir> <scale 0-1> <samples>
World: x right, z up, y into the screen; the play plane sits at y=0 and tile (c,r) spans x=c..c+1, z=12-r..13-r."""
import bpy, bmesh, math, sys, os
from mathutils import Vector

a = sys.argv[sys.argv.index('--') + 1:]
OUT, SCALE, SAMPLES = a[0], float(a[1]), int(a[2])
MAP = ['########################','#................#.....#','#................#.....#','#................#.....#','#.........h......#.....#','#................#.....#','#.......====.....#.....#','#................#.....#','#.........*......#.....#','#......#####.....X.....#','#......#####.....X.....#','#EA.h..#####.*...X..D..#','########################']
BACK = 10.

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = scene.collection

def nodes(m):
    m.use_nodes = True
    t = m.node_tree
    t.nodes.clear()
    out = t.nodes.new('ShaderNodeOutputMaterial')
    bs = t.nodes.new('ShaderNodeBsdfPrincipled')
    t.links.new(bs.outputs[0], out.inputs[0])
    return t, bs

def stone_mat(name, scale=1., tint=(.2, .42, .78), gloss=.3):
    m = bpy.data.materials.new(name)
    t, bs = nodes(m)
    tc = t.nodes.new('ShaderNodeTexCoord')
    sep = t.nodes.new('ShaderNodeSeparateXYZ'); t.links.new(tc.outputs['Object'], sep.inputs[0])
    add = t.nodes.new('ShaderNodeMath'); add.operation = 'ADD'
    t.links.new(sep.outputs[0], add.inputs[0]); t.links.new(sep.outputs[1], add.inputs[1])
    comb = t.nodes.new('ShaderNodeCombineXYZ'); t.links.new(add.outputs[0], comb.inputs[0]); t.links.new(sep.outputs[2], comb.inputs[1])
    br = t.nodes.new('ShaderNodeTexBrick')
    br.inputs['Scale'].default_value = scale
    br.inputs['Mortar Size'].default_value = .018
    br.inputs['Mortar Smooth'].default_value = .4
    br.inputs['Brick Width'].default_value = 1.6
    br.inputs['Row Height'].default_value = .8
    br.inputs['Color1'].default_value = (*tint, 1)
    br.inputs['Color2'].default_value = (tint[0] * .76, tint[1] * .8, tint[2] * .88, 1)
    br.inputs['Mortar'].default_value = (.8, .9, 1, 1)
    t.links.new(comb.outputs[0], br.inputs['Vector'])
    no = t.nodes.new('ShaderNodeTexNoise')
    no.inputs['Scale'].default_value = 3.; no.inputs['Detail'].default_value = 8.
    t.links.new(tc.outputs['Object'], no.inputs['Vector'])
    mix = t.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = .4
    t.links.new(br.outputs['Color'], mix.inputs['A']); t.links.new(no.outputs['Fac'], mix.inputs['B'])
    t.links.new(mix.outputs['Result'], bs.inputs['Base Color'])
    bs.inputs['Roughness'].default_value = gloss
    bs.inputs['Coat Weight'].default_value = .5
    bs.inputs['Coat Roughness'].default_value = .12
    mh = t.nodes.new('ShaderNodeMath'); mh.operation = 'SUBTRACT'
    mh.inputs[0].default_value = 1.
    t.links.new(br.outputs['Fac'], mh.inputs[1])
    mh2 = t.nodes.new('ShaderNodeMath'); mh2.operation = 'ADD'
    t.links.new(mh.outputs[0], mh2.inputs[0]); t.links.new(no.outputs['Fac'], mh2.inputs[1])
    bump = t.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .45; bump.inputs['Distance'].default_value = .08
    t.links.new(mh2.outputs[0], bump.inputs['Height'])
    t.links.new(bump.outputs[0], bs.inputs['Normal'])
    return m

def simple(name, color, rough=.4, metal=0., emit=None, trans=0., ior=1.31):
    m = bpy.data.materials.new(name)
    t, bs = nodes(m)
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = rough
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Transmission Weight'].default_value = trans
    bs.inputs['IOR'].default_value = ior
    if emit:
        bs.inputs['Emission Color'].default_value = (*emit[0], 1)
        bs.inputs['Emission Strength'].default_value = emit[1]
    return m

def box(name, x0, x1, y0, y1, z0, z1, mat):
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x in (x0, x1) for y in (y0, y1) for z in (z0, z1)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    return ob

def poly_prism(name, pts, y0, y1, mat):
    """Extrude a closed (x,z) polygon along y."""
    bm = bmesh.new()
    a = [bm.verts.new((p[0], y0, p[1])) for p in pts]
    b = [bm.verts.new((p[0], y1, p[1])) for p in pts]
    bm.faces.new(a); bm.faces.new(list(reversed(b)))
    n = len(pts)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    return ob

def arch_pts(cx, w, z0, peak, n=14):
    """Equilateral pointed arch: two arcs of radius w struck from the opposite springing points."""
    spring = peak - w * math.sin(math.pi / 3)
    left = [(cx + w / 2 - w * math.cos(i / n * math.pi / 3), spring + w * math.sin(i / n * math.pi / 3)) for i in range(n + 1)]
    right = [(2 * cx - x, z) for x, z in reversed(left[:-1])]
    return [(cx - w / 2, z0)] + left + right + [(cx + w / 2, z0)]

stone = stone_mat('wall', 1.)
floor_m = stone_mat('floor', .5, (.3, .55, .86), .12)
rib = stone_mat('rib', 2., (.34, .58, .9), .24)
ice_col = simple('crystal', (.72, .9, 1.), .05, trans=1.)
gold = simple('gold', (.9, .66, .3), .28, metal=1.)
ember = simple('ember', (1, .4, .1), .5, emit=((1, .3, .06), 3.))
candle = simple('candle', (1, .8, .5), .4, emit=((1, .68, .3), 18.))
snow = simple('snow', (.93, .96, 1.), .7)

# Room shell (camera-visible)
box('floor', -3, 27, .5, BACK + 2, -1, 1, floor_m)
box('ceiling', -3, 27, -30, BACK + 2, 12, 15, stone)
box('sideL', -3, 1, .5, BACK + 2, 0, 13, stone)
box('sideR', 23, 27, .5, BACK + 2, 0, 13, stone)

# Back wall with three window openings
wins = [(5, 4.2), (12, 5.), (19, 4.2)]
wall_pts = [(-3, 0), (27, 0), (27, 14), (-3, 14)]
wall = box('backWall', -3, 27, BACK, BACK + 1.2, 0, 14, stone)
for i, (cx, w) in enumerate(wins):
    cut = poly_prism('cut', arch_pts(cx, w, 2.8 if i != 1 else 4.4, 11.6), BACK - 1, BACK + 2, stone)
    m = wall.modifiers.new('c', 'BOOLEAN'); m.object = cut; m.operation = 'DIFFERENCE'; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = wall
    bpy.ops.object.modifier_apply(modifier='c')
    bpy.data.objects.remove(cut)
    # mullions
    z0 = 2.8 if i != 1 else 4.4
    box('mul', cx - .05, cx + .05, BACK + .5, BACK + .7, z0, 11.6, rib)
    for k in range(1, 5):
        box('mul', cx - w / 2, cx + w / 2, BACK + .55, BACK + .65, z0 + k * 1.5, z0 + k * 1.5 + .08, rib)

# Night sky card outside the windows
sky = bpy.data.objects.new('sky', bpy.data.meshes.new('sky'))
bm = bmesh.new()
bm.faces.new([bm.verts.new(v) for v in ((-20, 26, -6), (44, 26, -6), (44, 26, 28), (-20, 26, 28))])
bm.to_mesh(sky.data); bm.free(); col.objects.link(sky)
sm = bpy.data.materials.new('skyCard')
t = sm.node_tree if sm.use_nodes else None
sm.use_nodes = True; t = sm.node_tree; t.nodes.clear()
o = t.nodes.new('ShaderNodeOutputMaterial'); em = t.nodes.new('ShaderNodeEmission')
t.links.new(em.outputs[0], o.inputs[0])
tc = t.nodes.new('ShaderNodeTexCoord'); sp = t.nodes.new('ShaderNodeSeparateXYZ'); t.links.new(tc.outputs['Object'], sp.inputs[0])
dv = t.nodes.new('ShaderNodeMath'); dv.operation = 'DIVIDE'; dv.inputs[1].default_value = 22.; t.links.new(sp.outputs['Z'], dv.inputs[0])
ramp = t.nodes.new('ShaderNodeValToRGB'); t.links.new(dv.outputs[0], ramp.inputs[0])
ramp.color_ramp.elements[0].color = (.3, .55, .85, 1); ramp.color_ramp.elements[0].position = .1
ramp.color_ramp.elements[1].color = (.03, .07, .22, 1); ramp.color_ramp.elements[1].position = .85
e = ramp.color_ramp.elements.new(.45); e.color = (.1, .62, .55, 1)
e = ramp.color_ramp.elements.new(.62); e.color = (.25, .2, .6, 1)
ns = t.nodes.new('ShaderNodeTexNoise'); ns.inputs['Scale'].default_value = .16; ns.inputs['Detail'].default_value = 6.; t.links.new(tc.outputs['Object'], ns.inputs['Vector'])
mx = t.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = .85
t.links.new(ramp.outputs[0], mx.inputs['A']); t.links.new(ns.outputs['Fac'], mx.inputs['B'])
t.links.new(mx.outputs['Result'], em.inputs['Color']); em.inputs['Strength'].default_value = 1.5
sky.data.materials.append(sm)
sky.visible_shadow = False

moon = bpy.data.objects.new('moon', bpy.data.meshes.new('moon'))
bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.5); bm.to_mesh(moon.data); bm.free()
moon.location = (4.1, 25, 13.2); col.objects.link(moon)
moon.data.materials.append(simple('moonM', (1, 1, 1), 1, emit=((.92, .96, 1), 14.)))
moon.visible_shadow = False

# Pillars
def faceted(name, x, y, r, z0, z1, mat, sides=8, tip=.82):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=sides, radius1=r, radius2=r * tip, depth=z1 - z0)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); ob.location = (x, y, (z0 + z1) / 2); col.objects.link(ob)
    return ob
for x in (8.5, 15.5, 2.0, 22.0):
    y = 8.3 if x in (8.5, 15.5) else 7.2
    faceted('pillar', x, y, .62, 1, 12, rib)
    faceted('base', x, y, .92, 1, 1.5, rib, 12)
    faceted('cap', x, y, .9, 11.2, 12, rib, 12)
for x in (5.2, 18.8):
    faceted('pillarNear', x, 3.4, .36, 1, 12, rib)
    faceted('baseNear', x, 3.4, .56, 1, 1.35, rib, 12)
    faceted('capNear', x, 3.4, .54, 11.5, 12, rib, 12)

# Hearth under the middle window
box('hearthBack', 9.6, 14.4, BACK - .5, BACK, 1, 4.1, stone)
hearth = poly_prism('hearthFront', [(9.2, 1), (14.8, 1), (14.8, 4.3), (9.2, 4.3)], BACK - 1.1, BACK - .45, stone)
cut = poly_prism('c', arch_pts(12, 2.6, .9, 3.5), BACK - 2, BACK, stone)
m = hearth.modifiers.new('c', 'BOOLEAN'); m.object = cut; m.operation = 'DIFFERENCE'; m.solver = 'EXACT'
bpy.context.view_layer.objects.active = hearth; bpy.ops.object.modifier_apply(modifier='c'); bpy.data.objects.remove(cut)
for i, dx in enumerate((-.75, -.25, .3, .8)):
    fl = faceted('fire', 12 + dx, BACK - .75, .32 - i * .02, 1, 2.0 + (i % 2) * .55, ember, 9, tip=.05)
    fl.data.polygons.foreach_set('use_smooth', [True] * len(fl.data.polygons))
fire = bpy.data.objects.new('fireLight', bpy.data.lights.new('fireLight', 'POINT'))
fire.data.energy = 90; fire.data.color = (1, .46, .16); fire.data.shadow_soft_size = .7
fire.location = (12, BACK - 1.7, 1.9); col.objects.link(fire)

# Chandelier
ch = (12, 4.6, 9.7)
faceted('chain', ch[0], ch[1], .03, ch[2] + .2, 12.2, gold, 6)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=1.9, radius2=1.9, depth=.09)
ring = bpy.data.objects.new('ring', bpy.data.meshes.new('ring')); bm.to_mesh(ring.data); bm.free()
ring.data.materials.append(gold); ring.location = ch; col.objects.link(ring)
hole = bpy.data.objects.new('hole', bpy.data.meshes.new('hole'))
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=1.78, radius2=1.78, depth=.5); bm.to_mesh(hole.data); bm.free()
hole.location = ch; col.objects.link(hole)
m = ring.modifiers.new('c', 'BOOLEAN'); m.object = hole; m.operation = 'DIFFERENCE'; m.solver = 'EXACT'
bpy.context.view_layer.objects.active = ring; bpy.ops.object.modifier_apply(modifier='c'); bpy.data.objects.remove(hole)
for i in range(16):
    a = i / 16 * math.tau
    x, y = ch[0] + math.cos(a) * 1.84, ch[1] + math.sin(a) * 1.84
    if i % 2 == 0:
        faceted('cand', x, y, .045, ch[2], ch[2] + .34, candle, 8)
    else:
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=.07, radius2=0, depth=.8)
        c = bpy.data.objects.new('drop', bpy.data.meshes.new('drop')); bm.to_mesh(c.data); bm.free()
        c.data.materials.append(ice_col); c.location = (x, y, ch[2] - .42); c.rotation_euler = (math.pi, 0, 0); col.objects.link(c)
lamp = bpy.data.objects.new('chandLight', bpy.data.lights.new('chandLight', 'POINT'))
lamp.data.energy = 150; lamp.data.color = (1, .72, .42); lamp.data.shadow_soft_size = 1.2
lamp.location = (ch[0], ch[1], ch[2] - .1); col.objects.link(lamp)

# Crystal clusters and snow drifts along the walls
import random
random.seed(4)
for cx, cy in ((2.3, 2.2), (1.9, 5.6), (22, 2.4), (22.2, 5.8), (7.2, 9.1), (16.9, 9.2)):
    for k in range(7):
        h = random.uniform(.8, 2.4)
        bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=random.uniform(.16, .34), radius2=0, depth=h)
        c = bpy.data.objects.new('cry', bpy.data.meshes.new('cry')); bm.to_mesh(c.data); bm.free()
        c.data.materials.append(ice_col)
        c.location = (cx + random.uniform(-.55, .55), cy + random.uniform(-.55, .55), 1 + h * .42)
        c.rotation_euler = (random.uniform(-.28, .28), random.uniform(-.28, .28), random.uniform(0, 3)); col.objects.link(c)
for i in range(38):
    x = random.choice((1.5, 22.5, random.uniform(2, 22)))
    y = random.uniform(1.2, BACK - .3) if x in (1.5, 22.5) else random.uniform(BACK - 1, BACK - .2)
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=1)
    s = bpy.data.objects.new('drift', bpy.data.meshes.new('drift')); bm.to_mesh(s.data); bm.free()
    for p in s.data.polygons: p.use_smooth = True
    s.data.materials.append(snow); s.location = (x, y, .98)
    s.scale = (random.uniform(.8, 1.7), random.uniform(.5, 1.1), random.uniform(.16, .36)); col.objects.link(s)

# Shadow-only proxies of the static tiles of room 1
proxy = simple('proxy', (.5, .6, .8), .5)
for r, row in enumerate(MAP):
    for c, ch_ in enumerate(row):
        if ch_ == '#':
            z = 12 - r
            ob = box('px', c, c + 1, -.5, .5, z, z + 1, proxy); ob.visible_camera = False
        elif ch_ == '=':
            z = 12 - r
            ob = box('px', c, c + 1, -.5, .5, z + .7, z + 1, proxy); ob.visible_camera = False

# Moonlight through the windows
sun = bpy.data.objects.new('moonSun', bpy.data.lights.new('moonSun', 'SUN'))
sun.data.energy = 5.; sun.data.color = (.66, .8, 1); sun.data.angle = math.radians(1.2)
sun.rotation_euler = (math.radians(-62), 0, math.radians(0))
col.objects.link(sun)

world = bpy.data.worlds.new('w'); world.use_nodes = True
tree = world.node_tree
bg = tree.nodes['Background']; bg.inputs[0].default_value = (.1, .2, .5, 1); bg.inputs[1].default_value = 1.1
vol = tree.nodes.new('ShaderNodeVolumeScatter'); vol.inputs['Density'].default_value = .02; vol.inputs['Anisotropy'].default_value = .35
vol.inputs['Color'].default_value = (.85, .92, 1, 1)
tree.links.new(vol.outputs[0], tree.nodes['World Output'].inputs['Volume'])
scene.world = world

# Render settings
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.get_devices()
for d in prefs.devices: d.use = True
scene.cycles.device = 'GPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 10; scene.cycles.transmission_bounces = 10; scene.cycles.volume_bounces = 1
scene.cycles.volume_step_rate = 4.
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.view_settings.exposure = 1.05

cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); col.objects.link(cam); scene.camera = cam
EYE = Vector((12, -27, 7.6)); AT = Vector((12, 0, 6.5))
cam.location = EYE
cam.rotation_euler = (AT - EYE).to_track_quat('-Z', 'Y').to_euler()
cam.data.sensor_fit = 'VERTICAL'
cam.data.lens_unit = 'FOV'
cam.data.angle_y = 2 * math.atan(6.5 / 27)
cam.data.clip_end = 200

scene.render.resolution_x, scene.render.resolution_y = int(1920 * SCALE), int(1040 * SCALE)
scene.render.image_settings.file_format = 'JPEG'
scene.render.image_settings.quality = 90
scene.render.filepath = os.path.join(OUT, 'hall_plate.jpg')
bpy.ops.render.render(write_still=True)

# Environment panorama from the middle of the play plane
for ob in col.objects:
    if ob.name.startswith('px'): ob.visible_camera = True
cam.location = (12, -6, 6.5); cam.rotation_euler = (math.pi / 2, 0, 0)
cam.data.type = 'PANO'; cam.data.panorama_type = 'EQUIRECTANGULAR'
scene.world.node_tree.links.remove(scene.world.node_tree.nodes['World Output'].inputs['Volume'].links[0])
scene.render.resolution_x, scene.render.resolution_y = 1024, 512
scene.cycles.samples = max(32, SAMPLES // 4)
scene.render.image_settings.file_format = 'HDR'
scene.render.filepath = os.path.join(OUT, 'hall_env.hdr')
bpy.ops.render.render(write_still=True)
