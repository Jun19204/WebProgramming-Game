(function () {
  'use strict';
  const S = window.SkyStrike,
    T = window.THREE,
    C = S.config;
  S.runChecks = async function () {
    const results = [];
    const check = async (name, fn) => {
      try {
        const detail = await fn();
        results.push({ name, pass: true, detail: detail || 'OK' });
      } catch (e) {
        results.push({ name, pass: false, detail: e.message });
      }
    };
    const assert = (b, msg) => {
      if (!b) throw Error(msg);
    };
    const tick = (m, n, k = {}) => {
      for (let i = 0; i < n; i++) m.step(C.step, k);
    };
    await RAPIER.init();
    const data = await S.loadModels();
    await check('내장 WASM 초기화 · Blender GLB 3종 해석', () => {
      assert(Object.keys(data.models).length === 3, '모델 누락');
      assert(data.terrain.length > 0, '지형 누락');
      return 'Rapier ' + RAPIER.version() + '; THREE ' + THREE.REVISION + '; GLB 3종';
    });
    const run = (name, fn) =>
      check(name, () => {
        const m = new S.Mission(data.terrain);
        try {
          return fn(m);
        } finally {
          m.dispose();
        }
      });
    await run('동적 강체 전진 · 안정적인 수평 비행 · 추력 증가', (m) => {
      tick(m, 180);
      const p = m.player.body.translation();
      assert(p.z < 1100 && Math.abs(p.y - 760) < 2, '수평 비행 실패');
      assert(m.player.body.isDynamic(), '동적 강체 아님');
      tick(m, 120, { KeyW: true });
      assert(m.player.speed > 260, '추력 증가 실패');
    });
    await run('좌우 뱅크 선회 · 수평 복귀', (m) => {
      tick(m, 180, { KeyD: true });
      assert(m.player.body.translation().x > 50, '우측 이동 없음');
      tick(m, 480);
      const up = new T.Vector3(0, 1, 0).applyQuaternion(m.player.body.rotation());
      assert(up.y > 0.995, '수평 복귀 실패 ' + up.y);
    });
    await run('위 방향키 상승 · 아래 방향키 하강', (m) => {
      tick(m, 180, { ArrowUp: true });
      assert(m.player.body.translation().y > 830, '상승 실패');
      tick(m, 360, { ArrowDown: true });
      assert(m.player.body.translation().y < 700, '하강 실패');
    });
    await run('락온 시간 · 발사 제한 · 쿨다운 · 유도 명중', (m) => {
      assert(!m.fireMissile(), '락온 전 발사');
      tick(m, 60);
      assert(m.lock === C.lockTime, '락온 안됨');
      assert(m.fireMissile(), '발사 실패');
      assert(m.ammo === 19 && !m.fireMissile(), '탄약/쿨다운 실패');
      tick(m, 300);
      assert(m.kills === 1, '유도 명중 실패');
      assert(m.world.bodies.len() === 5, '격추된 강체 미제거');
    });
    await run('표적 전환 락온 초기화', (m) => {
      tick(m, 60);
      const target = m.target;
      m.cycle();
      assert(m.target !== target && m.lock === 0, '전환 실패');
    });
    await run('섬 지형의 락온 차폐', (m) => {
      const a = new T.Vector3(-3600, 100, -1800),
        b = new T.Vector3(-1000, 100, -1800);
      assert(!m.lineClear(a, b, m.player.body), '지형 관통');
    });
    await run('기관포 선분 판정 · 발사자 제외', (m) => {
      m.target.body.setTranslation({ x: 0, y: 760, z: 1250 }, true);
      tick(m, 200, { Space: true });
      assert(m.kills >= 1, '기관포 명중 실패');
      assert(m.player.hp === 100, '자가 피해');
      assert(m.projectiles.length <= C.maxProjectiles, '발사체 상한 위반');
    });
    await run('해수면 충돌 패배', (m) => {
      m.player.body.setTranslation({ x: 0, y: 5, z: 1600 }, true);
      m.player.body.setLinvel({ x: 0, y: -100, z: -100 }, true);
      tick(m, 180, { ArrowDown: true });
      assert(m.status === 'defeat', '충돌 후 살아 있음');
    });
    await run('Blender 섬 삼각형 충돌 패배', (m) => {
      m.player.body.setTranslation({ x: -2300, y: 510, z: -1800 }, true);
      m.player.body.setLinvel({ x: 0, y: -1000, z: 0 }, true);
      tick(m, 120, { ArrowDown: true });
      assert(m.status === 'defeat', '섬 충돌 실패');
    });
    await run('구역 복귀 타이머 초기화 · 재이탈 패배', (m) => {
      m.player.body.setTranslation({ x: 11000, y: 760, z: 0 }, true);
      tick(m, 60);
      assert(m.outside > 0.9, '구역 이탈 미감지');
      m.player.body.setTranslation({ x: 0, y: 760, z: 1600 }, true);
      tick(m, 1);
      assert(m.outside === 0, '복귀 초기화 실패');
      m.player.body.setTranslation({ x: 13000, y: 760, z: 0 }, true);
      tick(m, 1000);
      assert(m.status === 'defeat' && m.reason.includes('복귀'), '이탈 패배 실패');
    });
    await run('제한 시간 실패 · 종료 후 시간 정지', (m) => {
      m.time = C.missionTime - 0.01;
      tick(m, 2);
      assert(m.status === 'defeat', '제한 시간 누락');
      const time = m.time;
      tick(m, 10);
      assert(m.time === time, '종료 후 시간 증가');
    });
    await run('정상 조종 · 발사 명령만으로 전체 미션 승리', (m) => {
      let lastFire = -10;
      for (let i = 0; i < 18000 && m.status === 'playing'; i++) {
        const p = m.player,
          t = m.target,
          k = {};
        if (t?.alive) {
          const a = p.body.translation(),
            b = t.body.translation(),
            dx = b.x - a.x,
            dy = b.y - a.y,
            dz = b.z - a.z;
          const want = Math.atan2(-dx, -dz),
            err = S.math.wrap(want - p.yaw);
          if (err > 0.018) k.ArrowLeft = true;
          else if (err < -0.018) k.ArrowRight = true;
          if (err > 0.3) k.KeyA = true;
          else if (err < -0.3) k.KeyD = true;
          const pitch = Math.atan2(dy, Math.hypot(dx, dz));
          if (pitch > 0.04) k.ArrowUp = true;
          else if (pitch < -0.04) k.ArrowDown = true;
          if (m.lock === C.lockTime && m.time - lastFire > 1.2 && m.fireMissile())
            lastFire = m.time;
        }
        if (m.incoming().length) m.deployFlare();
        if (m.time > 20 && m.time % 30 < 8) {
          for (const key of Object.keys(k)) delete k[key];
          k.KeyW = true;
        } else if (p.speed > 231) k.KeyS = true;
        else if (p.speed < 229) k.KeyW = true;
        m.step(C.step, k);
      }
      assert(m.status === 'victory', '미션 미완료 ' + JSON.stringify(m.snapshot()));
      return (
        '격추 ' +
        m.kills +
        '대 / ' +
        m.time.toFixed(1) +
        '초 / 체력 ' +
        m.player.hp +
        ' / 미사일 ' +
        m.ammo
      );
    });
    await run('적 추격 · 공격으로 실제 피해', (m) => {
      tick(m, 15000);
      assert(m.player.hp < 100, '적 공격 피해 없음');
      return '체력 ' + m.player.hp + ' / ' + m.time.toFixed(1) + '초';
    });
    await run('중복 피해 이중 격추 방지', (m) => {
      const e = m.target;
      m.damage(e, 100);
      m.damage(e, 100);
      assert(m.kills === 1, '중복 집계');
    });
    await run('조종 입력 → 조종면 요구값 부호 · 물리 자세 불변', (m) => {
      const cases = [
        ['ArrowUp', 'pitch', 1],
        ['ArrowDown', 'pitch', -1],
        ['KeyD', 'roll', 1],
        ['KeyA', 'roll', -1],
        ['ArrowRight', 'yaw', 1],
        ['ArrowLeft', 'yaw', -1]
      ];
      const out = [];
      for (const [key, axis, sign] of cases) {
        const t = new S.Mission(data.terrain);
        try {
          for (let i = 0; i < 90; i++) {
            t.step(C.step, { [key]: true });
            if (i > 5)
              assert(t.player.ctrl[axis] * sign > 0.3, key + ' 유지 중 ' + axis + ' 반대/부족');
          }
          out.push(key + ' ' + t.player.ctrl[axis].toFixed(2));
        } finally {
          t.dispose();
        }
      }
      // Control demand is render-only: it must never feed the rigid body.
      const a = new S.Mission(data.terrain),
        b = new S.Mission(data.terrain);
      try {
        tick(a, 60, { KeyD: true });
        tick(b, 60, { KeyD: true });
        b.player.ctrl.roll = -1;
        tick(a, 1, { KeyD: true });
        tick(b, 1, { KeyD: true });
        const qa = a.player.body.rotation(),
          qb = b.player.body.rotation();
        assert(Math.abs(qa.x - qb.x) + Math.abs(qa.y - qb.y) + Math.abs(qa.z - qb.z) < 1e-9, '조종면 값이 물리에 영향');
      } finally {
        a.dispose();
        b.dispose();
      }
      return out.join(', ');
    });
    await check('조종면 8개 힌지 회전 방향', () => {
      const fake = {
        models: data.models,
        scene: new T.Scene(),
        entityMeshes: new Map(),
        plumeGeo: new T.BoxGeometry(),
        coreGeo: new T.PlaneGeometry(),
        plumeMaterial: S.View.prototype.plumeMaterial,
        hingeAxis: new T.Vector3(1, 0, 0),
        hingeTurn: new T.Quaternion()
      };
      const g = S.View.prototype.aircraft.call(fake, { enemy: false });
      const surf = g.userData.surfaces;
      assert(surf.length === 8, '조종면 노드 ' + surf.length + '개');
      g.updateMatrixWorld(true);
      // Trailing-edge vertex of each surface (largest aft +Z in aircraft frame).
      const te = surf.map((s) => {
        const pos = s.node.geometry ? s.node.geometry.attributes.position : s.node.children[0].geometry.attributes.position,
          holder = s.node.geometry ? s.node : s.node.children[0],
          v = new T.Vector3();
        let best = null;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const w = holder.localToWorld(v.clone());
          if (!best || w.z > best.w.z) best = { i, w };
        }
        return { s, holder, pos, i: best.i, w0: best.w };
      });
      const moved = (ctrl) => {
        for (let k = 0; k < 200; k++) S.View.prototype.moveSurfaces.call(fake, g, ctrl, 0.05);
        g.updateMatrixWorld(true);
        return te.map((t) => t.holder.localToWorld(new T.Vector3().fromBufferAttribute(t.pos, t.i)).sub(t.w0));
      };
      const find = (kind, right) => te.findIndex((t) => t.s.kind === kind && t.s.right === right);
      let d = moved({ pitch: 1, roll: 0, yaw: 0 });
      assert(d[find('stab', true)].y > 0.15 && d[find('stab', false)].y > 0.15, '기수 올림: 수평꼬리 뒷전 상승 아님');
      d = moved({ pitch: 0, roll: 1, yaw: 0 });
      for (const k of ['aileron', 'flaperon'])
        assert(d[find(k, true)].y > 0.1 && d[find(k, false)].y < -0.1, '우선회: ' + k + ' 방향 오류');
      d = moved({ pitch: 0, roll: 0, yaw: 1 });
      assert(d[find('rudder', true)].x > 0.15 && d[find('rudder', false)].x > 0.15, '기수 오른쪽: 방향타 뒷전 우측 아님');
      d = moved({ pitch: 0, roll: 0, yaw: 0 });
      assert(d.every((v) => v.length() < 1e-3), '중립 복귀 실패');
      // Exhaust plumes: two, longer and brighter at higher speed, render-only.
      const u = g.userData.plume;
      assert(u && u.nodes.length === 2, '배기 화염 ' + (u ? u.nodes.length : 0) + '개');
      for (let k = 0; k < 100; k++) S.View.prototype.updatePlume.call(fake, g, { speed: S.config.minSpeed }, false, 0.05, k);
      const slow = u.nodes[0].scale.z;
      for (let k = 0; k < 100; k++) S.View.prototype.updatePlume.call(fake, g, { speed: S.config.maxSpeed }, false, 0.05, k);
      assert(u.nodes[0].scale.z > slow + 6 && u.mat.uniforms.uPower.value > 0.95, '배기 화염 출력 반영 안 됨');
      u.mat.dispose();
      u.core.dispose();
      fake.plumeGeo.dispose();
      fake.coreGeo.dispose();
      return '수평꼬리 2 · 에일러론 2 · 플래퍼론 2 · 방향타 2 · 배기 화염 2';
    });
    await check('4회 재시작 자원 초기화', () => {
      for (let i = 0; i < 4; i++) {
        const m = new S.Mission(data.terrain);
        assert(m.ammo === 20 && m.kills === 0 && m.world.bodies.len() === 6, '초기화 실패');
        tick(m, 60);
        m.dispose();
      }
    });
    return results;
  };
})();
