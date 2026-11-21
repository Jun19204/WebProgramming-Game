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
