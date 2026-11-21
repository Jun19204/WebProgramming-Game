"""Optional Blender studio previews, not screenshots of the browser game."""
import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for name, eye, target, span in [('kestrel', (24, 30, 20), (0, 0, 0), 26),
                                 ('kestrel-top', (0, 0, 35), (0, 0, 0), 28),
                                 ('kestrel-side', (35, 0, 2), (0, 0, 1), 25),
                                 ('kestrel-rear', (22, -30, 13), (0, 0, 0), 25),
                                 ('island', (1800, -2100, 1700), (0, 0, 100), 2800)]:
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'assets', 'models', name.split('-')[0]+'.blend'))
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.world.color = (.23, .23, .23)
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 1000))
    bpy.context.object.rotation_euler = (.45, -.5, -.5)
    bpy.context.object.data.energy = 3
    bpy.context.object.data.angle = .15
    bpy.ops.object.camera_add(location=eye)
    camera = bpy.context.object
    camera.rotation_euler = (Vector(target)-camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span
    camera.data.clip_end = 10000
    scene.camera = camera
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.filepath = os.path.join(ROOT, 'assets', 'models', name+'-preview.png')
    bpy.ops.render.render(write_still=True)
