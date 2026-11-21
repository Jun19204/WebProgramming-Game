(function () {
  'use strict';
  const S = window.SkyStrike,
    $ = (id) => document.getElementById(id);
  let state = 'loading',
    mission = null,
    view = null,
    hud = null,
    terrain = null,
    accumulator = 0,
    last = 0,
    clock = 0;
  const keys = Object.create(null);
  let launchReady = false,
    debrief = null;

  function clearKeys() {
    for (const k of Object.keys(keys)) delete keys[k];
  }
  function change(next) {
    state = next;
    $('overlay').classList.toggle('victory-reveal', next === 'victory');
    clearKeys();
    accumulator = 0;
    S.audio.setRunning(next === 'playing', ['victory', 'debrief', 'debriefPaused'].includes(next));
    $('menu').hidden = next !== 'menu' && next !== 'loading';
    $('hud').hidden = !['playing', 'paused', 'debrief', 'debriefPaused'].includes(next);
    $('overlay').hidden = !['paused', 'debriefPaused', 'victory', 'defeat'].includes(next);
    if (next === 'playing') document.activeElement?.blur();
  }
  function fresh(play) {
    debrief = null;
    if (S.audio.ctx) S.audio.init();
    if (mission) mission.dispose();
    view.clear();
    mission = new S.Mission(terrain);
    change(play ? 'playing' : 'menu');
    if (play) {
      S.audio.init();
      S.audio.update(mission.player.speed, true);
      S.audio.beginMission();
      mission.notice('Five bandits inbound. Good hunting.', 5);
    }
  }
  function pause() {
    if (state !== 'playing' && state !== 'debrief') return;
    const ending = state === 'debrief';
    if (ending && S.audio.ctx) S.audio.ctx.suspend().catch(() => {});
    change(ending ? 'debriefPaused' : 'paused');
    $('result-eyebrow').textContent = 'FLIGHT HOLD';
    $('result-title').textContent = '일시정지';
    $('result-copy').textContent = '비행이 정지되었습니다. 준비되면 직접 재개하세요.';
    $('result-stats').textContent = '';
    $('resume').hidden = false;
    $('resume').focus();
  }
  function resume() {
    if (state === 'paused' || state === 'debriefPaused') {
      const ending = state === 'debriefPaused';
      change(ending ? 'debrief' : 'playing');
      S.audio.init();
    }
  }
  function beginDebrief() {
    change('debrief');
    debrief = { elapsed: 0, started: false, duration: S.audio.radioBuffers.victory?.duration || 5 };
    mission.notice('', 0);
    $('radio').textContent = '';
  }
  function updateDebrief(dt) {
    if (S.audio.ctx && S.audio.ctx.state !== 'running') return;
    debrief.elapsed += dt;
    if (!debrief.started && debrief.elapsed >= 0.6) {
      debrief.started = true;
      S.audio.speak('victory');
    }
    if (debrief.elapsed >= debrief.duration + 1.2 && !S.audio.speech) result();
  }
  function result() {
    change(mission.status);
    $('result-eyebrow').textContent =
      state === 'victory' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED';
    $('result-title').textContent = state === 'victory' ? '공역 확보 완료' : '작전 실패';
    $('result-copy').textContent = state === 'victory' ? '' : mission.reason;
    $('resume').hidden = true;
    $('result-stats').innerHTML =
      '<div>격추<strong>' +
      mission.kills +
      ' / 5</strong></div><div>작전 시간<strong>' +
      S.clock(mission.time) +
      '</strong></div><div>남은 체력<strong>' +
      mission.player.hp +
      '%</strong></div>';
    $('retry').focus();
  }
  const openDialog = (id) => {
    if (state === 'playing') pause();
    $(id).showModal();
  };
  const inspector = $('model-inspect');
  let drag = null;
  const endDrag = () => {
    if (drag && inspector.hasPointerCapture(drag.id)) inspector.releasePointerCapture(drag.id);
    drag = null;
    inspector.classList.remove('dragging');
  };
  inspector.addEventListener('pointerdown', (e) => {
    if (state !== 'menu' || e.button !== 0 || e.target.closest('button')) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    inspector.setPointerCapture(e.pointerId);
    inspector.classList.add('dragging');
    inspector.focus();
    e.preventDefault();
  });
  inspector.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (state !== 'menu') {
      endDrag();
      return;
    }
    view.orbit(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'])
    inspector.addEventListener(event, endDrag);
  addEventListener('blur', endDrag);
  inspector.addEventListener('keydown', (e) => {
    if (state !== 'menu') return;
    const delta = {
      ArrowLeft: [-25, 0],
      ArrowRight: [25, 0],
      ArrowUp: [0, -20],
      ArrowDown: [0, 20]
    }[e.code];
    if (delta) {
      e.preventDefault();
      view.orbit(...delta);
    }
  });
  $('model-reset').addEventListener('click', () => {
    if (state === 'menu') view.resetOrbit();
  });
  $('launch').addEventListener('click', () => {
    if (launchReady) fresh(true);
  });
  $('resume').addEventListener('click', resume);
  $('retry').addEventListener('click', () => fresh(true));
  $('home').addEventListener('click', () => fresh(false));
  for (const id of ['help-open', 'pause-help'])
    $(id).addEventListener('click', () => openDialog('help'));
  for (const id of ['settings-open', 'pause-settings'])
    $(id).addEventListener('click', () => openDialog('settings'));
  document
    .querySelectorAll('[data-close]')
    .forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  for (const name of ['volume', 'musicVolume', 'mute', 'shake', 'assist']) {
    const input = $(name);
    if (name === 'volume' || name === 'musicVolume') input.value = S.settings[name] * 100;
    else input.checked = S.settings[name];
    input.addEventListener('input', () => {
      S.settings[name] =
        name === 'volume' || name === 'musicVolume' ? Number(input.value) / 100 : input.checked;
      S.saveSettings();
      S.audio.updateMusic(state === 'menu');
    });
  }
  const gameKeys = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyS',
    'KeyA',
    'KeyD',
    'Space',
    'Tab',
    'KeyC',
    'KeyF',
    'ShiftLeft',
    'ShiftRight'
  ]);
  addEventListener('keydown', (e) => {
    if (document.querySelector('dialog[open]')) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (e.repeat) return;
      if (state === 'playing' || state === 'debrief') pause();
      else if (state === 'paused' || state === 'debriefPaused') resume();
      return;
    }
    if (state !== 'playing' && state !== 'debrief') return;
    if (gameKeys.has(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.repeat) return;
    if (e.code === 'Tab') mission.cycle();
    if (e.code === 'KeyC') view.toggleCamera();
    if (e.code === 'KeyF') mission.deployFlare();
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') mission.fireMissile();
  });
  addEventListener('keyup', (e) => {
    delete keys[e.code];
  });
  addEventListener('blur', () => {
    clearKeys();
    pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearKeys();
      pause();
    }
  });
  const unlockAudio = () => {
    if (state === 'paused' || state === 'debriefPaused') return;
    S.audio.init();
    S.audio.updateMusic(state === 'menu');
  };
  addEventListener('pointerdown', unlockAudio, { once: true });
  addEventListener('keydown', unlockAudio, { once: true });
  addEventListener('blur', () => S.audio.updateMusic(false));
  addEventListener('resize', () => {
    view?.resize();
    hud?.resize();
  });
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    clock += dt;
    if (!mission || !view) return;
    if (state === 'playing') {
      accumulator = Math.min(0.1, accumulator + dt);
      let steps = 0;
      while (
        accumulator >= S.config.step &&
        steps < S.config.maxSteps &&
        mission.status === 'playing'
      ) {
        mission.step(S.config.step, keys);
        accumulator -= S.config.step;
        steps++;
      }
      if (mission.status !== 'playing') {
        if (mission.status === 'victory') beginDebrief();
        else result();
      }
    }
    if (state === 'debrief') {
      accumulator = Math.min(0.1, accumulator + dt);
      let steps = 0;
      while (accumulator >= S.config.step && steps < S.config.maxSteps) {
        mission.stepDebrief(S.config.step, keys);
        accumulator -= S.config.step;
        steps++;
      }
      updateDebrief(dt);
    }
    const alpha =
      state === 'playing' || state === 'debrief' ? Math.min(1, accumulator / S.config.step) : 1;
    view.draw(mission, state === 'debriefPaused' ? 'paused' : state, alpha, dt, clock);
    if (['playing', 'paused', 'debrief', 'debriefPaused'].includes(state)) hud.draw(mission, view);
    S.audio.update(
      mission.player.speed,
      state === 'playing' || state === 'debrief',
      view.cameraMode === 'cockpit',
      ['victory', 'debrief', 'debriefPaused'].includes(state)
    );
    S.audio.updateMusic(state === 'menu' && !document.hidden && document.hasFocus());
    S.audio.updateMissiles(
      mission.projectiles,
      view.camera.position,
      new THREE.Vector3(1, 0, 0).applyQuaternion(view.camera.quaternion)
    );
  }
  // Read-only snapshots for diagnostics; simulation references remain private.
  S.inspect = () => ({
    state,
    debrief: debrief ? { ...debrief } : null,
    ready: launchReady,
    renderer: view?.renderer.info.render,
    particles: view?.combatFX.active,
    orbit: view ? { ...view.menuOrbit } : null,
    camera: view
      ? {
          mode: view.cameraMode,
          position: view.camera.position.toArray(),
          quaternion: view.camera.quaternion.toArray(),
          cockpitVisible: view.cockpit.root.visible,
          playerVisible: view.entityMeshes.get(mission?.player)?.visible
        }
      : null,
    mission: mission?.snapshot()
  });
  async function init() {
    try {
      if (!window.RAPIER || !window.THREE)
        throw Error('vendor 폴더를 찾을 수 없습니다. 압축을 완전히 해제하세요.');
      await RAPIER.init();
      $('boot-status').textContent = '물리 엔진 준비 완료 · 모델 해석 중';
      const data = await S.loadModels();
      terrain = data.terrain;
      view = new S.View($('world'), data.models);
      hud = new S.HUD();
      fresh(false);
      launchReady = true;
      $('launch').disabled = false;
      $('load-label').textContent = 'SPEAR-1 출격하기';
      $('boot-status').textContent = 'ALL SYSTEMS GREEN · 오프라인 실행 준비 완료';
      requestAnimationFrame(frame);
    } catch (error) {
      console.error(error);
      $('load-label').textContent = '초기화 실패';
      $('boot-status').textContent =
        '실행할 수 없습니다: ' +
        error.message +
        ' WebGL2 / WebAssembly 지원 브라우저와 폴더 구성을 확인하세요.';
    }
  }
  $('world').addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    pause();
    $('result-copy').textContent = '그래픽 연결이 끊어졌습니다. 브라우저를 새로고침하세요.';
  });
  init();
})();
