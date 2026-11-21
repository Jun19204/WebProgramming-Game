"""Blender-only authoring of texture-free coastal terrain; shared render/collision mesh."""
import bpy
import math
import os
from mathutils import noise, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'models')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
noise.seed_set(17)

def material(name, color):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = .94
    return m

# Coherent erosion-like ridges instead of independently jittered triangles.
n = 113
vertices = []
for j in range(n):
    for i in range(n):
        x, y = (i/(n-1)*2-1)*1100, (j/(n-1)*2-1)*850
        a = math.atan2(y, x)
        r = math.hypot(x/1050, y/790)
        rim = 1 + .09*math.sin(a*5) + .045*math.cos(a*9)
        land = max(0, 1-r/rim)
        broad = noise.fractal(Vector((x/260, y/260, .73)), 1, 2, 4)
        fine = noise.noise_vector(Vector((x/65, y/65, 2.1))).x
        ridge = math.sin(a*7 + r*8)*math.sin(a*3-r*5)
        h = land**1.65*510 + land*(broad*72 + ridge*55 + fine*8)-14
        vertices.append((x, y, h))
faces = []
for j in range(n-1):
    for i in range(n-1):
        a = j*n+i
        faces.extend([(a, a+1, a+n), (a+1, a+n+1, a+n)])
mesh = bpy.data.meshes.new('Continuous coastal terrain')
mesh.from_pydata(vertices, [], faces)
mesh.update()
obj = bpy.data.objects.new('Basalt island collision surface', mesh)
bpy.context.collection.objects.link(obj)
palette = [('Submerged sand', (.22,.28,.24)), ('Wet shore', (.28,.29,.23)),
           ('Dry sand', (.48,.45,.33)), ('Coastal grass', (.19,.24,.115)),
           ('Heather scrub', (.125,.18,.09)), ('Basalt cliffs', (.22,.235,.22)),
           ('Weathered rock', (.32,.32,.285)), ('Highland grass', (.25,.27,.16))]
for name, color in palette:
    mesh.materials.append(material(name, color))
for p in mesh.polygons:
    center = sum((Vector(vertices[k]) for k in p.vertices), Vector())/3
    z = center.z
    variation = noise.noise_vector(center/110).x
    if z < 1: idx = 0
    elif z < 5: idx = 1
    elif z < 14 + variation*5: idx = 2
    elif p.normal.z < .82: idx = 5 if variation < .15 else 6
    elif z > 285: idx = 6 if variation > .1 else 7
    else: idx = 3 if variation > .12 else 4
    p.material_index = idx
    p.use_smooth = True
# Per-vertex blending avoids triangular material boundaries along beaches and cliffs.
def blend(a, b, t):
    t = max(0, min(1, t))
    t = t*t*(3-2*t)
    return tuple(x*(1-t)+y*t for x, y in zip(a, b))

colors = mesh.color_attributes.new(name='Terrain tint', type='FLOAT_COLOR', domain='CORNER')
for loop in mesh.loops:
    v = mesh.vertices[loop.vertex_index]
    z = v.co.z
    variation = noise.noise_vector(v.co/110).x
    grass = blend((.125,.18,.09), (.22,.25,.14), variation+.5)
    rock = blend((.20,.215,.20), (.32,.32,.285), variation+.5)
    upland = blend(grass, rock, max((.91-v.normal.z)*5, (z-270)/150))
    shore = blend((.24,.27,.22), (.46,.43,.32), (z+1)/8)
    color = blend(shore, upland, (z-8)/17)
    colors.data[loop.index].color = (*color, 1)
terrain = material('Blended coastal stone and vegetation', (1,1,1))
attr = terrain.node_tree.nodes.new('ShaderNodeVertexColor')
attr.layer_name = colors.name
terrain.node_tree.links.new(attr.outputs['Color'], terrain.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
mesh.materials.clear()
mesh.materials.append(terrain)
for p in mesh.polygons:
    p.material_index = 0
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'island.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'island.glb'), export_format='GLB', use_selection=True, export_yup=True)
print('Coastal terrain exported: %d triangles' % len(faces))
