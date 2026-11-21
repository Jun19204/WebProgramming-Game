"""Original Blender F-22A: DVIDS 9081649 top / 9081653 side references.
18.90m length, 13.56m span. +Y forward, +Z up; glTF forward is -Z.
Public-view visual reconstruction, not an engineering model. No textures.
"""
import bpy, math, os
from mathutils import Vector, Matrix, noise
from mathutils.bvhtree import BVHTree
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(ROOT,'assets','models')
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.context.preferences.filepaths.save_version=0
def mat(name,c,metal=0,rough=.55):
 m=bpy.data.materials.new(name);m.diffuse_color=(*c,1);m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough
 return m
skin=mat('Raptor cool grey skin',(.32,.35,.37),.16,.56)
edge=mat('RAM edge coating',(.405,.42,.43),.16,.61)
nose=mat('Radome grey',(.37,.385,.395),.08,.62)
dark=mat('Intake and nozzle cavity',(.009,.013,.018),.15,.75)
seam=mat('Flush panel joints',(.17,.19,.20),.1,.65)
glass=mat('Gold coated canopy',(.34,.26,.10),.85,.07)
metal=mat('Heat stained nozzle petals',(.24,.23,.21),.75,.4)
light=mat('Position light',(.50,.035,.018),.1,.25)
greenlight=mat('Starboard position light',(.025,.30,.13),.1,.25)
ram=mat('Low contrast dielectric panels',(.28,.31,.33),.15,.65)
marking=mat('Low visibility identification grey',(.13,.15,.17),.05,.70)
ductmat=mat('Inlet inner grey coating',(.115,.135,.15),.12,.72)
hotmetal=mat('Nozzle inner heat shielding',(.105,.095,.085),.62,.58)
coolmetal=mat('Nozzle titanium alternating panels',(.31,.30,.28),.72,.43)
formation=mat('Formation light strip',(.40,.44,.30),.05,.45)
def mesh(name,v,f,m,smooth=False):
 me=bpy.data.meshes.new(name);me.from_pydata(v,[],f);me.update()
 o=bpy.data.objects.new(name,me);bpy.context.collection.objects.link(o);me.materials.append(m)
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
 bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT');bpy.ops.mesh.normals_make_consistent(inside=False);bpy.ops.object.mode_set(mode='OBJECT')
 for p in me.polygons:p.use_smooth=smooth
 o.select_set(False);return o
def line(name,pts,r=.006,m=seam):
 cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.bevel_depth=r;cu.bevel_resolution=1;cu.resolution_u=1
 sp=cu.splines.new('POLY');sp.points.add(len(pts)-1)
 for p,co in zip(sp.points,pts):p.co=(*co,1)
 o=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(o);cu.materials.append(m)
def panel(name,pts,t,m):
 normal=(Vector(pts[1])-Vector(pts[0])).cross(Vector(pts[2])-Vector(pts[0])).normalized()
 n=len(pts);v=[tuple(Vector(p)+normal*d) for d in [-t/2,t/2] for p in pts]
 return mesh(name,v,[tuple(reversed(range(n))),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],m)
# One chined skin replaces the old intersecting engine tubes.
# Station: y, half-width, crown, belly.
stations=[(-7.25,1.95,.42,-.40),(-6.3,2.08,.62,-.62),(-4.5,2.22,.78,-.78),
  (-2.6,2.26,.85,-.86),(-.4,2.17,.83,-.9),(1.0,2.15,.8,-.9),
  (3.72,1.88,.72,-.8),(4.63,.87,.66,-.67),(5.4,.86,.614,-.58),(6.2,.83,.54,-.49),
  (6.95,.76,.44,-.40),(7.65,.64,.34,-.31),(8.3,.48,.20,-.23),(8.85,.31,.11,-.15),
  (9.45,.008,-.03,-.04)]
# Broad flat F-22 nose: wide ogive in plan, sharp side chine and a faceted
# upper side wall. Lower points are unchanged so the inlet belly loft still
# meets the hull exactly.
section=[(0,.92),(.3,.98),(.58,1),(.78,.84),(.89,.44),(1,.04),(.88,-.7),(.53,-.95),(0,-1),(-.53,-.95),(-.88,-.7),(-1,.04),(-.89,.44),(-.78,.84),(-.58,1),(-.3,.98)]
CHINE=[i for i,(x,z) in enumerate(section) if abs(x)==1]
def droop(y):
 u=max(0,min(1,(y-7.0)/2.45));return .085*u*u
def station(y):
 for a,b in zip(stations,stations[1:]):
  if a[0]<=y<=b[0]:
   f=(y-a[0])/(b[0]-a[0]);return tuple(p+(q-p)*f for p,q in zip(a[1:],b[1:]))
 return stations[-1][1:]
def point(y,w,top,bottom,x,z):
 # Keep the forward lower core narrow, leaving actual open intake cavities.
 aft=max(0,min(1,(y+.4)/2.6));aft=aft*aft*(3-2*aft)
 fore=max(0,min(1,(4.63-y)/.91));fore=fore*fore*(3-2*fore)
 narrow=1-.57*aft*fore if z<0 else 1
 height=z*top if z>=0 else -z*bottom
 # Blend the two engine shoulders into the skin, retaining a shallow spine channel.
 if z>0 and -6.8<y<2.5:
  envelope=math.sin(math.pi*(y+6.8)/9.3)**.7
  height+=.19*envelope*math.exp(-((abs(x*w)-1.12)/.55)**2)*z
 if z>0 and 2.7<y<4.3:
  height+=.14*math.sin(math.pi*(y-2.7)/1.6)*math.exp(-(x*w/.4)**2)*z
 return (x*w*narrow,y,height-droop(y))
def surf(y,x,z):return Vector(point(y,*station(y),x,z))
def hull(name,rings,m):
 # Subdivide the surface for broad vertex-painted camouflage and smooth lighting.
 dense=[]
 for a,b in zip(rings,rings[1:]):
  dense.extend([tuple(x+(y-x)*k/6 for x,y in zip(a,b)) for k in range(6)])
 dense.append(rings[-1]);rings=dense
 v=[point(y,w,top,bottom,x,z) for y,w,top,bottom in rings for x,z in section];n=len(section)
 f=[tuple(reversed(range(n))),tuple(range((len(rings)-1)*n,len(rings)*n))]
 f.extend((i*n+j,i*n+(j+1)%n,(i+1)*n+(j+1)%n,(i+1)*n+j) for i in range(len(rings)-1) for j in range(n))
 o=mesh(name,v,f,m,True);o.data.polygons[0].use_smooth=False;o.data.polygons[1].use_smooth=False
 # Crisp chine: split normals along the widest line only.
 crease={tuple(sorted((i*n+j,(i+1)*n+j))) for i in range(len(rings)-1) for j in CHINE}
 for e in o.data.edges:
  if tuple(sorted(e.vertices)) in crease:e.use_edge_sharp=True
 return o
body=hull('Continuous chined fuselage',stations[:-2],skin)
hull('Tapered radome',stations[-3:],nose)
for s in [-1,1]:
 line('Nose chine',[tuple(surf(4.7+k*.19,s,.04)+Vector((s*.006,0,.002))) for k in range(25)],.009,edge)
line('Radome joint',[tuple(surf(8.28,x,z)+Vector((x*.006,0,z*.006))) for x,z in section+section[:1]],.006,seam)
# Airfoil sections with camber, thin edges and the reference planform.
wing=[(1.72,1.55,-5.95,.25),(2.18,1.0,-6.0,.23),(4.15,-.80,-5.59,.17),(5.89,-2.40,-5.05,.105),(6.78,-3.16,-4.25,.055)]
tail=[(1.14,-6.2,-7.95,.14),(1.85,-6.0,-8.65,.12),(2.8,-6.5,-9.45,.09),(4.42,-7.57,-8.90,.035)]
def foil(name,rows,s,zbase):
 original=rows
 rows=[]
 for a,b in zip(original,original[1:]):
  rows.extend(tuple(v+(w-v)*k/8 for v,w in zip(a,b)) for k in range(8))
 rows.append(original[-1])
 v=[];count=25
 for side in [1,-1]:
  for x,front,back,t in rows:
   for k in range(count):
    u=k/(count-1);v.append((s*x,front+(back-front)*u,zbase+side*(.009+t*math.sin(math.pi*u)**.8)))
 layer=len(rows)*count;f=[]
 for side in range(2):
  for j in range(len(rows)-1):
   for k in range(count-1):
    a=side*layer+j*count+k;f.append((a,a+1,a+1+count,a+count))
 for j in range(len(rows)-1):
  for k in [0,count-1]:
   a=j*count+k;b=(j+1)*count+k;f.append((a,b,b+layer,a+layer))
 for j in [0,len(rows)-1]:
  for k in range(count-1):
   a=j*count+k;f.append((a,a+1,a+1+layer,a+layer))
 mesh(name,v,f,skin,True)
 for u,label in [(.035,'Leading edge seal'),(.79,'Control surface hinge')]:
  pts=[(s*x,front+(back-front)*u,zbase+.009+t*math.sin(math.pi*u)**.8+.008) for x,front,back,t in rows]
  line(name+' '+label,pts,.009,edge if u<.1 else seam)
 # Broad flush RAM edge strips and individual trailing control surfaces.
 for ua,ub,label in [(0,.045,'Leading edge RAM strip'),(.955,1,'Trailing edge RAM strip')]:
  strip=[]
  for x,front,back,t in rows:
   for u in [ua,ub]:
    strip.append((s*x,front+(back-front)*u,zbase+.014+t*math.sin(math.pi*u)**.8))
  mesh(name+' '+label,strip,[(2*i,2*i+1,2*i+3,2*i+2) for i in range(len(rows)-1)],edge)
 for x,front,back,t in original[1:-1]:
  line(name+' Control surface break',[(s*x,front+(back-front)*u,zbase+.02+t*math.sin(math.pi*u)**.8) for u in [.79,.85,.92,.98]],.006,seam)
for s in [-1,1]:
 foil('Diamond main wing',wing,s,0);foil('Separate swept stabilator',tail,s,-.10)
 fin=[(s*1.36,-3.4,.58),(s*2.62,-5.02,3.24),(s*2.80,-6.22,3.24),(s*1.64,-7.6,.58)]
 # Tapered, closed airfoil fin: retain the planform and cant, soften slab edges.
 rootfront,tipfront,tipback,rootback=map(Vector,fin)
 fn=(tipfront-rootfront).cross(tipback-rootfront).normalized()
 fv=[];spansteps=17;chordsteps=25
 for side in [-1,1]:
  for j in range(spansteps):
   h=j/(spansteps-1);front=rootfront.lerp(tipfront,h);back=rootback.lerp(tipback,h)
   for k in range(chordsteps):
    u=k/(chordsteps-1)
    thickness=.006+(.052-.025*h)*math.sin(math.pi*u)**.8
    fv.append(tuple(front.lerp(back,u)+fn*(side*thickness)))
 layer=spansteps*chordsteps;ff=[]
 for side in range(2):
  for j in range(spansteps-1):
   for k in range(chordsteps-1):
    a=side*layer+j*chordsteps+k;ff.append((a,a+1,a+1+chordsteps,a+chordsteps))
 for j in range(spansteps-1):
  for k in [0,chordsteps-1]:
   a=j*chordsteps+k;b=a+chordsteps;ff.append((a,b,b+layer,a+layer))
 for j in [0,spansteps-1]:
  for k in range(chordsteps-1):
   a=j*chordsteps+k;ff.append((a,a+1,a+1+layer,a+layer))
 mesh('Outward canted vertical tail',fv,ff,skin,True)
 # Narrow leading-edge coating follows both sides of the actual airfoil.
 for side in [-1,1]:
  strip=[]
  for j in range(spansteps):
   h=j/(spansteps-1);front=rootfront.lerp(tipfront,h);back=rootback.lerp(tipback,h)
   for u in [0,.035]:
    d=.009+(.052-.025*h)*math.sin(math.pi*u)**.8
    strip.append(tuple(front.lerp(back,u)+fn*(side*d)))
  mesh('Vertical tail leading edge RAM',strip,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(spansteps-1)],edge)
 # Rudder outline and formation lights on both faces of the actual fin surface.
 for side in [-1,1]:
  def finpt(h,u):
   front=rootfront.lerp(tipfront,h);back=rootback.lerp(tipback,h)
   return tuple(front.lerp(back,u)+fn*(side*(.010+(.052-.025*h)*math.sin(math.pi*u)**.8)))
  line('Rudder hinge',[finpt(.06,.70),finpt(.62,.66),finpt(.62,.995)],.008,seam)
  line('Fin tip formation light',[finpt(.975,.20),finpt(.975,.46)],.016,formation)
 # Texture-free stencil geometry: fictional SpearOne code, not a unit replica.
 origin=Vector(fin[0]);u=Vector((0,s,0))
 normal=(Vector(fin[1])-origin).cross(Vector(fin[2])-origin).normalized()
 if normal.x*s<0:normal=-normal
 v=normal.cross(u).normalized()
 basis=Matrix((u,v,normal)).transposed().to_4x4()
 for label,z,size in [('SP',2.12,.46),('001',1.65,.25)]:
  y=-5.65
  x=origin.x-(normal.y*(y-origin.y)+normal.z*(z-origin.z))/normal.x
  cu=bpy.data.curves.new('SpearOne tail stencil','FONT');cu.body=label
  cu.align_x='CENTER';cu.size=size;cu.extrude=0;cu.resolution_u=2
  obj=bpy.data.objects.new('Tail identification '+label,cu)
  bpy.context.collection.objects.link(obj);cu.materials.append(marking)
  obj.matrix_world=basis.copy();obj.location=Vector((x,y,z))+normal*.059
 # Swept trapezoidal inlet with a thin bevel, not a round pipe outline.
 mouth=[(s*.95,4.42,.36),(s*1.98,3.70,.23),(s*1.81,3.63,-.72),(s*1.04,4.34,-.78)]
 center=sum((Vector(p) for p in mouth),Vector())/4
 inner=[tuple(center+(Vector(p)-center)*.91+Vector((0,-.025,0))) for p in mouth]
 mesh('Intake bevelled lip',mouth+inner,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)],edge)
 middle=[(x-s*.10,y-.65,z*.88) for x,y,z in inner]
 throat=[(x*.76,y-1.75,z*.68+.02) for x,y,z in inner]
 mesh('Inlet grey ramp walls',inner+middle,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)],ductmat)
 mesh('Deep inlet duct walls',middle+throat,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)],dark)
 mesh('Intake recessed shadow',throat,[(0,1,2,3)],dark)
 # Continuous inlet-to-belly loft. End sections match the original hull;
 # no rear cap, abrupt width switch or hanging rectangular intake box.
 loft=[];steps=25
 for j in range(steps):
  u=j/(steps-1);blend=u*u*(3-2*u)
  for start,(xf,zf) in zip(mouth[1:]+[(0,4.34,-.71)],[(1,.04),(.88,-.7),(.53,-.95),(0,-1)]):
   y=start[1]+(-1.2-start[1])*u
   for a,b in zip(stations,stations[1:]):
    if a[0]<=y<=b[0]:
     f=(y-a[0])/(b[0]-a[0]);w=a[1]+(b[1]-a[1])*f;top=a[2]+(b[2]-a[2])*f;bottom=a[3]+(b[3]-a[3])*f
     break
   targetx=s*xf*w;targetz=zf*top if zf>=0 else -zf*bottom
   loft.append((start[0]+(targetx-start[0])*blend,y,start[2]+(targetz-start[2])*blend))
 mesh('Blended inlet cheek and continuous belly',loft,[(j*4+k,j*4+k+1,(j+1)*4+k+1,(j+1)*4+k) for j in range(steps-1) for k in range(3)],skin,True)
 # Thin splitter separates the inlet from the forward fuselage.
 panel('Inlet boundary layer splitter',[(s*.94,4.44,.36),(s*1.00,4.40,-.77),(s*1.06,3.05,-.73),(s*.98,3.10,.36)],.018,edge)
 cx=s*.98
 for top in [-1,1]:
  panel('Nozzle outer shroud',[(cx-.78,-6.8,top*.43),(cx+.78,-6.8,top*.43),(cx+.70,-7.8,top*.32),(cx-.70,-7.8,top*.32)],.055,skin)
  # One broad vectoring flap per side with the F-22 sawtooth trailing edge.
  flap=[(cx-.70,-7.55,top*.34),(cx+.70,-7.55,top*.34),(cx+.66,-8.30,top*.235),(cx+.33,-8.02,top*.255),(cx,-8.30,top*.235),(cx-.33,-8.02,top*.255),(cx-.66,-8.30,top*.235)]
  panel('Vectoring nozzle flap',flap,.04,metal)
  for x in [cx-.44,cx+.44]:line('Nozzle flap actuator fairing',[(x,-7.58,top*.37),(x,-7.98,top*.31)],.018,metal)
  line('Nozzle flap hinge line',[(cx-.70,-7.57,top*.365),(cx+.70,-7.57,top*.365)],.007,seam)
 # Open rectangular outlet with a deep recessed throat and upper/lower liners.
 back=[(cx-.57,-7.28,-.32),(cx+.57,-7.28,-.32),(cx+.57,-7.28,.32),(cx-.57,-7.28,.32)]
 outlet=[(cx-.65,-8.0,-.24),(cx+.65,-8.0,-.24),(cx+.65,-8.0,.24),(cx-.65,-8.0,.24)]
 mesh('Deep rectangular exhaust throat',back,[(0,1,2,3)],dark)
 mesh('Nozzle interior liner',back+outlet,[(i,(i+1)%4,(i+1)%4+4,i+4) for i in range(4)],hotmetal)
 for top in [-1,1]:
  for k in range(9):
   x=cx-.60+k*.15
   line('Internal nozzle cooling channel',[(x,-7.35,top*.30),(x,-7.70,top*.27),(x,-7.96,top*.24)],.009,coolmetal)
  for k in range(4):
   x=cx-.67+k*.34
   panel('Overlapping nozzle hinge cover',[(x,-7.36,top*.39),(x+.25,-7.36,top*.39),(x+.23,-7.63,top*.35),(x+.02,-7.63,top*.35)],.015,coolmetal)
 for dx in [-.73,.73]:panel('Nozzle side wall',[(cx+dx,-7.3,-.34),(cx+dx,-7.3,.34),(cx+dx*.92,-8.28,.24),(cx+dx*.92,-8.28,-.24)],.025,metal)
 line('Wingtip navigation strip',[(s*6.73,-3.5,.06),(s*6.73,-3.75,.06)],.021,light if s<0 else greenlight)
panel('Tail sting',[(-.16,-7.1,.03),(.16,-7.1,.03),(.12,-8.9,-.04),(0,-9.04,-.04),(-.12,-8.9,-.04)],.09,skin)
# Forward teardrop canopy, a half-dome instead of the old complete ellipsoid.
canopy=[(3.84,.04,.04,.70),(4.18,.42,.33,.72),(4.75,.52,.58,.72),(5.35,.53,.64,.69),(5.95,.46,.57,.64),(6.48,.33,.38,.56),(6.95,.04,.02,.46)]
# Smooth longitudinal curvature while retaining the original canopy envelope.
keys=canopy;canopy=[]
for i in range(len(keys)-1):
 a=keys[max(0,i-1)];b=keys[i];c=keys[i+1];d=keys[min(len(keys)-1,i+2)]
 for k in range(6):
  t=k/6
  values=[b[0]+(c[0]-b[0])*t]
  for axis in range(1,4):
   value=.5*(2*b[axis]+(-a[axis]+c[axis])*t+(2*a[axis]-5*b[axis]+4*c[axis]-d[axis])*t*t+(-a[axis]+3*b[axis]-3*c[axis]+d[axis])*t*t*t)
   values.append(max(min(b[axis],c[axis]),min(max(b[axis],c[axis]),value)))
  canopy.append(tuple(values))
canopy.append(keys[-1])
v=[];n=25
for y,w,h,base in canopy:
 for j in range(n):
  a=math.pi*j/(n-1);v.append((w*math.cos(a),y,base+h*math.sin(a)))
f=[(i*n+j,i*n+j+1,(i+1)*n+j+1,(i+1)*n+j) for i in range(len(canopy)-1) for j in range(n-1)]
mesh('Forward gold teardrop canopy',v,f,glass,True)
for s in [-1,1]:line('Canopy sill',[(s*w,y,base+.005) for y,w,h,base in canopy],.025,edge)
y,w,h,base=keys[1]
line('Rear canopy bow',[(w*math.cos(j*math.pi/32),y,base+h*math.sin(j*math.pi/32)) for j in range(33)],.018,edge)
# Project fine sawtooth access-panel boundaries onto the actual skin.
tree=BVHTree.FromPolygons([v.co for v in body.data.vertices],[list(p.vertices) for p in body.data.polygons])
def surface_line(name,xy,material=seam,r=.006):
 pts=[]
 for a,b in zip(xy,xy[1:]):
  for k in range(6):
   x=a[0]+(b[0]-a[0])*k/5;y=a[1]+(b[1]-a[1])*k/5
   hit,normal,idx,dist=tree.ray_cast(Vector((x,y,5)),Vector((0,0,-1)))
   if hit:pts.append((x,y,hit.z+.009))
 if len(pts)>1:line(name,pts,r,material)
for s in [-1,1]:
 for y in [1.9,1.73,1.56,1.39]:surface_line('Flush cooling louvre',[(s*.55,y),(s*.96,y)],seam,.013)
 surface_line('Sawtooth engine access panel',[(s*.40,.6),(s*.60,.8),(s*.80,.6),(s*1,.8),(s*1.2,.6),(s*1.4,.8),(s*1.65,.55),(s*1.65,-4.5),(s*1.45,-4.7),(s*1.25,-4.5),(s*1.05,-4.7),(s*.85,-4.5),(s*.65,-4.7),(s*.40,-4.5),(s*.40,.6)],edge,.008)
 surface_line('Spine inspection hatch',[(s*.1,-1),(s*.26,-1.2),(s*.26,-2.3),(s*.1,-2.5)],seam,.007)
 surface_line('Shoulder service panel',[(s*.78,3.2),(s*1.32,2.8),(s*1.38,2.25),(s*.80,2.35),(s*.78,3.2)],edge,.007)
 surface_line('Forward avionics access',[(s*.25,7.30),(s*.46,7.05),(s*.51,6.70)],seam,.005)
 surface_line('Engine shoulder longitudinal joint',[(s*1.89,1.8),(s*1.95,-1.2),(s*1.92,-3.7),(s*1.70,-5.7)],seam,.006)
# The canopy aft fairing is integrated into the hull station heights above.
surface_line('Dorsal refuelling door',[(-.28,2.8),(-.38,2.3),(-.28,1.9),(.28,1.9),(.38,2.3),(.28,2.8),(-.28,2.8)],seam,.008)
# Low-visibility star-and-bars, projected to the left upper wing without textures.
def wing_height(x,y):
 for a,b in zip(wing,wing[1:]):
  if a[0]<=abs(x)<=b[0]:
   f=(abs(x)-a[0])/(b[0]-a[0]);front=a[1]+(b[1]-a[1])*f;back=a[2]+(b[2]-a[2])*f;t=a[3]+(b[3]-a[3])*f
   u=max(0,min(1,(y-front)/(back-front)))
   return .009+t*math.sin(math.pi*u)**.8+.014
 return .03
def wing_mark(name,xy,material):
 mesh(name,[(x,y,wing_height(x,y)) for x,y in xy],[tuple(range(len(xy)))],material)
cx,cy=-4.20,-3.65
circle=[(cx+.30*math.cos(i*math.tau/40),cy+.30*math.sin(i*math.tau/40)) for i in range(40)]
wing_mark('Low visibility roundel disc',circle,marking)
for side in [-1,1]:
 wing_mark('Low visibility insignia bar',[(cx+side*.23,cy-.10),(cx+side*.55,cy-.10),(cx+side*.55,cy+.10),(cx+side*.23,cy+.10)],marking)
star=[]
for i in range(10):
 a=math.pi/2+i*math.pi/5;r=.265 if i%2==0 else .11
 star.append((cx+r*math.cos(a),cy+r*math.sin(a)))
# Lift the star just above the disc to avoid depth fighting.
mesh('Low visibility insignia star',[(x,y,wing_height(x,y)+.003) for x,y in star],[tuple(range(10))],edge)
# Flush low-observable antenna panels, with no external stores or raised rivets.
for s in [-1,1]:
 # Flush cheek antenna on the faceted upper side wall, offset along the skin normal.
 def onside(y,t,off=.007):
  p=surf(y,s*(1-.11*t),.04+.40*t);return tuple(p+Vector((s*.92,0,.39)).normalized()*off)
 panel('Flush forward cheek antenna',[onside(6.05,.30),onside(5.62,.62),onside(5.02,.55),onside(5.30,.22)],.008,ram)
 # Nose-side formation light strip and air-data probes just above the chine.
 line('Nose formation light',[onside(7.15,.45,.012),onside(6.55,.52,.012)],.018,formation)
 for y in [7.95,7.55]:
  p=surf(y,s,.04);line('Air data probe',[tuple(p+Vector((-s*.01,0,.05))),tuple(p+Vector((s*.11,-.05,.06)))],.012,metal)
# Underside sawtooth doors projected onto the hull and the blended inlet belly.
under=[body]+[o for o in bpy.data.objects if o.name.startswith('Blended inlet cheek')]
uv=[];up=[]
for o in under:
 base=len(uv);uv.extend(v.co.copy() for v in o.data.vertices);up.extend([base+i for i in p.vertices] for p in o.data.polygons)
belly=BVHTree.FromPolygons(uv,up)
def belly_line(name,xy,material=seam,r=.007):
 pts=[]
 for a,b in zip(xy,xy[1:]):
  for k in range(2):
   x=a[0]+(b[0]-a[0])*k/2;y=a[1]+(b[1]-a[1])*k/2
   hit,normal,idx,dist=belly.ray_cast(Vector((x,y,-5)),Vector((0,0,1)))
   if hit:pts.append((x,y,hit.z-.009))
 hit,normal,idx,dist=belly.ray_cast(Vector((xy[-1][0],xy[-1][1],-5)),Vector((0,0,1)))
 if hit:pts.append((xy[-1][0],xy[-1][1],hit.z-.009))
 if len(pts)>1:line(name,pts,r,material)
def teeth(x0,x1,y,depth,n,sign):
 return [(x0+(x1-x0)*k/(2*n),y+(depth*sign if k%2 else 0)) for k in range(2*n+1)]
for s in [-1,1]:
 # Main weapons bay door: sawtooth fore and aft edges, centre split.
 belly_line('Main weapons bay door',[(s*.05,2.6)]+teeth(s*.05,s*.78,2.6,.22,2,1)[1:]+[(s*.80,-2.2)]+teeth(s*.80,s*.05,-2.2,.22,2,-1)[1:]+[(s*.05,2.6)])
 # Main landing gear door outboard of the bay, between inlet duct and wing.
 belly_line('Main gear door',[(s*.98,-.25)]+teeth(s*.98,s*1.62,-.25,.18,2,1)[1:]+[(s*1.62,-2.25)]+teeth(s*1.62,s*.98,-2.25,.18,2,-1)[1:]+[(s*.98,-.25)])
belly_line('Nose gear door',[(-.18,6.9)]+teeth(-.18,.18,6.9,.12,2,1)[1:]+[(.18,5.15)]+teeth(.18,-.18,5.15,.12,2,-1)[1:]+[(-.18,6.9)])
# Two-tone operational-style grey camouflage baked into vertex colors.
# Broad irregular lobes follow the shoulders and wings; no runtime textures.
skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=(1,1,1,1)
attr=skin.node_tree.nodes.new('ShaderNodeVertexColor');attr.layer_name='Paint'
skin.node_tree.links.new(attr.outputs['Color'],skin.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
for o in list(bpy.context.scene.objects):
 if o.type!='MESH' or o.data.materials[0]!=skin:continue
 colors=o.data.color_attributes.new(name='Paint',type='FLOAT_COLOR',domain='CORNER')
 for loop in o.data.loops:
  p=o.data.vertices[loop.vertex_index].co
  x=abs(p.x);y=p.y
  warp=noise.noise_vector(Vector((p.x*.55,y*.42,2.3))).x*.20
  patches=[(1.10,-1.5,1.05,3.2),(2.6,-2.7,1.45,1.65),(3.8,-3.1,1.3,1.15),
           (5.20,-3.5,.85,.67),(2.6,-7.65,1.05,.72),(.65,3.0,.60,1.0)]
  field=max(1-((x-cx)/rx)**2-((y-cy)/ry)**2 for cx,cy,rx,ry in patches)+warp
  blend=max(0,min(1,(field+.12)/.32));blend=blend*blend*(3-2*blend)
  # Keep the belly light; the fins carry a quieter grey variation.
  if p.z<-.18:blend*=max(0,1+(p.z+.18)*3)
  if 'vertical tail' in o.name:blend=.25+.30*max(0,min(1,(p.z-.6)/2.7))
  lightgrey=(.385,.405,.42);darkgrey=(.245,.267,.285)
  # Restrained coating variation, with a small warm shift near the exhausts.
  wear=1+noise.noise_vector(Vector((p.x*1.8,y*1.8,p.z*.8))).x*.024
  if 'wing' in o.name.lower():wear*=1+.012*math.sin(math.floor(x*1.1)*2.4)
  heat=max(0,min(1,(-y-5.8)/2.5))*max(0,1-abs(x-.98)/.8)
  lightgrey=tuple(c-heat*d for c,d in zip(lightgrey,(.012,.018,.025)))
  darkgrey=tuple(c-heat*d for c,d in zip(darkgrey,(.006,.010,.016)))
  colors.data[loop.index].color=(*( (a+(b-a)*blend)*wear for a,b in zip(lightgrey,darkgrey)),1)
bpy.ops.object.select_all(action='SELECT');bpy.context.view_layer.objects.active=next(iter(bpy.context.scene.objects));bpy.ops.object.convert(target='MESH')
for m in list(bpy.data.materials):
 objs=[o for o in bpy.context.scene.objects if o.type=='MESH' and len(o.data.materials)==1 and o.data.materials[0]==m]
 if not objs:continue
 bpy.ops.object.select_all(action='DESELECT')
 for o in objs:o.select_set(True)
 bpy.context.view_layer.objects.active=objs[0]
 if len(objs)>1:bpy.ops.object.join()
 objs[0].name='F22A / '+m.name
bpy.ops.object.select_all(action='SELECT')
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'kestrel.blend'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,'kestrel.glb'),export_format='GLB',use_selection=True,export_yup=True)
print('F-22A rebuilt from public top and side references')
