"""Export instanced game props to props.glb. One unit = one tile. Materials are replaced in three.js by name."""
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, noise

OUT = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
col = bpy.context.scene.collection

def mat(name, color, rough=.4, metal=0.):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

ICE = mat('ice', (.75, .92, 1), .08)
SNOW = mat('snow', (.95, .97, 1), .8)
GOLD = mat('gold', (.9, .66, .3), .28, 1.)
WOOD = mat('doorWood', (.1, .2, .42), .34)
GEM = mat('gemRed', (.9, .12, .3), .08)
FLAKE = mat('flakeIce', (.8, .95, 1), .06)

def ob_from(bm, name, material, smooth=True, loc=(0, 0, 0)):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    o = bpy.data.objects.new(name, me); o.location = loc; col.objects.link(o)
    return o

def lumpy(bm, amp, freq, up_only=False):
    bm.normal_update()
    for v in bm.verts:
        n = noise.fractal(v.co * freq, 1., 2., 3)
        if up_only and v.normal.z < .2: continue
        v.co += v.normal * n * amp

def ledge(name, seed):
    """One-way ice shelf, top flush with the tile top (z=0), centred on x."""
    random.seed(seed)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 0, -.11)) @ Matrix.Diagonal((1.0, .96, .22, 1)))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=6, use_grid_fill=True)
    for v in bm.verts:
        if abs(v.co.x) > .49: continue
        if v.co.z < -.1: v.co.z += noise.noise(v.co * 7 + Vector((seed, 0, 0))) * .05
    bmesh.ops.bevel(bm, geom=[e for e in bm.edges if e.is_boundary], offset=.01) if False else None
    for i in range(random.randint(4, 6)):
        x, y = random.uniform(-.42, .42), random.uniform(-.4, .4)
        h = random.uniform(.22, .6)
        m = Matrix.Translation((x, y, -.22 - h / 2)) @ Matrix.Rotation(math.pi, 4, 'X')
        bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=random.uniform(.05, .1), radius2=.004, depth=h, matrix=m)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ob_from(bm, name, ICE)

def snowcap(name, seed):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 0, .05)) @ Matrix.Diagonal((1.02, 1.08, .14, 1)))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=10, use_grid_fill=True)
    for v in bm.verts:
        p = Vector((v.co.x * 4 + seed * 3.1, v.co.y * 4, 0))
        if v.co.z > .05:
            v.co.z += (noise.fractal(p, 1., 2., 3) + .3) * .07
        edge = max(abs(v.co.y) - .46, 0) * 7
        v.co.z -= edge * .1 * (1 + noise.noise(p))
        if v.co.z < 0 and abs(v.co.y) > .5:
            v.co.y *= 1 + noise.noise(p * 2) * .03
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ob_from(bm, name, SNOW)

def crystal_wall():
    """A rough slab of pink-tinted ice filling one tile, faceted so it catches light."""
    random.seed(3)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((.98, .92, 1, 1)))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    for v in bm.verts:
        if abs(v.co.z) < .49 and abs(v.co.y) > .4:
            v.co.y += random.uniform(-.05, .08) * (1 if v.co.y > 0 else -1)
            v.co.x += random.uniform(-.03, .03) if abs(v.co.x) < .49 else 0
    bmesh.ops.split_edges(bm, edges=bm.edges[:]) if False else None
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ob_from(bm, 'iceWall', ICE, smooth=False)

def ice_block():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=.92)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=.07, segments=3, profile=.6, affect='EDGES')
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ob_from(bm, 'iceBlock', ICE)

def flake():
    bm = bmesh.new()
    for k in range(6):
        rot = Matrix.Rotation(k * math.pi / 3, 4, 'Y')
        def bar(m, l, w):
            bmesh.ops.create_cube(bm, size=1, matrix=rot @ m @ Matrix.Diagonal((w, .05, l, 1)))
        bar(Matrix.Translation((0, 0, .21)), .42, .055)
        for z, s in ((.2, .15), (.31, .1)):
            for sign in (1, -1):
                bar(Matrix.Translation((sign * s * .36, 0, z + s * .4)) @ Matrix.Rotation(sign * math.radians(-50) , 4, 'Y'), s * 1.2, .04)
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=.08)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ob_from(bm, 'flake', FLAKE, smooth=False)

def heart():
    bm = bmesh.new()
    pts = []
    for i in range(40):
        t = i / 40 * math.tau
        x = 16 * math.sin(t) ** 3; z = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((x / 42, (z + 2) / 42))
    layers = [(-.09, .0), (-.1, .45), (0, 1.), (.1, .45), (.09, .0)]
    rings = []
    for y, s in ((-.14, .5), (-.09, .85), (0, 1.), (.09, .85), (.14, .5)):
        rings.append([bm.verts.new((x * s, y, z * s)) for x, z in pts])
    for a, b in zip(rings, rings[1:]):
        for i in range(40):
            j = (i + 1) % 40
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rings[0]); bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ob_from(bm, 'heart', GEM)

def door():
    """Frame stands on z=0; leaves hinge at the frame sides so they can swing open."""
    w, peak = 1.5, 2.15
    n = 12
    spring = peak - w * math.sin(math.pi / 3)
    def outline(w2, pk):
        sp = pk - w2 * math.sin(math.pi / 3)
        left = [(w2 / 2 - w2 * math.cos(i / n * math.pi / 3), sp + w2 * math.sin(i / n * math.pi / 3)) for i in range(n + 1)]
        return [(-w2 / 2, 0)] + left + [(-x, z) for x, z in reversed(left[:-1])] + [(w2 / 2, 0)]
    def prism(pts, y0, y1, name, m):
        bm = bmesh.new()
        a = [bm.verts.new((x, y0, z)) for x, z in pts]; b = [bm.verts.new((x, y1, z)) for x, z in pts]
        bm.faces.new(a); bm.faces.new(list(reversed(b)))
        for i in range(len(pts)):
            j = (i + 1) % len(pts); bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return ob_from(bm, name, m, smooth=False)
    outer = prism(outline(w + .36, peak + .2), -.32, .1, 'doorFrame', mat('frameIce', (.55, .78, .98), .22))
    inner = prism(outline(w, peak), -.5, .3, 'c', ICE)
    md = outer.modifiers.new('c', 'BOOLEAN'); md.object = inner; md.operation = 'DIFFERENCE'; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = outer; bpy.ops.object.modifier_apply(modifier='c'); bpy.data.objects.remove(inner)
    # leaves: split the arch at x=0, pivot on the hinge side
    ol = outline(w - .03, peak - .03)
    half = [(x, z) for x, z in ol if x <= 0.0001]
    half = half + [(0, 0)]
    left = prism([(x + w / 2, z) for x, z in half], -.14, -.06, 'doorLeafL', WOOD)
    left.location = (-w / 2, 0, 0)
    right = prism([(-(x + w / 2), z) for x, z in half], -.14, -.06, 'doorLeafR', WOOD)
    right.location = (w / 2, 0, 0)
    for o, s in ((left, 1), (right, -1)):
        for z in (.45, 1.0):
            bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((s * .3, -.15, z)) @ Matrix.Diagonal((.56, .03, .05, 1)))
            b = ob_from(bm, o.name + 'Band', GOLD, smooth=False); b.parent = o
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.05, matrix=Matrix.Translation((s * .64, -.18, .85)))
        k = ob_from(bm, o.name + 'Knob', GOLD); k.parent = o

ledge('ledge0', 1); ledge('ledge1', 2); ledge('ledge2', 3)
snowcap('cap0', 1); snowcap('cap1', 2); snowcap('cap2', 3)
crystal_wall(); ice_block(); flake(); heart(); door()
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'props.glb'), export_format='GLB', export_yup=True, export_apply=True, export_animations=False)
print('props ok', len(bpy.data.objects))
