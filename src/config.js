(function () {
  'use strict';
  const S = window.SkyStrike;
  S.config = Object.freeze({
    step: 1 / 60,
    maxSteps: 6,
    enemies: 5,
    ammo: 20,
    hp: 100,
    speed: 180,
    minSpeed: 110,
    maxSpeed: 290,
    lockRange: 4000,
    lockAngle: (22 * Math.PI) / 180,
    lockTime: 0.65,
    missileSpeed: 560,
    missileTurn: 2.8,
    missileLife: 13,
    missileCooldown: 0.65,
    gunInterval: 0.075,
    gunSpeed: 1500,
    gunLife: 1.8,
    boundary: 10500,
    returnTime: 15,
    missionTime: 360,
    maxProjectiles: 160,
    maxEffects: 150
  });
  S.math = {
    wrap: (a) => Math.atan2(Math.sin(a), Math.cos(a)),
    clamp: (v, a, b) => Math.max(a, Math.min(b, v))
  };
  S.settings = {
    volume: 0.35,
    musicVolume: 0.35,
    shake: !matchMedia('(prefers-reduced-motion: reduce)').matches,
    mute: false
  };
  try {
    const v = JSON.parse(localStorage.getItem('sky-strike-settings') || 'null');
    if (v) {
      if (Number.isFinite(v.musicVolume))
        S.settings.musicVolume = S.math.clamp(v.musicVolume, 0, 1);
      if (Number.isFinite(v.volume)) S.settings.volume = S.math.clamp(v.volume, 0, 1);
      if (typeof v.shake === 'boolean') S.settings.shake = v.shake;
      if (typeof v.mute === 'boolean') S.settings.mute = v.mute;
    }
  } catch (_) {
    /* Storage may be disabled for file URLs. */
  }
  S.saveSettings = () => {
    try {
      localStorage.setItem('sky-strike-settings', JSON.stringify(S.settings));
    } catch (_) {}
  };
})();
