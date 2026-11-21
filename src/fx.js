(function () {
  'use strict';
  const S = window.SkyStrike,
    T = window.THREE;
  // Fixed-size world-space particle pool. All shapes are shaded locally, without textures.
  S.CombatFX = class {
    constructor(scene) {
      this.capacity = 2400;
      this.cursor = 0;
      this.active = 0;
      this.seen = new WeakSet();
      this.trails = new Map();
      this.particles = new Array(this.capacity);
      this.seed = 7193;
      const n = this.capacity;
      this.position = new Float32Array(n * 3);
      this.color = new Float32Array(n * 3);
      this.size = new Float32Array(n);
      this.opacity = new Float32Array(n);
      this.kind = new Float32Array(n);
      this.spin = new Float32Array(n);
      this.geometry = new T.BufferGeometry();
      for (const [name, data, item] of [
        ['position', this.position, 3],
        ['tint', this.color, 3],
        ['radius', this.size, 1],
        ['alpha', this.opacity, 1],
        ['kind', this.kind, 1],
        ['spin', this.spin, 1]
      ])
        this.geometry.setAttribute(
          name,
          new T.BufferAttribute(data, item).setUsage(T.DynamicDrawUsage)
        );
      this.material = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { pixelScale: { value: 600 } },
        vertexShader: `
  attribute vec3 tint;attribute float radius,alpha,kind,spin;uniform float pixelScale;varying vec3 col;varying float a,k,r;
  void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(radius*pixelScale/max(1.,-p.z),1.,180.);col=tint;a=alpha;k=kind;r=spin;}`,
        fragmentShader: `varying vec3 col;varying float a,k,r;
  void main(){vec2 p=gl_PointCoord*2.-1.;float c=cos(r),s=sin(r);p=mat2(c,-s,s,c)*p;float d=length(p);float edge=1.-smoothstep(.25,1.,d);float lumps=.72+.16*sin(p.x*9.+r)*sin(p.y*8.-r)+.12*cos(p.x*16.+p.y*13.);float alpha=a*edge*lumps;if(k>1.5)alpha=a*pow(max(0.,1.-d),2.);if(alpha<.008)discard;gl_FragColor=vec4(col,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  }`
      });
      this.mesh = new T.Points(this.geometry, this.material);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 2;
      scene.add(this.mesh);
      this.fragments = [];
      this.fragmentMesh = new T.InstancedMesh(
        new T.TetrahedronGeometry(1),
        new T.MeshStandardMaterial({ color: 0x42494b, metalness: 0.55, roughness: 0.62 }),
        64
      );
      this.fragmentMesh.count = 0;
      this.fragmentMesh.frustumCulled = false;
      this.fragmentPose = new T.Object3D();
      scene.add(this.fragmentMesh);
    }
    random() {
      this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }
    put(pos, vel, size, life, kind) {
      const i = this.cursor;
      this.cursor = (i + 1) % this.capacity;
      this.particles[i] = {
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: vel.x,
        vy: vel.y,
        vz: vel.z,
        size,
        life,
        max: life,
        kind,
        spin: this.random() * 6.28
      };
    }
    burst(e) {
      const large = e.size >= 20,
        n = large ? 180 : e.size >= 10 ? 65 : 8;
      if (large)
        for (let i = 0; i < 12; i++) {
          if (this.fragments.length === 64) this.fragments.shift();
          this.fragments.push({
            pos: e.pos.clone(),
            vel: new T.Vector3(
              (this.random() - 0.5) * 90,
              this.random() * 65,
              (this.random() - 0.5) * 90
            ),
            life: 3,
            age: 0,
            spin: this.random() * 6,
            size: 0.6 + this.random() * 1.4
          });
        }
      for (let i = 0; i < n; i++) {
        const a = this.random() * 6.28,
          y = this.random() * 2 - 1,
          r = Math.sqrt(1 - y * y),
          speed = e.size * (0.3 + this.random() * 2.3),
          kind = i < n * 0.38 ? 0 : i < n * 0.78 ? 1 : 2;
        this.put(
          e.pos,
          { x: Math.cos(a) * r * speed, y: y * speed, z: Math.sin(a) * r * speed },
          kind === 2 ? 0.7 + this.random() * 1.7 : e.size * (0.24 + this.random() * 0.35),
          kind === 0
            ? 0.4 + this.random() * 0.75
            : kind === 1
              ? 2.3 + this.random() * 2.3
              : 1.1 + this.random() * 1.6,
          kind
        );
      }
    }
    update(m, dt, camera, height) {
      this.material.uniforms.pixelScale.value =
        height / (2 * Math.tan((camera.fov * Math.PI) / 360));
      if (dt > 0)
        for (const f of m.decoys || []) {
          this.put(f.pos, { x: 0, y: -4, z: 0 }, 7, 0.22, 2);
          this.put(f.pos, { x: 0, y: 2, z: 0 }, 3, 1.5, 3);
        }
      for (const e of m.effects)
        if (!this.seen.has(e)) {
          this.seen.add(e);
          this.burst(e);
        }
      const live = new Set();
      for (const s of m.projectiles) {
        if (s.kind !== 'missile') continue;
        live.add(s);
        const last = this.trails.get(s);
        if (dt > 0 && last) {
          const distance = last.distanceTo(s.pos),
            count = Math.min(18, Math.ceil(distance / 5));
          for (let j = 0; j < count; j++) {
            const p = last.clone().lerp(s.pos, (j + 1) / count);
            this.put(
              p,
              { x: (this.random() - 0.5) * 2, y: 1, z: (this.random() - 0.5) * 2 },
              2.8,
              1.7,
              3
            );
          }
        }
        this.trails.set(s, s.pos.clone());
      }
      for (const s of this.trails.keys()) if (!live.has(s)) this.trails.delete(s);
      this.active = 0;
      for (let i = 0; i < this.capacity; i++) {
        const p = this.particles[i];
        if (!p) {
          this.opacity[i] = 0;
          continue;
        }
        p.life -= dt;
        if (p.life <= 0) {
          this.particles[i] = null;
          this.opacity[i] = 0;
          continue;
        }
        this.active++;
        const age = 1 - p.life / p.max,
          drag = Math.exp(-dt * (p.kind === 2 ? 0.35 : 1.3));
        p.vx *= drag;
        p.vz *= drag;
        p.vy += dt * (p.kind === 2 ? -22 : p.kind === 1 ? 7 : 1);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        this.position.set([p.x, p.y, p.z], i * 3);
        this.size[i] = p.size * (p.kind === 2 ? 1 : 1 + age * 2.8);
        this.spin[i] = p.spin + age * 0.8;
        this.kind[i] = p.kind;
        if (p.kind === 0) {
          this.color.set(
            [2.8 * (1 - age) + 0.4, 1.6 * (1 - age) ** 3 + 0.08, 0.15 * (1 - age)],
            i * 3
          );
          this.opacity[i] = (1 - age) * 0.95;
        } else if (p.kind === 1) {
          const grey = 0.055 + age * 0.12;
          this.color.set([grey, grey * 0.96, grey * 0.9], i * 3);
          this.opacity[i] = Math.sin(Math.PI * Math.min(1, age * 1.1)) * 0.43;
        } else if (p.kind === 2) {
          this.color.set([3, 1.2, 0.2], i * 3);
          this.opacity[i] = 1 - age;
        } else {
          this.color.set([0.74, 0.79, 0.82], i * 3);
          this.opacity[i] = 0.38 * (1 - age);
        }
      }
      for (const a of Object.values(this.geometry.attributes)) a.needsUpdate = true;
      this.fragments = this.fragments.filter((f) => {
        f.life -= dt;
        return f.life > 0;
      });
      this.fragmentMesh.count = this.fragments.length;
      for (let i = 0; i < this.fragments.length; i++) {
        const f = this.fragments[i];
        f.age += dt;
        f.vel.y -= dt * 25;
        f.pos.addScaledVector(f.vel, dt);
        const o = this.fragmentPose;
        o.position.copy(f.pos);
        o.rotation.set(f.age * 3 + f.spin, f.age * 4, f.age * 2);
        o.scale.set(
          f.size * Math.min(1, f.life * 2),
          f.size * 0.22 * Math.min(1, f.life * 2),
          f.size * 0.7 * Math.min(1, f.life * 2)
        );
        o.updateMatrix();
        this.fragmentMesh.setMatrixAt(i, o.matrix);
      }
      this.fragmentMesh.instanceMatrix.needsUpdate = true;
    }
    clear() {
      this.particles.fill(null);
      this.opacity.fill(0);
      this.seen = new WeakSet();
      this.trails.clear();
      this.fragments = [];
      this.fragmentMesh.count = 0;
      this.active = 0;
      this.cursor = 0;
      this.geometry.attributes.alpha.needsUpdate = true;
    }
  };
})();
