(function () {
  'use strict';
  const S = window.SkyStrike,
    T = window.THREE,
    R = window.RAPIER,
    C = S.config;
  const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z),
    Q = () => new T.Quaternion();
  const RATE_GAIN = { x: 2000000, y: 2000000, z: 1000000 };
  const forward = (e) => V(0, 0, -1).applyQuaternion(e.body.rotation());
  S.islands = [
    [-2300, 0, -1800, 1],
    [2400, 0, -3700, 1.25],
    [-800, 0, -6400, 0.7],
    [4100, 0, 1400, 0.8],
    [-4500, 0, 2600, 1.2]
  ];
  S.Mission = class {
    constructor(terrain) {
      this.world = new R.World({ x: 0, y: -9.81, z: 0 });
      this.world.timestep = C.step;
      this.events = new R.EventQueue(true);
      this.entities = [];
      this.byCollider = new Map();
      this.projectiles = [];
      this.effects = [];
      this.time = 0;
      this.kills = 0;
      this.ammo = C.ammo;
      this.lock = 0;
      this.cooldown = 0;
      this.gunTimer = 0;
      this.outside = 0;
      this.status = 'playing';
      this.message = '관제 / 전방 적기 확인. 표적을 조준해 락온하십시오.';
      this.messageUntil = 8;
      this.shake = 0;
      this.world.createCollider(R.ColliderDesc.cuboid(25000, 10, 25000).setTranslation(0, -10, 0));
      for (const [x, y, z, scale] of S.islands) {
        for (const geo of terrain) {
          const verts = new Float32Array(geo.vertices);
          for (let i = 0; i < verts.length; i += 3) {
            verts[i] = verts[i] * scale + x;
            verts[i + 1] = verts[i + 1] * scale + y;
            verts[i + 2] = verts[i + 2] * scale + z;
          }
          this.world.createCollider(R.ColliderDesc.trimesh(verts, geo.indices));
        }
      }
      this.player = this.aircraft('RAPTOR', V(0, 760, 1600), false, 0);
      this.player.speed = C.speed;
      for (let i = 0; i < C.enemies; i++)
        this.aircraft(
          'BANDIT ' + String(i + 1).padStart(2, '0'),
          V((i % 2 ? 1 : -1) * Math.floor((i + 1) / 2) * 290, 760 + (i % 3) * 65, 250 - i * 320),
          true,
          i
        );
      this.target = this.entities[1];
      this.world.step(this.events);
      this.events.clear();
      this.flares = 5;
      this.decoys = [];
      this.flareCooldown = 0;
      this.flarePulses = 0;
      this.flareTimer = 0;
      this.warningTimer = 0;
      this.enemyLaunchCooldown = 0;
    }
    aircraft(name, p, enemy, index) {
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.y, p.z)
          .setCanSleep(false)
          .setCcdEnabled(true)
      );
      const collider = this.world.createCollider(
        R.ColliderDesc.cuboid(5, 1.7, 9)
          .setMass(8000)
          .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS),
        body
      );
      body.setLinvel({ x: 0, y: 0, z: -(enemy ? 145 : C.speed) }, true);
      const e = {
        name,
        body,
        collider,
        enemy,
        index,
        hp: 100,
        alive: true,
        yaw: 0,
        pitch: 0,
        bank: 0,
        speed: enemy ? 145 : C.speed,
        fire: 2 + index,
        ctrl: { pitch: 0, roll: 0, yaw: 0 },
        stick: { pitch: 0, roll: 0, yaw: 0 },
        prev: p.clone(),
        prevQ: Q()
      };
      this.entities.push(e);
      this.byCollider.set(collider.handle, e);
      return e;
    }
    notice(text, seconds = 4) {
      this.message = text;
      this.messageUntil = this.time + seconds;
    }
    cycle() {
      const alive = this.entities.filter((e) => e.enemy && e.alive);
      if (!alive.length) return;
      this.target = alive[(alive.indexOf(this.target) + 1) % alive.length];
      this.lock = 0;
    }
    incoming() {
      if (!this.player.alive) return [];
      return this.projectiles.filter(
        (s) =>
          s.kind === 'missile' &&
          s.owner.enemy &&
          s.target === this.player &&
          !s.decoy &&
          s.life > 0 &&
          s.pos.distanceTo(this.player.body.translation()) < 2500
      );
    }
    deployFlare() {
      if (
        this.status !== 'playing' ||
        !this.player.alive ||
        this.flares <= 0 ||
        this.flareCooldown > 0
      )
        return false;
      this.flares--;
      this.flareCooldown = 1.2;
      this.flarePulses = 4;
      this.flareTimer = 0.15;
      this.emitFlarePair();
      this.notice('플레어 연속 방출 / 유도 교란 · 잔여 ' + this.flares + '회', 2);
      return true;
    }
    emitFlarePair() {
      const p = this.player,
        side = V(1, 0, 0).applyQuaternion(p.body.rotation()),
        pulse = 4 - this.flarePulses;
      for (const sign of [-1, 1])
        this.decoys.push({
          pos: V()
            .copy(p.body.translation())
            .addScaledVector(side, sign * 8),
          vel: V()
            .copy(p.body.linvel())
            .multiplyScalar(0.28)
            .addScaledVector(side, sign * (48 + pulse * 9))
            .add(V(0, -8 - pulse * 5, 0)),
          life: 3
        });
      const decoy = this.decoys[this.decoys.length - 1];
      for (const s of this.incoming()) {
        s.decoy = decoy;
        s.target = null;
        s.life = Math.min(s.life, 3);
      }
      S.audio.flare();
    }
    damage(e, amount, source = null) {
      if (!e || !e.alive || this.status !== 'playing') return;
      e.hp = Math.max(0, e.hp - amount);
      if (e === this.player) {
        this.shake = 0.7;
        S.audio.tone(130, 0.2, 'square');
        if (source?.enemy && amount > 0 && e.hp > 0) {
          const line = S.audio.pilotHit();
          if (line) this.notice(line === 'hit1' ? "Gah! I'm hit!" : 'Damn it, taking fire!', 3);
        }
      }
      if (e.hp > 0) return;
      e.alive = false;
      const pos = V().copy(e.body.translation());
      this.explode(pos, 28);
      S.audio.blast();
      if (e.enemy) {
        this.kills++;
        this.notice('관제 / 적기 격추. ' + this.kills + ' / ' + C.enemies);
        if (this.target === e) {
          this.target = null;
          this.cycle();
        }
        if (this.kills === C.enemies) this.finish(true, '공역 확보 완료');
      } else this.finish(false, '기체 손실');
    }
    finish(win, reason) {
      if (this.status !== 'playing') return;
      this.status = win ? 'victory' : 'defeat';
      this.reason = reason;
    }
    explode(pos, size) {
      this.effects.push({ pos: pos.clone(), size, life: 1.1, max: 1.1 });
      if (this.effects.length > C.maxEffects) this.effects.shift();
    }
    // Arcade flight assist applies forces and torques only. Rapier integrates pose.
    fly(e, dt) {
      const b = e.body,
        q = Q().copy(b.rotation()),
        desired = e.rates
          ? q.clone()
          : Q().setFromEuler(new T.Euler(e.pitch, e.yaw, e.bank, 'YXZ'));
      const error = desired.multiply(q.clone().invert());
      if (error.w < 0) {
        error.x *= -1;
        error.y *= -1;
        error.z *= -1;
        error.w *= -1;
      }
      const av = b.angvel(),
        hardTurn =
          e === this.player && (e.rates ? e.hardTurn : Math.abs(e.bank) > 0.8) ? 3 : 1;
      let torque;
      if (e.rates) {
        // Manual flight: body-rate command, zero stick holds the current attitude.
        const w = V(av.x, av.y, av.z).applyQuaternion(q.clone().invert()),
          r = e.rates;
        torque = V(
          (r.x - w.x) * RATE_GAIN.x,
          (r.y - w.y) * RATE_GAIN.y * Math.sqrt(hardTurn),
          (r.z - w.z) * RATE_GAIN.z
        ).applyQuaternion(q);
      } else
        torque = V(
          error.x * 900000 - av.x * 350000,
          error.y * 900000 * hardTurn - av.y * 350000 * Math.sqrt(hardTurn),
          error.z * 340000 - av.z * 100000
        );
      b.resetTorques(true);
      b.addTorque(torque, true);
      // Render-only control-surface demand: pilot stick plus the remaining
      // attitude error in body axes (positive = nose up, roll right, nose right).
      const local = V(error.x, error.y, error.z).applyQuaternion(q.invert()),
        clamp = S.math.clamp,
        stick = e.stick;
      e.ctrl.pitch = clamp(stick.pitch * 0.75 + local.x * 2.5, -1, 1);
      e.ctrl.roll = clamp(stick.roll * 0.75 - local.z * 2.5, -1, 1);
      e.ctrl.yaw = clamp(stick.yaw * 0.75 - local.y * 4, -1, 1);
      const dir = forward(e),
        vel = b.linvel(),
        mass = b.mass(),
        desiredVel = dir.multiplyScalar(e.speed);
      b.resetForces(true);
      b.addForce(
        {
          x: (desiredVel.x - vel.x) * mass * 1.5,
          y: ((desiredVel.y - vel.y) * 1.5 + 9.81) * mass,
          z: (desiredVel.z - vel.z) * mass * 1.5
        },
        true
      );
    }
    lineClear(a, b, exclude) {
      const d = b.clone().sub(a),
        length = d.length();
      if (length < 0.01) return true;
      d.divideScalar(length);
      const hit = this.world.castRay(
        new R.Ray(a, d),
        length,
        true,
        undefined,
        undefined,
        undefined,
        exclude
      );
      return !hit || hit.timeOfImpact >= length - 12;
    }
    updateLock(dt) {
      const p = this.player,
        t = this.target;
      if (!t || !t.alive) {
        this.lock = 0;
        return;
      }
      const a = V().copy(p.body.translation()),
        b = V().copy(t.body.translation()),
        d = b.clone().sub(a),
        dist = d.length();
      const ok =
        dist < C.lockRange &&
        forward(p).dot(d.normalize()) > Math.cos(C.lockAngle) &&
        this.lineClear(a, b, p.body);
      const old = this.lock;
      this.lock = ok ? Math.min(C.lockTime, this.lock + dt) : 0;
      if (old < C.lockTime && this.lock >= C.lockTime) S.audio.tone(1100, 0.14, 'sine');
    }
    fireMissile() {
      if (
        this.status !== 'playing' ||
        this.lock < C.lockTime ||
        this.cooldown > 0 ||
        this.ammo <= 0 ||
        !this.target
      )
        return false;
      this.ammo--;
      this.cooldown = C.missileCooldown;
      this.spawn(this.player, 'missile', this.target);
      S.audio.missile();
      return true;
    }
    spawn(owner, kind, target = null) {
      if (this.projectiles.length >= C.maxProjectiles) return;
      const dir = forward(owner),
        pos = V().copy(owner.body.translation()).addScaledVector(dir, 16);
      pos.y -= 1;
      this.projectiles.push({
        owner,
        kind,
        target,
        pos,
        dir,
        life: kind === 'missile' ? C.missileLife : C.gunLife
      });
    }
    shots(dt) {
      const pressure = Math.min(1, this.kills / 4);
      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const s = this.projectiles[i];
        s.life -= dt;
        if (s.kind === 'missile' && (s.decoy || s.target?.alive)) {
          const tp = s.decoy ? s.decoy.pos.clone() : V().copy(s.target.body.translation()),
            tv = s.decoy ? V() : V().copy(s.target.body.linvel()),
            distance = tp.distanceTo(s.pos);
          if (s.decoy && distance < 24) {
            this.projectiles.splice(i, 1);
            continue;
          }
          tp.addScaledVector(
            tv,
            Math.min(
              1.4,
              (distance / C.missileSpeed) * (s.owner.enemy ? 0.22 + pressure * 0.08 : 0.6)
            )
          );
          const want = tp.sub(s.pos).normalize(),
            angle = s.dir.angleTo(want);
          if (s.owner.enemy && !s.decoy && distance < 450 && angle > Math.PI * 0.3) {
            s.target = null;
            s.life = Math.min(s.life, 1.8);
          }
          const turnRate =
            s.owner.enemy && !s.decoy
              ? s.target
                ? distance < 650
                  ? 0.105 + pressure * 0.025
                  : 0.72 + pressure * 0.16
                : 0
              : C.missileTurn;
          if (angle > 0.00001)
            s.dir
              .applyQuaternion(
                Q()
                  .setFromUnitVectors(s.dir, want)
                  .slerp(Q(), 1 - Math.min(1, (turnRate * dt) / angle))
              )
              .normalize();
        }
        const speed = s.kind === 'missile' ? C.missileSpeed : C.gunSpeed,
          delta = s.dir.clone().multiplyScalar(speed * dt);
        const hit =
          s.kind === 'missile'
            ? this.world.castShape(
                s.pos,
                { x: 0, y: 0, z: 0, w: 1 },
                delta,
                new R.Ball(3),
                0,
                1,
                true,
                undefined,
                undefined,
                undefined,
                s.owner.removed ? undefined : s.owner.body
              )
            : this.world.castRay(
                new R.Ray(s.pos, s.dir),
                speed * dt,
                true,
                undefined,
                undefined,
                undefined,
                s.owner.removed ? undefined : s.owner.body
              );
        if (hit) {
          const e = this.byCollider.get(hit.collider.handle);
          s.pos.addScaledVector(
            s.dir,
            s.kind === 'missile' ? hit.time_of_impact * speed * dt : hit.timeOfImpact
          );
          this.explode(s.pos, s.kind === 'missile' ? 12 : 2);
          if (e && e !== s.owner)
            this.damage(e, s.kind === 'missile' ? (s.owner.enemy ? 25 : 100) : 25, s.owner);
          s.life = 0;
        } else s.pos.add(delta);
        if (s.pos.y < 0) s.life = 0;
        if (s.life <= 0) this.projectiles.splice(i, 1);
      }
    }
    controlPlayer(dt, keys) {
      const p = this.player,
        turn = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0),
        yaw = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0),
        pitch = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
      p.speed = S.math.clamp(
        p.speed + ((keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0)) * 48 * dt,
        C.minSpeed,
        C.maxSpeed
      );
      p.stick.pitch = pitch;
      p.stick.roll = turn;
      p.stick.yaw = yaw;
      if (S.settings.assist === false) {
        const q = Q().copy(p.body.rotation()),
          att = new T.Euler().setFromQuaternion(q, 'YXZ');
        p.hardTurn = turn !== 0 && turn === yaw;
        // Body rates in rad/s (+x nose up, +y nose left, +z roll left) plus a small
        // lift-driven heading change while banked, like a coordinated turn.
        const lift = V(0, Math.sin(att.z) * Math.cos(att.x) * 0.3, 0).applyQuaternion(q.invert());
        p.rates = V(pitch * 0.85, -yaw * (p.hardTurn ? 0.6 : 0.35), -turn * 1.7).add(lift);
        p.pitch = att.x;
        p.yaw = att.y;
        p.bank = att.z;
        return;
      }
      p.rates = null;
      p.yaw = S.math.wrap(p.yaw - (turn * 0.43 + yaw * 0.65) * dt);
      p.bank = -turn * 0.72 - yaw * 0.18;
      p.pitch = pitch * 0.57;
    }
    stepDebrief(dt, keys) {
      if (this.status !== 'victory' || !this.player.alive) return;
      this.removeDead();
      this.controlPlayer(dt, keys);
      const p = this.player;
      p.prev.copy(p.body.translation());
      p.prevQ.copy(p.body.rotation());
      this.fly(p, dt);
      this.world.step(this.events);
      this.events.clear();
      this.shots(dt);
      this.shake = Math.max(0, this.shake - dt);
      for (const f of this.decoys) {
        f.life -= dt;
        f.vel.y -= 12 * dt;
        f.pos.addScaledVector(f.vel, dt);
      }
      this.decoys = this.decoys.filter((f) => f.life > 0);
      for (let i = this.effects.length - 1; i >= 0; i--) {
        this.effects[i].life -= dt;
        if (this.effects[i].life <= 0) this.effects.splice(i, 1);
      }
    }
    removeDead() {
      for (const e of this.entities) {
        if (!e.alive && !e.removed) {
          this.byCollider.delete(e.collider.handle);
          this.world.removeRigidBody(e.body);
          e.removed = true;
        }
      }
    }
    step(dt, keys) {
      if (this.status !== 'playing') return;
      this.time += dt;
      this.cooldown = Math.max(0, this.cooldown - dt);
      this.shake = Math.max(0, this.shake - dt);
      this.flareCooldown = Math.max(0, this.flareCooldown - dt);
      this.enemyLaunchCooldown = Math.max(0, this.enemyLaunchCooldown - dt);
      this.warningTimer -= dt;
      if (this.flarePulses > 0) {
        this.flareTimer -= dt;
        while (this.flareTimer <= 0 && this.flarePulses > 0) {
          this.flarePulses--;
          this.emitFlarePair();
          this.flareTimer += 0.15;
        }
      }
      for (const f of this.decoys) {
        f.life -= dt;
        f.vel.y -= 12 * dt;
        f.pos.addScaledVector(f.vel, dt);
      }
      this.decoys = this.decoys.filter((f) => f.life > 0);
      if (this.incoming().length && this.warningTimer <= 0) {
        S.audio.tone(880, 0.12, 'square');
        this.warningTimer = 0.7;
      }
      this.controlPlayer(dt, keys);
      const p = this.player;
      const pp = V().copy(p.body.translation()),
        pressure = Math.min(1, this.kills / 4);
      for (const e of this.entities) {
        if (!e.alive) continue;
        e.prev.copy(e.body.translation());
        e.prevQ.copy(e.body.rotation());
        if (e.enemy) {
          const ep = V().copy(e.body.translation());
          const to = pp.clone().sub(ep);
          const distance = to.length();
          if (this.time > 4) {
            let goal;
            if (distance < 260)
              goal = ep
                .clone()
                .add(forward(e).multiplyScalar(700))
                .add(V(Math.sin(this.time * 0.3 + e.index) * 300, 0, 0));
            else goal = pp.clone().addScaledVector(V().copy(p.body.linvel()), 0.6);
            if (ep.y < 380) goal.y = 650;
            if (ep.length() > 8500) goal = V(0, 850, 0);
            const d = goal.sub(ep),
              want = Math.atan2(-d.x, -d.z),
              error = S.math.wrap(want - e.yaw);
            e.yaw = S.math.wrap(e.yaw + S.math.clamp(error, -0.65, 0.65) * dt);
            e.bank = S.math.clamp(error, -0.8, 0.8);
            e.pitch = S.math.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.4, 0.45);
            e.speed = 210 + e.index * 7 + pressure * 12;
          } else {
            e.pitch = 0;
            e.bank = Math.sin(this.time * 0.35 + e.index) * 0.08;
          }
          e.fire -= dt * (1 + pressure * 0.25);
          const aim = forward(e).dot(to.normalize());
          if (
            this.time > 6 &&
            distance < 2200 &&
            aim > 0.975 &&
            e.fire <= 0 &&
            this.lineClear(ep, pp, e.body)
          ) {
            this.spawn(e, 'gun');
            e.fire = 0.175 - pressure * 0.045;
          }
          e.missileTimer = (e.missileTimer ?? 7 + e.index * 1.5) - dt * (1 + pressure * 0.35);
          if (
            this.time > 7 &&
            distance > 350 &&
            distance < 2600 &&
            aim > 0.8 &&
            e.missileTimer <= 0 &&
            this.enemyLaunchCooldown <= 0 &&
            this.lineClear(ep, pp, e.body) &&
            this.projectiles.filter((s) => s.kind === 'missile' && s.owner.enemy).length < 3
          ) {
            this.spawn(e, 'missile', p);
            e.missileTimer = 7.2 + e.index * 0.4 - pressure * 2.4;
            this.enemyLaunchCooldown = 1.9 - pressure * 0.6;
          }
        }
        this.fly(e, dt);
      }
      this.world.step(this.events);
      const crashed = new Set();
      this.events.drainCollisionEvents((a, b, started) => {
        if (!started) return;
        const ea = this.byCollider.get(a),
          eb = this.byCollider.get(b);
        if (ea) crashed.add(ea);
        if (eb) crashed.add(eb);
      });
      for (const e of crashed) this.damage(e, 100);
      if (this.status === 'playing') {
        this.updateLock(dt);
        this.gunTimer -= dt;
        if (keys.Space && this.gunTimer <= 0) {
          this.spawn(p, 'gun');
          this.gunTimer = C.gunInterval;
          S.audio.gun();
        }
        this.shots(dt);
        const pos = p.body.translation();
        const radius = Math.hypot(pos.x, pos.z);
        this.outside = radius > C.boundary ? this.outside + dt : 0;
        if (this.outside > C.returnTime) this.finish(false, '작전 구역 복귀 시간 초과');
        if (this.time > C.missionTime) this.finish(false, '작전 시간 초과');
      }
      // Remove dead bodies after all casts so an owner's exclusion is valid this step.
      this.removeDead();
      for (let i = this.effects.length - 1; i >= 0; i--) {
        this.effects[i].life -= dt;
        if (this.effects[i].life <= 0) this.effects.splice(i, 1);
      }
    }
    dispose() {
      this.events.free();
      this.world.free();
    }
    snapshot() {
      const p = this.player;
      return {
        status: this.status,
        time: this.time,
        kills: this.kills,
        ammo: this.ammo,
        flares: this.flares,
        incoming: this.incoming().length,
        hp: p.hp,
        lock: this.lock,
        target: this.target?.name,
        position: p.removed ? null : p.body.translation(),
        rotation: p.removed ? null : p.body.rotation(),
        speed: p.speed,
        projectiles: this.projectiles.length,
        bodies: this.world.bodies.len(),
        outside: this.outside,
        enemies: this.entities
          .filter((e) => e.enemy && e.alive)
          .map((e) => ({ name: e.name, position: e.body.translation(), hp: e.hp }))
      };
    }
  };
})();
