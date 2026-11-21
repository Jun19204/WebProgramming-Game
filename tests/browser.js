(function () {
  'use strict';
  const S = window.SkyStrike;
  // Fail any accidental runtime network access. All dependencies loaded locally above.
  window.fetch = () => {
    throw Error('Unexpected network request');
  };
  window.XMLHttpRequest = function () {
    throw Error('Unexpected XHR request');
  };
  async function run() {
    const list = document.getElementById('results'),
      status = document.getElementById('status');
    try {
      const results = await S.runChecks();
      try {
        const data = await S.loadModels(),
          m = new S.Mission(data.terrain),
          v = new S.View(document.getElementById('preview'), data.models);
        for (let i = 0; i < 60; i++) {
          if (i === 30) v.toggleCamera();
          m.step(1 / 60, {});
          v.draw(m, 'playing', 0.5, 1 / 60, i / 60);
        }
        let finite = true;
        v.scene.traverse((o) => {
          if (!o.matrixWorld.elements.every(Number.isFinite)) finite = false;
        });
        if (!finite) throw Error('Invalid render transform');
        if (
          v.cameraMode !== 'cockpit' ||
          !v.cockpit.root.visible ||
          v.entityMeshes.get(m.player).visible
        )
          throw Error('Invalid cockpit visibility');
        v.toggleCamera();
        v.draw(m, 'playing', 0.5, 1 / 60, 2);
        if (v.cockpit.root.visible || !v.entityMeshes.get(m.player).visible)
          throw Error('Chase restore failed');
        results.push({
          name: 'WebGL2 렌더링 · 60 프레임 · 양방향 시점 전환',
          pass: true,
          detail: '실제 브라우저 렌더러'
        });
        m.dispose();
      } catch (e) {
        results.push({ name: 'WebGL2 렌더링', pass: false, detail: e.message });
      }
      if (S.runAudioChecks) results.push(...(await S.runAudioChecks()));
      if (S.runPresentationChecks) results.push(...(await S.runPresentationChecks()));
      for (const r of results) {
        const li = document.createElement('li');
        li.className = r.pass ? 'pass' : 'fail';
        li.textContent = (r.pass ? 'PASS' : 'FAIL') + ' — ' + r.name + ' · ' + r.detail;
        list.appendChild(li);
      }
      status.textContent =
        location.protocol +
        ' / ' +
        results.filter((r) => r.pass).length +
        ' / ' +
        results.length +
        ' 통과. 네트워크 API 차단 상태.';
    } catch (e) {
      status.textContent = 'FAIL / ' + e.message;
    }
  }
  run();
})();
