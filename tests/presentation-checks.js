(function () {
  'use strict';
  const S = window.SkyStrike,
    T = THREE;
  S.runPresentationChecks = async function () {
    const results = [],
      data = await S.loadModels(),
      m = new S.Mission(data.terrain),
      v = new S.View(document.createElement('canvas'), data.models),
      assert = (ok, msg) => {
        if (!ok) throw Error(msg);
      };
    const check = (name, fn) => {
      try {
        fn();
        results.push({ name, pass: true, detail: '실제 WebGL 및 렌더 상태 검사' });
      } catch (e) {
        results.push({ name, pass: false, detail: e.message });
      }
    };
    try {
      check('격추된 발사 기체 · 미사일 유지·계속 명중·수명 종료', () => {
        const a = new S.Mission(data.terrain);
        try {
          const owner = a.entities[1];
          a.spawn(owner, 'missile', a.player);
          const shot = a.projectiles[0];
          shot.pos.copy(a.player.body.translation()).add(new T.Vector3(0, 0, 600));
          shot.dir.set(0, 0, -1);
          a.damage(owner, 100);
          a.step(1 / 60, {});
          assert(owner.removed && a.projectiles.includes(shot), '격추 시 미사일 삭제');
          for (let i = 0; i < 180; i++) a.step(1 / 60, {});
          assert(
            a.player.hp === 75 && !a.projectiles.includes(shot),
            '제거된 발사자 미사일 명중 오류'
          );
          a.spawn(a.entities[2], 'missile');
          const expire = a.projectiles[a.projectiles.length - 1];
          expire.pos.set(9000, 2000, 0);
          expire.dir.set(0, 1, 0);
          expire.life = 0.05;
          a.damage(a.entities[2], 100);
          for (let i = 0; i < 5; i++) a.step(1 / 60, {});
          assert(!a.projectiles.includes(expire), '발사자 사망 후 수명 종료 실패');
        } finally {
          a.dispose();
        }
      });
      check('클리어 무전 비행 · 조향·추력·점수 및 시간 보존', () => {
        const a = new S.Mission(data.terrain);
        try {
          for (const e of a.entities.filter((e) => e.enemy)) a.damage(e, 100);
          const p = a.player,
            start = new T.Vector3().copy(p.body.translation()),
            time = a.time;
          for (let i = 0; i < 120; i++)
            a.stepDebrief(1 / 60, { KeyD: true, ArrowRight: true, ArrowUp: true, KeyW: true });
          assert(
            start.distanceTo(p.body.translation()) > 100 &&
              p.body.translation().y > start.y &&
              p.yaw < -0.5 &&
              p.speed > 250,
            '종료 비행 조작 실패'
          );
          assert(a.status === 'victory' && a.kills === 5 && a.time === time, '클리어 기록 변경');
          assert(p.prev.distanceTo(p.body.translation()) > 0, '보간 스냅샷 누락');
          assert(!a.fireMissile(), '종료 후 미사일 발사');
        } finally {
          a.dispose();
        }
      });
      check('생존 적 수 · 단계별 추격·기관포·미사일 공격 강화', () => {
        let previous = null;
        for (let kills = 0; kills <= 4; kills++) {
          const a = new S.Mission(data.terrain);
          try {
            for (let i = 1; i <= kills; i++) a.damage(a.entities[i], 100);
            const e = a.entities[5];
            a.time = 8;
            e.body.setTranslation({ x: 0, y: 760, z: 2600 }, true);
            e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
            e.fire = 0;
            e.missileTimer = 0;
            a.step(1 / 60, {});
            const current = {
              speed: e.speed,
              gun: e.fire,
              missile: e.missileTimer,
              spacing: a.enemyLaunchCooldown
            };
            assert(
              a.projectiles.some((s) => s.owner === e && s.kind === 'missile'),
              '단계별 발사 실패'
            );
            if (previous) {
              assert(
                current.speed > previous.speed &&
                  current.gun < previous.gun &&
                  current.missile < previous.missile &&
                  current.spacing < previous.spacing,
                '공격 강화 누락'
              );
            }
            previous = current;
            assert(a.projectiles.length <= S.config.maxProjectiles, '발사체 상한 초과');
          } finally {
            a.dispose();
          }
        }
      });
      check('급선회 회피 · 직진 명중·좌우 선회 무피해·플레어 미사용', () => {
        for (const direction of [0, -1, 1]) {
          const a = new S.Mission(data.terrain);
          try {
            a.spawn(a.entities[1], 'missile', a.player);
            const shot = a.projectiles[0];
            shot.pos.copy(a.player.body.translation()).add(new T.Vector3(0, 0, 600));
            shot.dir.set(0, 0, -1);
            const keys =
              direction < 0
                ? { KeyA: true, ArrowLeft: true }
                : direction > 0
                  ? { KeyD: true, ArrowRight: true }
                  : {};
            for (let i = 0; i < 240; i++) a.step(1 / 60, keys);
            assert(
              a.player.hp === (direction ? 100 : 75),
              '회피/명중 오류 ' + direction + ': ' + a.player.hp
            );
            assert(a.flares === 5 && a.decoys.length === 0, '플레어 의존');
            assert(!a.projectiles.includes(shot), '빗나간 미사일 잔류');
          } finally {
            a.dispose();
          }
        }
      });
      check('플레어 연사 · 5차례 10발·1회 소모·정지·소멸', () => {
        const a = new S.Mission(data.terrain);
        try {
          a.deployFlare();
          assert(a.decoys.length === 2 && a.flares === 4, '첫 방출 오류');
          for (let i = 0; i < 8; i++) a.step(1 / 60, {});
          assert(a.decoys.length === 2, '연사 간격 오류');
          a.status = 'paused';
          const timer = a.flareTimer;
          for (let i = 0; i < 60; i++) a.step(1 / 60, {});
          assert(a.decoys.length === 2 && a.flareTimer === timer, '정지 중 연사');
          a.status = 'playing';
          for (let i = 0; i < 31; i++) a.step(1 / 60, {});
          assert(
            a.decoys.length === 10 && a.flarePulses === 0 && a.flares === 4,
            '10발 연사 또는 소모 오류'
          );
          assert(new Set(a.decoys.map((f) => Math.round(f.pos.z))).size >= 5, '방출 위치 중첩');
          v.draw(a, 'playing', 1, 1 / 60, 0);
          assert(v.combatFX.active > 0, '플레어 시각 효과 누락');
          for (let i = 0; i < 190; i++) a.step(1 / 60, {});
          assert(a.decoys.length === 0, '플레어 소멸 실패');
          v.clear();
        } finally {
          a.dispose();
        }
      });
      check('적 미사일 · 실제 충돌당 25% 피해·4회 피격 패배', () => {
        const a = new S.Mission(data.terrain);
        try {
          const p = a.player,
            e = a.entities[1];
          for (let i = 1; i <= 4; i++) {
            a.spawn(e, 'missile', p);
            const s = a.projectiles[a.projectiles.length - 1];
            s.pos.copy(p.body.translation()).add(new T.Vector3(0, 0, 35));
            s.dir.set(0, 0, -1);
            a.shots(0.1);
            assert(p.hp === 100 - i * 25, '미사일 피해 오류 ' + p.hp);
          }
          assert(a.status === 'defeat', '4회 피격 후 생존');
        } finally {
          a.dispose();
        }
      });
      check('플레어 · 감지·유도 교란·5회 제한·정지 및 재시작', () => {
        const a = new S.Mission(data.terrain);
        try {
          const p = a.player,
            e = a.entities[1];
          a.spawn(e, 'missile', p);
          const s = a.projectiles[0];
          s.pos.copy(p.body.translation()).add(new T.Vector3(0, 0, 600));
          s.dir.set(0, 0, -1);
          assert(a.incoming().length === 1, '접근 감지 실패');
          assert(
            a.deployFlare() && a.flares === 4 && s.decoy && s.target === null,
            '유도 교란 실패'
          );
          assert(!a.deployFlare() && a.flares === 4, '쿨다운 실패');
          for (let i = 0; i < 180; i++) {
            for (const f of a.decoys) {
              f.pos.addScaledVector(f.vel, 1 / 60);
            }
            a.shots(1 / 60);
          }
          assert(p.hp === 100 && a.projectiles.length === 0, '교란 후 회피 실패');
          a.status = 'paused';
          a.flareCooldown = 0;
          assert(!a.deployFlare(), '정지 중 사용');
          a.status = 'playing';
          for (let i = 0; i < 4; i++) {
            a.flareCooldown = 0;
            assert(a.deployFlare(), '잔여 플레어 사용 실패');
          }
          a.flareCooldown = 0;
          assert(a.flares === 0 && !a.deployFlare(), '5회 제한 실패');
        } finally {
          a.dispose();
        }
        const b = new S.Mission(data.terrain);
        try {
          assert(b.flares === 5 && b.decoys.length === 0, '재시작 초기화 실패');
        } finally {
          b.dispose();
        }
      });
      check('적 AI · 조기 추격·유도미사일 실제 발사', () => {
        const a = new S.Mission(data.terrain);
        try {
          const e = a.entities[1];
          a.time = 8;
          e.body.setTranslation({ x: 0, y: 760, z: 2600 }, true);
          e.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
          e.missileTimer = 0;
          a.step(1 / 60, {});
          assert(e.speed >= 195, '추격 속도 미반영');
          assert(
            a.projectiles.some(
              (s) => s.owner === e && s.kind === 'missile' && s.target === a.player
            ),
            '적 미사일 미발사'
          );
        } finally {
          a.dispose();
        }
      });
      check('로비 회전 · 카메라 변화·물리 자세 보존', () => {
        v.draw(m, 'menu', 1, 1 / 60, 0);
        const before = JSON.stringify(m.player.body.rotation()),
          position = v.camera.position.clone();
        v.orbit(120, 40);
        v.draw(m, 'menu', 1, 1 / 60, 0);
        assert(position.distanceTo(v.camera.position) > 5, '회전 안됨');
        assert(JSON.stringify(m.player.body.rotation()) === before, '강체 자세 변경');
        v.resetOrbit();
        assert(v.menuOrbit.distance === 28, '초기화 실패');
      });
      check('폭발 · 화염·연기·파편·입자 상한·소멸', () => {
        m.damage(m.target, 100);
        v.draw(m, 'playing', 1, 1 / 60, 0);
        const fx = v.combatFX,
          kinds = new Set(fx.particles.filter(Boolean).map((p) => p.kind));
        assert(
          fx.active >= 180 && kinds.has(0) && kinds.has(1) && kinds.has(2),
          '폭발 레이어 누락'
        );
        for (let i = 0; i < 30; i++) fx.burst({ pos: new T.Vector3(), size: 28 });
        fx.update(m, 0, v.camera, 720);
        assert(fx.active <= 2400, '입자 상한 초과');
        fx.update(m, 6, v.camera, 720);
        assert(fx.active === 0, '입자 소멸 실패');
      });
      check('미사일 · 확대 모델·배기광·연기 궤적·재시작 정리', () => {
        m.spawn(m.player, 'missile', m.target);
        v.draw(m, 'playing', 1, 0.016, 1);
        const shot = m.projectiles[0];
        shot.pos.z -= 90;
        v.draw(m, 'playing', 1, 0.1, 1.1);
        const mesh = v.shots[0];
        assert(mesh.scale.x === 1.8 && mesh.children.some((o) => o.isSprite), '배기광 누락');
        assert(v.combatFX.active > 0 && v.combatFX.trails.size === 1, '궤적 누락');
        v.clear();
        assert(
          v.combatFX.active === 0 && v.combatFX.trails.size === 0 && v.shots.length === 0,
          '재시작 정리 실패'
        );
      });
      check('적기 피격 대사 연결 · 환경 피해 제외', () => {
        const original = S.audio.pilotHit;
        let calls = 0;
        try {
          S.audio.pilotHit = () => {
            calls++;
            return 'hit1';
          };
          m.damage(
            m.player,
            5,
            m.entities.find((e) => e.enemy && e.alive)
          );
          assert(calls === 1 && m.message === "Gah! I'm hit!", '피격 대사 미연결');
          m.damage(m.player, 5);
          assert(calls === 1, '환경 피해에 대사 발생');
        } finally {
          S.audio.pilotHit = original;
        }
      });
    } finally {
      m.dispose();
      v.renderer.dispose();
      v.environment.dispose();
      v.combatFX.geometry.dispose();
      v.combatFX.material.dispose();
      v.combatFX.fragmentMesh.geometry.dispose();
      v.combatFX.fragmentMesh.material.dispose();
      v.missileGlow.map.dispose();
      v.missileGlow.dispose();
      v.missileSkin.dispose();
    }
    return results;
  };
})();
