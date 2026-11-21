(function () {
  'use strict';
  const S = window.SkyStrike;
  S.runAudioChecks = async function () {
    const results = [],
      saved = {
        volume: S.settings.volume,
        mute: S.settings.mute,
        musicVolume: S.settings.musicVolume
      };
    const check = async (name, fn) => {
      try {
        await fn();
        results.push({ name, pass: true, detail: '실제 OfflineAudioContext PCM 검사' });
      } catch (e) {
        results.push({ name, pass: false, detail: e.message });
      }
    };
    const assert = (ok, msg) => {
      if (!ok) throw Error(msg);
    };
    const render = async (speed, fx, transition, cockpit = false, seconds = 2) => {
      const ctx = new OfflineAudioContext(2, 48000 * seconds, 48000),
        a = S.createAudio();
      a.build(ctx);
      a.update(speed, true, cockpit);
      if (fx) {
        a.engineBus.gain.cancelScheduledValues(0);
        a.engineBus.gain.setValueAtTime(0, 0);
        fx(a);
      }
      let change;
      if (transition)
        change = ctx.suspend(0.65).then(() => {
          transition(a);
          return ctx.resume();
        });
      const out = await ctx.startRendering();
      if (change) await change;
      const d = out.getChannelData(0);
      let peak = 0;
      for (const x of d) {
        assert(Number.isFinite(x), '비정상 PCM');
        peak = Math.max(peak, Math.abs(x));
      }
      assert(peak < 0.99, '클리핑');
      return { d, peak, a };
    };
    const energy = (d, start = 0.3, end = 0.6, diff = false) => {
      let sum = 0,
        n = 0;
      for (let i = Math.floor(start * 48000); i < end * 48000; i++) {
        const x = diff ? d[i] - d[i - 1] : d[i];
        sum += x * x;
        n++;
      }
      return Math.sqrt(sum / n);
    };
    try {
      S.settings.volume = 0.7;
      S.settings.mute = false;
      await check('승리 관제 · 종료 상태에서 전체 재생·해제', async () => {
        let length = 0;
        const r = await render(
          180,
          (a) => {
            a.setRunning(false, true);
            length = a.radioBuffers.victory.duration;
            assert(length > 2 && length < 7, '승리 대사 길이');
            assert(a.speak('victory'), '종료 상태 재생 실패');
          },
          (a) => a.update(180, false, false, true),
          false,
          9
        );
        assert(
          energy(r.d, 0.3, 1.5) > 0.001 && energy(r.d, length - 1.5, length - 0.5) > 0.0001,
          '대사 중간 종료'
        );
        assert(!r.a.speech && r.a.voices.size === 0, '승리 음성 해제 실패');
      });
      await check('로비 음악 · 별도 볼륨·음소거·출격 정지·노드 재사용', async () => {
        S.settings.musicVolume = 0.5;
        S.settings.volume = 0;
        const on = await render(
          180,
          (a) => {
            a.updateMusic(true);
            const source = a.musicSource;
            a.updateMusic(true);
            assert(source === a.musicSource, '음악 중복 생성');
          },
          (a) => a.updateMusic(false)
        );
        assert(energy(on.d, 0.3, 0.6) > 0.001, '음악 무음/효과음 볼륨 종속');
        assert(energy(on.d, 1.8, 1.95) < 0.0001, '출격 시 음악 잔류');
        S.settings.musicVolume = 0;
        const off = await render(180, (a) => a.updateMusic(true));
        assert(off.peak < 0.00001, '음악 0 볼륨 실패');
        S.settings.musicVolume = 0.5;
        S.settings.mute = true;
        const muted = await render(180, (a) => a.updateMusic(true));
        assert(muted.peak < 0.00001, '음악 음소거 실패');
        S.settings.mute = false;
        S.settings.volume = 0.7;
      });
      await check('플레어 방출음 · 짧은 점화·종료', async () => {
        const r = await render(180, (a) => a.flare());
        assert(r.peak > 0.01, '플레어 무음');
        assert(energy(r.d, 0.3, 0.6) < 0.00001 && r.a.voices.size === 0, '방출음 종료 실패');
      });
      await check('제트 엔진 · 추력에 따른 고주파·음량 변화', async () => {
        const low = await render(110),
          high = await render(290);
        assert(low.peak > 0.01, '엔진 무음');
        assert(
          energy(high.d, 0.8, 1.4, true) > energy(low.d, 0.8, 1.4, true) * 1.2,
          '추력 반응 없음'
        );
      });
      await check('기관포 · 짧은 연속 펄스와 감쇠', async () => {
        const r = await render(180, (a) => a.gun());
        assert(r.peak > 0.01, '기관포 무음');
        assert(energy(r.d, 0.3, 0.6) < 0.00001, '기관포 종료 실패');
      });
      await check('미사일 · 점화와 로켓 꼬리음', async () => {
        const r = await render(180, (a) => a.missile());
        assert(r.peak > 0.01 && energy(r.d, 0.12, 0.3) > 0.0001, '로켓 꼬리음 없음');
        assert(energy(r.d, 1.6, 1.9) < 0.00001, '미사일 종료 실패');
      });
      await check('기체 폭발 · 승리 후 잔향·감쇠·노드 해제', async () => {
        const r = await render(
          180,
          (a) => a.blast(),
          (a) => a.setRunning(false, true)
        );
        assert(r.peak > 0.03, '폭발 무음');
        assert(energy(r.d, 0.08, 0.25) > energy(r.d, 0.8, 1.1) * 3, '폭발 감쇠 없음');
        assert(energy(r.d, 0.8, 1.1) > 0.0001, '승리 후 잔향 없음');
        assert(energy(r.d, 1.8, 1.95) < 0.00001 && r.a.voices.size === 0, '폭발 종료 실패');
      });
      await check('일시정지 · 엔진과 효과음 음소거', async () => {
        const r = await render(240, null, (a) => a.setRunning(false));
        assert(energy(r.d, 1.5, 1.9) < 0.00001, '정지 후 엔진 잔류');
      });
      await check('음소거 설정 · 실제 출력 무음', async () => {
        S.settings.mute = true;
        try {
          const r = await render(290, (a) => a.missile());
          assert(r.peak < 0.00001, '음소거 실패');
        } finally {
          S.settings.mute = false;
        }
      });
      await check('조종석 · 고주파 감쇠', async () => {
        const outer = await render(230),
          inner = await render(230, null, null, true);
        assert(
          energy(inner.d, 0.8, 1.4, true) < energy(outer.d, 0.8, 1.4, true) * 0.8,
          '조종석 필터 실패'
        );
      });
      await check('효과음 동시 발음 제한 · 종료 후 노드 해제', async () => {
        let count = 0;
        const r = await render(180, (a) => {
          for (let i = 0; i < 100; i++) a.gun();
          count = a.voices.size;
        });
        assert(count === 32, '동시 발음 상한 실패');
        assert(r.a.voices.size === 0, '완료 노드 잔류');
      });
      await check('내장 무전 3종 · PCM 디코드·재생·종료', async () => {
        for (const key of ['inbound', 'hit1', 'hit2']) {
          const r = await render(
            180,
            (a) => {
              assert(a.radioBuffers[key]?.duration > 1, '내장 대사 누락');
              assert(a.speak(key), '재생 실패');
            },
            null,
            false,
            5
          );
          assert(r.peak > 0.01 && energy(r.d, 0.15, 1.5) > 0.001, '대사 무음: ' + key);
          assert(!r.a.speech && r.a.voices.size === 0, '대사 노드 잔류');
        }
      });
      await check('피격 대사 · 반복 억제·일시정지 취소', async () => {
        const r = await render(
          180,
          (a) => {
            assert(a.pilotHit() === 'hit1', '첫 피격 대사');
            assert(a.pilotHit() === null, '연속 피격 중첩');
          },
          (a) => a.setRunning(false)
        );
        assert(energy(r.d, 1.5, 1.9) < 0.00001 && !r.a.speech, '정지 후 대사 잔류');
      });
      await check('미사일 비행음 · 거리 감쇠·소멸 후 정지', async () => {
        const missile = { kind: 'missile', pos: { x: 0, y: 0, z: 30 } },
          listener = { x: 0, y: 0, z: 0 },
          right = { x: 1, y: 0, z: 0 };
        const near = await render(
          180,
          (a) => a.updateMissiles([missile], listener, right),
          (a) => a.updateMissiles([], listener, right)
        );
        assert(energy(near.d, 0.2, 0.5) > 0.001, '비행음 없음');
        assert(energy(near.d, 1.5, 1.9) < 0.00001, '비행음 정지 실패');
        missile.pos.z = 2500;
        const far = await render(180, (a) => a.updateMissiles([missile], listener, right));
        assert(energy(far.d, 0.2, 0.5) < energy(near.d, 0.2, 0.5) * 0.2, '거리 감쇠 없음');
      });
    } finally {
      Object.assign(S.settings, saved);
    }
    return results;
  };
})();
