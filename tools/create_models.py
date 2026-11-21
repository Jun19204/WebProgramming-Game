"""Optional authoring script. Run in Blender; NEVER needed to play the game.
Creates F-22A-shaped aircraft, Needle missile and basalt island, then GLBs.
"""
import bpy, math, random, os
from mathutils import Vector
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'assets','models'); os.makedirs(OUT,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
def mat(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
alloy=mat('Pearl ceramic alloy',(.54,.66,.70),.65,.32); dark=mat('Graphite',(.035,.065,.09),.65); glass=mat('Amber canopy',(.23,.12,.035),.8,.19); orange=mat('Rescue vermilion',(.95,.16,.035),.3); nozzle=mat('Engine interior',(.012,.018,.023),.4)
def mesh(name,vs,fs,m):
 me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.data.materials.append(m); return o
def box(name,loc,scale,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=loc); o=bpy.context.object; o.name=name; o.scale=scale; o.data.materials.append(m); return o
def wedge(name,pts,t,m):
 n=len(pts); vs=[(x,y,z+d) for d in [-t/2,t/2] for x,y,z in pts]; fs=[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]; return mesh(name,vs,fs,m)
def export(name):
 bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,name+'.blend'))
 bpy.ops.object.select_all(action='SELECT'); bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,name+'.glb'),export_format='GLB',use_selection=True,export_yup=True)
 for o in list(bpy.context.scene.objects): o.hide_set(True); o.select_set(False)
def clear():
 for o in list(bpy.context.scene.objects): bpy.data.objects.remove(o,do_unlink=True)
# Use the revised F-22A-style exterior authoring script.
import runpy
runpy.run_path(os.path.join(ROOT,'tools','create_fighter.py'),run_name='__main__')
clear()
bpy.ops.mesh.primitive_cone_add(vertices=12,radius1=.24,radius2=.08,depth=3.8,rotation=(math.pi/2,0,0)); bpy.context.object.data.materials.append(alloy); bpy.context.object.name='NEEDLE body'
for s in [-1,1]:
 wedge('Missile fin',[(0,-1,0),(s*.85,-1.8,0),(0,-1.6,0)],.07,orange)
 wedge('Vertical missile fin',[(0,-1,0),(0,-1.8,s*.85),(0,-1.6,0)],.07,dark)
export('needle'); clear()
runpy.run_path(os.path.join(ROOT,'tools','create_island.py'),run_name='__main__')
# Each model has its own editable .blend saved before export.
print('SKY STRIKE models exported')
