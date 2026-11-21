(function () {
  'use strict';
  const S = window.SkyStrike,
    T = window.THREE;
  S.View = class {
    constructor(canvas, models) {
      this.models = models;
      this.renderer = new T.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.15;
      this.scene = new T.Scene();
      this.scene.background = new T.Color('#8baab5');
      this.scene.fog = new T.FogExp2('#8baab5', 0.000065);
      this.camera = new T.PerspectiveCamera(62, 1, 1, 45000);
      this.scene.add(this.camera);
      this.cameraMode = 'chase';
      this.cockpit = new S.Cockpit(this.camera);
      this.scene.add(new T.HemisphereLight(0xcceeff, 0x283e45, 2.8));
      const sun = new T.DirectionalLight(0xffd4a0, 3.6);
      sun.position.set(-6000, 8000, -9000);
      this.scene.add(sun);
      const sky = new T.Mesh(
        new T.SphereGeometry(28000, 32, 20),
        new T.ShaderMaterial({
          side: T.BackSide,
          depthWrite: false,
          uniforms: {},
          vertexShader:
            'varying vec3 p; void main(){p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
          fragmentShader:
            'varying vec3 p; void main(){float h=normalize(p).y; vec3 c=mix(vec3(.74,.78,.74),vec3(.12,.38,.56),smoothstep(-.04,.65,h));gl_FragColor=vec4(c,1.);}',
          fog: false
        })
      );
      this.sky = sky;
      this.scene.add(sky);
      this.water = new T.Mesh(
        new T.PlaneGeometry(70000, 70000),
        new T.ShaderMaterial({
          uniforms: { time: { value: 0 } },
          vertexShader:
            'varying vec3 p; void main(){p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
          fragmentShader:
            'varying vec3 p; uniform float time; void main(){float a=sin(p.x*.018+sin(p.y*.013)+time*.35);float b=sin(p.y*.04+p.x*.007-time*.6);float c=pow(max(0.,a*b),12.);float grid=sin(p.x*.0018)*sin(p.y*.0018);vec3 col=vec3(.025,.17,.22)+vec3(.025,.055,.06)*grid+vec3(.10,.16,.17)*c;float d=length(p.xy)/30000.;col=mix(col,vec3(.40,.57,.62),clamp(d,0.,.9));gl_FragColor=vec4(col,1.);}',
          side: T.DoubleSide
        })
      );
      this.water.rotation.x = -Math.PI / 2;
      this.water.position.y = -0.4;
      this.scene.add(this.water);
      for (const [x, y, z, s] of S.islands) {
        const island = models.island.clone(true);
        island.position.set(x, y, z);
        island.scale.setScalar(s);
        this.scene.add(island);
      }
      const cloudGeo = new T.SphereGeometry(1, 12, 8),
        cloudMat = new T.MeshStandardMaterial({
          color: 0xd8dfe2,
          roughness: 1,
          transparent: true,
          opacity: 0.82
        });
      const clouds = new T.InstancedMesh(cloudGeo, cloudMat, 130);
      const o = new T.Object3D();
      for (let i = 0; i < 130; i++) {
        const a = i * 2.399;
        const r = 6500 + (i % 13) * 850;
        o.position.set(Math.cos(a) * r, 1900 + (i % 9) * 110, Math.sin(a) * r);
        o.scale.set(250 + (i % 4) * 130, 80 + (i % 3) * 35, 170 + (i % 5) * 80);
        o.updateMatrix();
        clouds.setMatrixAt(i, o.matrix);
      }
      this.scene.add(clouds);
      this.entityMeshes = new Map();
      this.hingeAxis = new T.Vector3(1, 0, 0);
      this.hingeTurn = new T.Quaternion();
      this.shots = [];
      this.effects = [];
      this.effectGeo = new T.IcosahedronGeometry(1, 2);
      this.effectMat = new T.MeshBasicMaterial({
        color: 0xffa04b,
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      this.gunGeo = new T.BoxGeometry(0.45, 0.45, 15);
      this.gunMat = new T.MeshBasicMaterial({ color: 0xffd5a0 });
      this.flameGeo = new T.ConeGeometry(0.7, 5, 8);
      this.flameGeo.rotateX(Math.PI / 2);
      this.flameMat = new T.MeshBasicMaterial({
        color: 0x97beff,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: T.AdditiveBlending
      });
      this.readyCamera = false;
      this.renderer.toneMappingExposure = 0.95;
      this.scene.background.set('#9bb5c5');
      this.scene.fog.color.set('#9bb5c5');
      this.water.material.dispose();
      this.water.material = new T.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `
 varying vec3 world;
 void main(){vec4 w=modelMatrix*vec4(position,1.);world=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
        fragmentShader: `
 varying vec3 world;uniform float time;
 void main(){
 vec2 p=world.xz;float t=time;
 float a=dot(p,vec2(.052,.019))+t*.85;
 float b=dot(p,vec2(-.026,.071))-t*1.1;
 float c=dot(p,vec2(.13,.11))+t*1.6;
 vec3 n=normalize(vec3(-.11*cos(a)-.06*cos(c),1.,-.10*cos(b)-.05*cos(c)));
 vec3 v=normalize(cameraPosition-world);vec3 l=normalize(vec3(-6000.,8000.,-9000.));
 float fresnel=.025+.975*pow(1.-max(dot(n,v),0.),5.);
 float sparkle=pow(max(dot(n,normalize(v+l)),0.),180.);
 vec3 sea=vec3(.018,.075,.095);
 vec3 reflection=mix(vec3(.42,.55,.64),vec3(.13,.29,.43),max(reflect(-v,n).y,0.));
 vec3 col=mix(sea,reflection,fresnel)+vec3(1.,.86,.67)*sparkle*.85;
 float haze=1.-exp(-length(cameraPosition-world)*.000065);
 col=mix(col,vec3(.33,.44,.53),haze);
 gl_FragColor=vec4(col,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`,
        side: T.DoubleSide
      });
      // A small prefiltered sky environment gives metal and canopy natural reflections.
      const envScene = new T.Scene();
      const envSky = sky.clone();
      envSky.position.set(0, 0, 0);
      envScene.add(envSky);
      const pmrem = new T.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromScene(envScene, 0, 0.1, 60000);
      this.scene.environment = this.environment.texture;
      pmrem.dispose();
      this.combatFX = new S.CombatFX(this.scene);
      this.menuOrbit = { yaw: 2.5, pitch: 0.29, distance: 28 };
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 64;
      glowCanvas.height = 64;
      const gc = glowCanvas.getContext('2d'),
        gradient = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(255,255,235,1)');
      gradient.addColorStop(0.23, 'rgba(255,205,80,.95)');
      gradient.addColorStop(1, 'rgba(255,100,15,0)');
      gc.fillStyle = gradient;
      gc.fillRect(0, 0, 64, 64);
      this.missileGlow = new T.SpriteMaterial({
        map: new T.CanvasTexture(glowCanvas),
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false
      });
      this.missileSkin = new T.MeshStandardMaterial({
        color: 0xf5f4e6,
        emissive: 0x53504a,
        metalness: 0.2,
        roughness: 0.4
      });
      this.resize();
    }
    toggleCamera() {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
      this.readyCamera = false;
      return this.cameraMode;
    }
    orbit(dx, dy) {
      this.menuOrbit.yaw -= dx * 0.008;
      this.menuOrbit.pitch = S.math.clamp(this.menuOrbit.pitch + dy * 0.006, -1.15, 1.3);
      this.readyCamera = false;
    }
    resetOrbit() {
      this.menuOrbit = { yaw: 2.5, pitch: 0.29, distance: 28 };
      this.readyCamera = false;
    }
    resize() {
      const w = innerWidth,
        h = innerHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    clear() {
      for (const mesh of this.entityMeshes.values()) this.scene.remove(mesh);
      this.entityMeshes.clear();
      for (const m of this.shots) this.scene.remove(m);
      for (const m of this.effects) this.scene.remove(m);
      this.shots = [];
      this.effects = [];
      this.combatFX.clear();
      this.cockpit.lastUpdate = -Infinity;
      this.readyCamera = false;
    }
    aircraft(e) {
      const g = this.models.kestrel.clone(true);
      if (e.enemy) {
        g.traverse((o) => {
          if (o.isMesh && o.material.name === 'Position light') {
            o.material =
              this.enemyAccent ||
              (this.enemyAccent = new T.MeshStandardMaterial({
                color: 0xbd183e,
                metalness: 0.3,
                roughness: 0.5
              }));
          }
        });
      }
      // Hinged control surfaces: each node's local X axis is its hinge line.
      g.userData.surfaces = [];
      g.userData.servo = { pitch: 0, roll: 0, yaw: 0 };
      g.traverse((o) => {
        const match = /^CS_(\w+)_([LR])$/.exec(o.name);
        if (match)
          g.userData.surfaces.push({ node: o, kind: match[1], right: match[2] === 'R', base: o.quaternion.clone() });
      });
      for (const x of [-0.98, 0.98]) {
        const f = new T.Mesh(this.flameGeo, this.flameMat);
        f.position.set(x, 0, 9.15);
        f.scale.set(0.75, 0.36, 0.35);
        g.add(f);
      }
      this.scene.add(g);
      this.entityMeshes.set(e, g);
      return g;
    }
    // Lobby pre-flight control check: slow, overlapping pitch, roll and yaw sweeps.
    controlCheck(clock) {
      return {
        pitch: 0.7 * Math.sin(clock * 0.9),
        roll: 0.7 * Math.sin(clock * 0.9 + 2.1),
        yaw: 0.6 * Math.sin(clock * 0.6 + 4.2)
      };
    }
    moveSurfaces(mesh, ctrl, dt) {
      const servo = mesh.userData.servo;
      if (!servo || !ctrl) return;
      // Actuators have a finite rate, so surfaces ease toward the demand.
      const rate = 4 * Math.min(dt, 0.1);
      for (const k of ['pitch', 'roll', 'yaw'])
        servo[k] += S.math.clamp(ctrl[k] - servo[k], -rate, rate);
      const D = Math.PI / 180,
        { pitch, roll, yaw } = servo;
      for (const s of mesh.userData.surfaces) {
        const side = s.right ? -1 : 1;
        // Positive angle is trailing edge down (wing and tail) or right (rudders).
        const angle =
          s.kind === 'stab'
            ? (-pitch * 20 + side * roll * 8) * D
            : s.kind === 'aileron'
              ? side * roll * 22 * D
              : s.kind === 'flaperon'
                ? side * roll * 15 * D
                : yaw * 25 * D;
        s.node.quaternion.copy(s.base).multiply(this.hingeTurn.setFromAxisAngle(this.hingeAxis, angle));
      }
    }
    draw(m, state, alpha, dt, clock) {
      const menu = state === 'menu',
        p = m.player;
      const inside = !menu && this.cameraMode === 'cockpit';
      this.cockpit.root.visible = inside;
      for (const e of m.entities) {
        let mesh = this.entityMeshes.get(e);
        if (!e.alive) {
          if (mesh) mesh.visible = false;
          continue;
        }
        if (!mesh) mesh = this.aircraft(e);
        mesh.visible = true;
        mesh.position.lerpVectors(e.prev, new T.Vector3().copy(e.body.translation()), alpha);
        mesh.quaternion.copy(e.prevQ).slerp(new T.Quaternion().copy(e.body.rotation()), alpha);
        this.moveSurfaces(mesh, menu ? this.controlCheck(clock) : e.ctrl, dt);
      }
      const pm = this.entityMeshes.get(p);
      if (pm) {
        pm.visible = p.alive && !inside;
        const pos = pm.position.clone();
        let desired, look;
        if (menu) {
          const o = this.menuOrbit;
          desired = pos
            .clone()
            .add(
              new T.Vector3(
                Math.sin(o.yaw) * Math.cos(o.pitch),
                Math.sin(o.pitch),
                Math.cos(o.yaw) * Math.cos(o.pitch)
              ).multiplyScalar(o.distance * (innerWidth < 700 ? 1.35 : 1))
            );
          look = pos.clone().add(new T.Vector3(0, 0.2, 0));
        } else if (inside) {
          const q = pm.quaternion;
          desired = pos.clone().add(new T.Vector3(0, 1.16, -5.35).applyQuaternion(q));
          look = desired.clone().add(new T.Vector3(0, 0, -100).applyQuaternion(q));
        } else {
          const q = pm.quaternion;
          // Bring the chase camera closer for approximately 20% larger framing.
          desired = pos
            .clone()
            .add(new T.Vector3(0, 6.5, 29).multiplyScalar(1 / 1.2).applyQuaternion(q));
          look = pos.clone().add(new T.Vector3(0, 3, -100).applyQuaternion(q));
          if (S.settings.shake && m.shake > 0)
            desired.add(
              new T.Vector3(Math.sin(clock * 90), Math.cos(clock * 72), 0).multiplyScalar(
                m.shake * 1.3
              )
            );
        }
        if (inside || !this.readyCamera) {
          this.camera.position.copy(desired);
          this.readyCamera = true;
        } else this.camera.position.lerp(desired, 1 - Math.exp(-dt * (menu ? 2 : 9)));
        this.camera.up.set(0, 1, 0);
        if (inside) this.camera.up.applyQuaternion(pm.quaternion);
        this.camera.lookAt(look);
        this.camera.near = inside ? 0.05 : 1;
        this.camera.fov = inside ? 72 : menu ? 43 : 65 + (p.speed - S.config.minSpeed) * 0.045;
        // Enlarge chase framing by 20% without changing aircraft or physics scale.
        this.camera.zoom = inside || menu ? 1 : 1.2;
        if (menu)
          this.camera.setViewOffset(
            innerWidth,
            innerHeight,
            innerWidth * (innerWidth > 900 ? 0.12 : innerWidth > 620 ? 0.06 : 0),
            0,
            innerWidth,
            innerHeight
          );
        else this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
        this.sky.position.copy(pos);
      }
      for (let i = 0; i < Math.max(m.projectiles.length, this.shots.length); i++) {
        const s = m.projectiles[i];
        let mesh = this.shots[i];
        if (!s) {
          if (mesh) mesh.visible = false;
          continue;
        }
        if (mesh && mesh.userData.kind !== s.kind) {
          this.scene.remove(mesh);
          mesh = null;
        }
        if (!mesh) {
          mesh =
            s.kind === 'missile'
              ? this.models.needle.clone(true)
              : new T.Mesh(this.gunGeo, this.gunMat);
          if (s.kind === 'missile') {
            mesh.scale.setScalar(1.8);
            mesh.traverse((o) => {
              if (o.isMesh) o.material = this.missileSkin;
            });
            const glow = new T.Sprite(this.missileGlow);
            glow.position.z = 2.4;
            glow.scale.set(7, 7, 1);
            mesh.add(glow);
          }
          mesh.userData.kind = s.kind;
          this.shots[i] = mesh;
          this.scene.add(mesh);
        }
        mesh.visible = true;
        mesh.position.copy(s.pos);
        mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, -1), s.dir);
      }
      this.combatFX.update(m, state === 'paused' || menu ? 0 : dt, this.camera, innerHeight);
      if (inside) this.cockpit.update(m, clock);
      this.water.material.uniforms.time.value = clock;
      this.renderer.render(this.scene, this.camera);
    }
    project(pos) {
      const p = new T.Vector3().copy(pos),
        dir = p.clone().sub(this.camera.position);
      const front = dir.dot(this.camera.getWorldDirection(new T.Vector3())) > 0;
      p.project(this.camera);
      return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight, front };
    }
  };
  S.loadModels = async function () {
    const models = {},
      loader = new T.GLTFLoader();
    for (const name of ['kestrel', 'needle', 'island']) {
      const str = atob(S.modelData[name]),
        bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
      models[name] = (
        await new Promise((resolve, reject) => loader.parse(bytes.buffer, '', resolve, reject))
      ).scene;
    }
    const terrain = [];
    models.island.updateMatrixWorld(true);
    models.island.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld),
        vertices = new Float32Array(g.attributes.position.array);
      const indices = g.index
        ? new Uint32Array(g.index.array)
        : Uint32Array.from({ length: vertices.length / 3 }, (_, i) => i);
      terrain.push({ vertices, indices });
      g.dispose();
    });
    return { models, terrain };
  };
})();
