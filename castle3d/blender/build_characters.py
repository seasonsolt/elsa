"""Build the two original sisters (rigid-skinned toy-doll style) and export GLB with clips.
Run: blender -b -P build_characters.py -- <outdir> [preview]"""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index('--') + 1:]
OUT = args[0]
PREVIEW = 'preview' in args

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, color, rough=.6, metal=0., emit=None, coat=0.):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1)
        b.inputs['Emission Strength'].default_value = emit[1]
    return m

class Builder:
    def __init__(self, name):
        self.name = name
        self.parts = []

    def _finish(self, bm, bone, mat, subdiv=0, disp=None):
        me = bpy.data.meshes.new('p')
        bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new('p', me)
        bpy.context.scene.collection.objects.link(ob)
        me.materials.append(mat)
        for p in me.polygons: p.use_smooth = True
        if disp:
            v = list(me.vertices)
            for vert in v:
                c = vert.co
                n = math.sin(c.x * disp[1] + 1.3) * math.sin(c.y * disp[1] * 1.3 + .7) * math.sin(c.z * disp[1] * .9)
                vert.co += vert.normal * n * disp[0]
        g = ob.vertex_groups.new(name=bone)
        g.add(range(len(me.vertices)), 1.0, 'REPLACE')
        self.parts.append(ob)
        return ob

    def tube(self, pts, radii, bone, mat, sides=14, squash=1., caps=True, disp=None):
        """Sweep a ring along pts; radii per point; rounded ends through tiny end rings."""
        bm = bmesh.new()
        pts = [Vector(p) for p in pts]
        if caps:
            d0 = (pts[0] - pts[1]).normalized(); d1 = (pts[-1] - pts[-2]).normalized()
            r0, r1 = radii[0], radii[-1]
            pre = [(pts[0] + d0 * r0 * math.sin(a), r0 * math.cos(a)) for a in (1.2, .8, .4)]
            post = [(pts[-1] + d1 * r1 * math.sin(a), r1 * math.cos(a)) for a in (.4, .8, 1.2)]
            seq = pre + list(zip(pts, radii)) + post
        else:
            seq = list(zip(pts, radii))
        rings = []
        ref = Vector((1, 0, 0))
        for i, (p, r) in enumerate(seq):
            a = seq[max(0, i - 1)][0]; b = seq[min(len(seq) - 1, i + 1)][0]
            t = (b - a).normalized()
            if abs(t.dot(ref)) > .95: ref = Vector((0, 1, 0))
            u = t.cross(ref).normalized(); v = t.cross(u).normalized()
            ring = []
            for s in range(sides):
                th = s / sides * math.tau
                ring.append(bm.verts.new(p + u * math.cos(th) * r * squash + v * math.sin(th) * r))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for s in range(sides):
                s2 = (s + 1) % sides
                bm.faces.new((a[s], a[s2], b[s2], b[s]))
        if caps:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._finish(bm, bone, mat, disp=disp)

    def sphere(self, loc, scale, bone, mat, seg=32, rings=20, disp=None):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1,
                                  matrix=Matrix.Translation(loc) @ Matrix.Diagonal((*scale, 1)))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._finish(bm, bone, mat, disp=disp)

    def lathe(self, profile, bone, mat, sides=36, ysq=.8, disp=None):
        """profile: [(radius, z)] bottom-up, around the Z axis, squashed in Y."""
        return self._lathe(profile, bone, mat, sides, ysq, disp)

    def _lathe(self, profile, bone, mat, sides, ysq, disp):
        bm = bmesh.new()
        rings = []
        for r, z in profile:
            rings.append([bm.verts.new((math.cos(s / sides * math.tau) * r, math.sin(s / sides * math.tau) * r * ysq, z)) for s in range(sides)])
        for a, b in zip(rings, rings[1:]):
            for s in range(sides):
                s2 = (s + 1) % sides
                bm.faces.new((a[s], a[s2], b[s2], b[s]))
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return self._finish(bm, bone, mat, disp=disp)

    def torus(self, center, major, minor, bone, mat, ysq=.85, disp=None, sides=40):
        pts = [(center[0] + math.cos(a / sides * math.tau) * major, center[1] + math.sin(a / sides * math.tau) * major * ysq, center[2]) for a in range(sides + 1)]
        return self.tube(pts, [minor] * (sides + 1), bone, mat, sides=12, caps=False, disp=disp)

JOINTS = dict(hips=.50, spine=.62, chest=.78, neck=.94, headTop=1.46, shoulder=.86, hipX=.085, shoulderX=.17)

def make_armature(name):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    J = JOINTS
    def bone(n, h, t, parent=None, connect=False):
        b = arm.edit_bones.new(n); b.head = h; b.tail = t
        if parent: b.parent = arm.edit_bones[parent]; b.use_connect = connect
        return b
    bone('root', (0, 0, 0), (0, 0, .2))
    bone('hips', (0, 0, J['hips']), (0, 0, J['spine']), 'root')
    bone('spine', (0, 0, J['spine']), (0, 0, J['chest']), 'hips')
    bone('chest', (0, 0, J['chest']), (0, 0, J['neck']), 'spine')
    bone('head', (0, 0, J['neck']), (0, 0, J['headTop']), 'chest')
    bone('eyes', (0, -.2, 1.16), (0, -.2, 1.26), 'head')
    for s, m in (('L', 1), ('R', -1)):
        sx = J['shoulderX'] * m
        bone('upperArm' + s, (sx, 0, J['shoulder']), (sx * 1.35, 0, J['shoulder'] - .2), 'chest')
        bone('foreArm' + s, (sx * 1.35, 0, J['shoulder'] - .2), (sx * 1.5, -.02, J['shoulder'] - .39), 'upperArm' + s)
        hx = J['hipX'] * m
        bone('thigh' + s, (hx, 0, J['hips']), (hx, 0, .27), 'hips')
        bone('shin' + s, (hx, 0, .27), (hx, 0, .05), 'thigh' + s)
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob

def shared_face(b, skin, eye_color, brow, mouth):
    white = material('eyeWhite', (.95, .96, .98), .25, coat=1.)
    iris = material('iris_' + b.name, eye_color, .2, coat=1.)
    pupil = material('pupil', (.01, .01, .02), .15, coat=1.)
    glint = material('glint', (1, 1, 1), .3, emit=((1, 1, 1), 3.))
    for s in (1, -1):
        x = .092 * s
        b.sphere((x, -.222, 1.19), (.054, .022, .068), 'eyes', white, seg=20, rings=12)
        b.sphere((x, -.238, 1.187), (.039, .014, .049), 'eyes', iris, seg=20, rings=12)
        b.sphere((x, -.25, 1.185), (.021, .008, .026), 'eyes', pupil, seg=16, rings=10)
        b.sphere((x + .012, -.257, 1.208), (.011, .004, .013), 'eyes', glint, seg=10, rings=6)
        b.tube([(x - .05 * s, -.238, 1.27 + .004), (x, -.253, 1.283), (x + .05 * s, -.236, 1.268)], [.007, .011, .006], 'head', brow, sides=8)
        b.tube([(x - .056 * s, -.232, 1.235), (x, -.247, 1.255), (x + .056 * s, -.228, 1.232)], [.004, .007, .004], 'head', material('lash', (.03, .025, .03), .4), sides=8)
        b.sphere((x * 1.5, -.222, 1.112), (.05, .012, .03), 'head', material('blush_' + b.name, (skin[0], skin[1] * .62, skin[2] * .62), .6), seg=16, rings=10)
    b.sphere((0, -.262, 1.13), (.016, .016, .013), 'head', material('skin_' + b.name, skin, .5))
    b.tube([(-.036, -.247, 1.078), (0, -.259, 1.064), (.036, -.247, 1.078)], [.004, .007, .004], 'head', mouth, sides=8)

def legs(b, leg_mat, boot_mat, cuff_mat):
    for bone_s, m in (('L', 1), ('R', -1)):
        x = .085 * m
        b.tube([(x, 0, .5), (x, 0, .27)], [.078, .058], 'thigh' + bone_s, leg_mat)
        b.tube([(x, 0, .27), (x, 0, .13)], [.058, .05], 'shin' + bone_s, leg_mat)
        b.tube([(x, .006, .22), (x, .004, .05)], [.072, .077], 'shin' + bone_s, boot_mat, sides=16)
        b.sphere((x, -.04, .045), (.08, .125, .05), 'shin' + bone_s, boot_mat)
        b.tube([(x, 0, .225), (x, 0, .205)], [.082, .082], 'shin' + bone_s, cuff_mat, sides=16)

def arms(b, sleeve, cuff, hand):
    for s, m in (('L', 1), ('R', -1)):
        sx = .17 * m
        b.sphere((sx, 0, .86), (.078, .08, .08), 'upperArm' + s, sleeve)
        b.tube([(sx, 0, .86), (sx * 1.35, 0, .66)], [.07, .056], 'upperArm' + s, sleeve)
        b.tube([(sx * 1.35, 0, .66), (sx * 1.5, -.02, .5)], [.056, .05], 'foreArm' + s, sleeve)
        b.tube([(sx * 1.47, -.018, .52), (sx * 1.5, -.02, .49)], [.06, .06], 'foreArm' + s, cuff)
        b.sphere((sx * 1.53, -.024, .445), (.05, .05, .058), 'foreArm' + s, hand)

def build_frost():
    b = Builder('frost')
    skin = (.87, .69, .6)
    sk = material('skin_frost', skin, .5)
    coat = material('coatPeriwinkle', (.12, .17, .42), .62)
    lining = material('coatTrim', (.05, .07, .19), .7)
    fur = material('fur', (.85, .87, .92), .95)
    hair = material('hairSilver', (.62, .6, .74), .36, coat=.3)
    leg = material('tights', (.06, .07, .13), .7)
    boot = material('bootWhite', (.8, .82, .88), .55)
    scarf = material('scarfIce', (.45, .75, .85), .8)
    gold = material('pinSilver', (.85, .92, 1.), .2, metal=1.)
    legs(b, leg, boot, fur)
    b.lathe([(.235, .28), (.222, .4), (.19, .55), (.165, .68), (.178, .84), (.15, .92), (.075, .96)], 'spine', coat, ysq=.74, disp=(.004, 40))
    b.lathe([(.245, .262), (.241, .296), (.225, .3)], 'hips', fur, ysq=.76, disp=(.012, 55))
    b.lathe([(.165, .6), (.168, .63), (.16, .64)], 'spine', lining, ysq=.76)
    b.tube([(0, -.138, .92), (0, -.178, .68), (0, -.205, .31)], [.012, .012, .012], 'spine', lining, sides=8)
    for z in (.82, .7, .58, .46):
        r = {.82: .16, .7: .15, .58: .17, .46: .2}[z]
        b.sphere((.05, -r * .76 - .004, z), (.017, .009, .017), 'spine', gold, seg=12, rings=8)
    arms(b, coat, fur, material('mittenIce', (.52, .78, .9), .85))
    b.tube([(-.14, .05, .95), (0, .13, .97), (.14, .05, .95)], [.045, .1, .045], 'chest', coat, sides=16)  # hood folded back
    b.torus((0, .0, .955), .137, .05, 'chest', fur, ysq=.92, disp=(.014, 48))
    b.tube([(.12, -.12, .92), (.14, -.145, .78), (.135, -.16, .62)], [.042, .05, .034], 'chest', scarf, sides=12, disp=(.004, 80))
    b.sphere((0, 0, .995), (.062, .062, .07), 'head', sk)
    b.sphere((0, 0, 1.21), (.265, .245, .255), 'head', sk, seg=48, rings=32)
    shared_face(b, skin, (.2, .5, .62), material('browSilver', (.36, .34, .46), .5), material('mouth', (.52, .2, .22), .4))
    # short layered bob made of individual locks
    random.seed(7)
    b.sphere((0, .025, 1.255), (.278, .262, .25), 'head', hair, seg=48, rings=32)
    for i in range(84):
        a = (i / 84) * math.tau + random.random() * .03
        if abs(a - math.pi * 1.5) < .5: continue   # keep the face clear
        rx, ry = math.cos(a), math.sin(a)
        tip = 1.0 + random.random() * .05
        wob = random.uniform(-.008, .008)
        pts = [(rx * .1, ry * .09 + .03, 1.475), (rx * .25 + wob, ry * .235 + .03, 1.37), (rx * .282 + wob, ry * .268 + .03, 1.18), (rx * .25, ry * .24 + .03, tip)]
        b.tube(pts, [.022, .032, .03, .008], 'head', hair, sides=7)
    for k in range(13):
        x = -.17 + k * .028
        sw = -x * .22 + random.uniform(-.01, .01)
        pts = [(x * .5, -.12, 1.485), (x * .92, -.24, 1.42), (x + sw, -.262, 1.325 + random.uniform(-.012, .012))]
        b.tube(pts, [.024, .03, .007], 'head', hair, sides=7)
    # snowflake hairpin
    for k in range(3):
        a = k * math.pi / 3
        dx, dz = math.cos(a) * .042, math.sin(a) * .042
        b.tube([(.205 - dx, -.205, 1.335 - dz), (.205 + dx, -.205, 1.335 + dz)], [.0075, .0075], 'head', gold, sides=6)
    return b

def build_nuan():
    b = Builder('nuan')
    skin = (.56, .35, .24)
    sk = material('skin_nuan', skin, .48)
    knit = material('knitMustard', (.78, .47, .07), .9)
    knitDark = material('knitRust', (.42, .11, .06), .85)
    skirt = material('skirtPlaid', (.46, .08, .1), .75)
    leg = material('leggingsBrown', (.1, .06, .05), .72)
    boot = material('bootTan', (.34, .17, .08), .5)
    hair = material('hairBlack', (.03, .024, .026), .68)
    brass = material('brass', (.87, .6, .23), .3, metal=1.)
    flame = material('lanternGlow', (1, .75, .3), .4, emit=((1, .55, .18), 9.))
    glass = material('lanternGlass', (1, .85, .6), .1, emit=((1, .6, .25), 1.6))
    legs(b, leg, boot, knitDark)
    b.lathe([(.25, .3), (.215, .42), (.17, .54), (.16, .6)], 'hips', skirt, ysq=.8, disp=(.005, 34))
    profile = [(.158, .54), (.172, .6), (.168, .72), (.178, .84), (.15, .92), (.07, .95)]
    b.lathe(profile, 'spine', knit, ysq=.76)
    b.lathe([(.178, .535), (.182, .565), (.17, .57)], 'hips', knitDark, ysq=.77)
    def rad(z):
        for (r0, z0), (r1, z1) in zip(profile, profile[1:]):
            if z0 <= z <= z1: return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    for z in (.66, .74, .82):
        b.lathe([(rad(z - .014) + .0015, z - .014), (rad(z - .014) + .0045, z - .01), (rad(z + .014) + .0045, z + .01), (rad(z + .014) + .0015, z + .014)], 'spine', knitDark, ysq=.76)
    b.torus((0, 0, .945), .095, .038, 'chest', knitDark, ysq=.9, disp=(.004, 70))
    arms(b, knit, knitDark, material('mittenRed', (.62, .07, .07), .85))
    b.sphere((0, 0, .995), (.062, .062, .07), 'head', sk)
    b.sphere((0, 0, 1.2), (.262, .24, .25), 'head', sk, seg=48, rings=32)
    shared_face(b, skin, (.14, .07, .03), material('browBlack', (.02, .015, .015), .5), material('mouthWarm', (.42, .09, .1), .4))
    # hair: cap of curls plus two puffs
    random.seed(11)
    b.sphere((0, .03, 1.262), (.272, .25, .228), 'head', hair, seg=40, rings=28, disp=(.009, 34))
    for i in range(240):
        a = random.random() * math.tau
        h = random.uniform(.06, .97)
        r = math.sqrt(max(.04, 1 - h * h))
        p = (math.cos(a) * r * .28, math.sin(a) * r * .262 + .03, 1.25 + h * .232)
        if p[1] < -.1 and p[2] < 1.36: continue
        q = random.uniform(.021, .031)
        b.sphere(p, (q, q, q * 1.2), 'head', hair, seg=8, rings=6)
    for s in (1, -1):
        c = (.235 * s, .03, 1.5)
        b.sphere(c, (.13, .125, .125), 'head', hair, seg=24, rings=16, disp=(.012, 42))
        for i in range(120):
            a = random.random() * math.tau; h = random.uniform(-1, 1); r = math.sqrt(1 - h * h)
            q = random.uniform(.019, .03)
            b.sphere((c[0] + math.cos(a) * r * .124, c[1] + math.sin(a) * r * .12, c[2] + h * .12), (q, q, q), 'head', hair, seg=8, rings=6)
        b.torus((c[0] * .78, c[1], 1.4), .058, .0125, 'head', knitDark, sides=20)
    # little lantern held in the right hand
    hand = (-.2805, -.024, .425)
    b.tube([hand, (hand[0], hand[1], .3)], [.006, .006], 'foreArmR', brass, sides=6, caps=False)
    cx, cy = hand[0], hand[1]
    b.tube([(cx, cy, .3), (cx, cy, .285)], [.022, .046], 'foreArmR', brass, sides=14)
    b.tube([(cx, cy, .285), (cx, cy, .16)], [.042, .042], 'foreArmR', glass, sides=14)
    b.sphere((cx, cy, .22), (.018, .018, .034), 'foreArmR', flame, seg=12, rings=8)
    b.tube([(cx, cy, .16), (cx, cy, .145)], [.05, .05], 'foreArmR', brass, sides=14)
    return b

CLIP = {}
def key(pb, frame, euler=None, loc=None):
    if euler is not None:
        pb.rotation_mode = 'XYZ'
        pb.rotation_euler = [math.radians(a) for a in euler]
        pb.keyframe_insert('rotation_euler', frame=frame)
    if loc is not None:
        pb.location = loc
        pb.keyframe_insert('location', frame=frame)

def pose_clips(ob):
    p = ob.pose.bones
    ad = ob.animation_data_create()
    def clip(name, fn, length):
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        ad.action = act
        for pb in p:
            pb.rotation_mode = 'XYZ'; pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0); pb.scale = (1, 1, 1)
        fn(length)
        track = ad.nla_tracks.new(); track.name = name
        strip = track.strips.new(name, 1, act); strip.name = name
        ad.action = None
    S = math.sin
    def idle(n):
        for f in (1, 1 + n // 2, 1 + n):
            t = (f - 1) / n * math.tau
            key(p['chest'], f, (S(t) * 1.6, 0, 0)); key(p['head'], f, (-S(t) * 1.1, 0, S(t) * 2.2))
            for s, m in (('L', 1), ('R', -1)):
                key(p['upperArm' + s], f, (S(t) * 2, 0, -m * (7 + S(t) * 1.2)))
                key(p['foreArm' + s], f, (-10, 0, 0))
    def run(n):
        for f in range(1, n + 2, 2):
            t = (f - 1) / n * math.tau
            key(p['hips'], f, (-7, 0, 0), (0, 0, 0))
            key(p['root'], f, None, (0, 0, abs(S(t)) * .045 - .02))
            key(p['chest'], f, (6, 0, S(t) * 7))
            key(p['head'], f, (0, 0, -S(t) * 4))
            for s, m in (('L', 1), ('R', -1)):
                th = S(t) * m
                key(p['thigh' + s], f, (th * 46 , 0, 0))
                key(p['shin' + s], f, (-max(0, S(t + 1.3) * m) * 66 - 8, 0, 0))
                key(p['upperArm' + s], f, (-th * 42, 0, -m * 13))
                key(p['foreArm' + s], f, (-34 , 0, 0))
    def jump(n):
        for f in (1, n + 1):
            key(p['chest'], f, (-5, 0, 0)); key(p['head'], f, (6, 0, 0))
            for s, m in (('L', 1), ('R', -1)):
                key(p['thigh' + s], f, (28 if s == 'L' else -12, 0, 0))
                key(p['shin' + s], f, (-46 if s == 'L' else -24, 0, 0))
                key(p['upperArm' + s], f, (-52 if s == 'R' else 30, 0, -m * 34))
                key(p['foreArm' + s], f, (-24, 0, 0))
    def cast(n):
        for f, amt in ((1, 0), (5, 1), (10, .85), (n + 1, 0)):
            key(p['chest'], f, (6 * amt, 0, 0))
            key(p['upperArmR'], f, (-86 * amt, 0, 8 * amt))
            key(p['upperArmL'], f, (-86 * amt, 0, -8 * amt))
            key(p['foreArmR'], f, (-14 * amt, 0, 0)); key(p['foreArmL'], f, (-14 * amt, 0, 0))
    def cheer(n):
        for f in (1, 1 + n // 2, 1 + n):
            t = (f - 1) / n * math.tau
            key(p['root'], f, None, (0, 0, abs(S(t)) * .1))
            for s, m in (('L', 1), ('R', -1)):
                key(p['upperArm' + s], f, (0, 0, -m * (138 + S(t) * 10))); key(p['foreArm' + s], f, (-16, 0, 0))
    for name, fn, n in (('idle', idle, 48), ('run', run, 16), ('jump', jump, 8), ('cast', cast, 16), ('cheer', cheer, 16)):
        clip(name, fn, n)

def assemble(builder):
    arm = make_armature(builder.name)
    bpy.ops.object.select_all(action='DESELECT')
    for o in builder.parts: o.select_set(True)
    bpy.context.view_layer.objects.active = builder.parts[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = builder.name + 'Body'
    body.parent = arm
    mod = body.modifiers.new('Armature', 'ARMATURE'); mod.object = arm
    pose_clips(arm)
    return arm, body

def export(name):
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB',
        export_animation_mode='NLA_TRACKS', export_skins=True, export_apply=False, export_yup=True,
        export_force_sampling=True, export_frame_step=1, export_optimize_animation_size=True)

def preview(arm, name):
    s = bpy.context.scene
    s.render.engine = 'BLENDER_EEVEE'
    s.view_settings.view_transform = 'Standard'
    s.render.resolution_x, s.render.resolution_y = 420, 560
    w = bpy.data.worlds.new('w'); w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (.32, .42, .6, 1); s.world = w
    cam = bpy.data.objects.new('c', bpy.data.cameras.new('c')); s.collection.objects.link(cam); s.camera = cam
    cam.location = (1.1, -4.4, .95); cam.rotation_euler = (math.radians(87), 0, math.radians(14)); cam.data.lens = 62
    l = bpy.data.objects.new('l', bpy.data.lights.new('l', 'SUN')); s.collection.objects.link(l); l.data.energy = 3.; l.rotation_euler = (.9, .2, .5)
    tracks = arm.animation_data.nla_tracks
    for clip, frame in (('idle', 1), ('run', 5), ('run', 13), ('jump', 1), ('cast', 6), ('cheer', 9)):
        for t in tracks: t.mute = t.name != clip
        s.frame_set(frame)
        s.render.filepath = os.path.join(OUT, '..', f'preview_{name}_{clip}{frame}.png')
        bpy.ops.render.render(write_still=True)

for name, fn in (('frost', build_frost), ('nuan', build_nuan)):
    reset()
    arm, body = assemble(fn())
    print(name, 'verts', len(body.data.vertices))
    export(name)
    if PREVIEW: preview(arm, name)
