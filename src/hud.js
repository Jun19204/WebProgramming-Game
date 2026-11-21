(function () {
  'use strict';
  const S = window.SkyStrike,
    T = window.THREE,
    $ = (id) => document.getElementById(id);
  const clock = (n) => {
    n = Math.max(0, Math.ceil(n));
    return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
  };
  S.clock = clock;
  S.HUD = class {
    constructor() {
      this.canvas = $('instruments');
      this.ctx = this.canvas.getContext('2d');
      this.resize();
    }
    resize() {
      this.canvas.width = innerWidth * devicePixelRatio;
      this.canvas.height = innerHeight * devicePixelRatio;
    }
    draw(m, view) {
      const p = m.player;
      if (!p.alive) return;
      document.getElementById('camera-mode').textContent =
        view.cameraMode === 'cockpit' ? 'C / COCKPIT' : 'C / CHASE';
      const pos = p.body.translation(),
        vel = p.body.linvel(),
        q = p.body.rotation(),
        f = new T.Vector3(0, 0, -1).applyQuaternion(q),
        heading = ((Math.atan2(f.x, -f.z) * 180) / Math.PI + 360) % 360;
      $('speed').textContent = Math.round(Math.hypot(vel.x, vel.y, vel.z) * 3.6);
      $('altitude').textContent = Math.round(pos.y);
      $('heading').textContent = 'HDG ' + String(Math.round(heading) % 360).padStart(3, '0');
      $('throttle').textContent =
        'THR ' +
        Math.round(
          ((p.speed - S.config.minSpeed) / (S.config.maxSpeed - S.config.minSpeed)) * 100
        ) +
        '%';
      $('timer').textContent = clock(S.config.missionTime - m.time);
      $('objective').textContent = 'HOSTILES ' + String(m.kills).padStart(2, '0') + ' / 05';
      $('health').textContent = 'ARMOR ' + p.hp + '%';
      $('health-bar').style.width = p.hp + '%';
      $('ammo').textContent = String(m.ammo).padStart(2, '0');
      $('lock-state').textContent =
        m.ammo === 0
          ? 'NO MISSILES'
          : m.cooldown > 0
            ? 'REARMING'
            : m.lock >= S.config.lockTime
              ? 'LOCKED / 발사 가능'
              : m.lock > 0
                ? 'ACQUIRING ' + Math.round((m.lock / S.config.lockTime) * 100) + '%'
                : 'SEARCHING';
      $('flare-count').textContent =
        'F / FLARE ' + m.flares + ' / 5' + (m.flareCooldown > 0 ? ' · 대기' : '');
      $('radio').textContent = m.time < m.messageUntil ? m.message : '';
      $('warning').textContent = m.incoming().length
        ? 'MISSILE INBOUND / ' + (m.flares > 0 ? 'F 플레어 회피' : '플레어 소진 · 회피 기동')
        : m.outside > 0
          ? 'RETURN TO AREA  ' + Math.ceil(S.config.returnTime - m.outside)
          : pos.y < 180
            ? 'PULL UP / 기수 올리기'
            : p.hp <= 25
              ? 'DAMAGE CRITICAL'
              : '';
      const c = this.ctx,
        w = innerWidth,
        h = innerHeight;
      c.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      c.clearRect(0, 0, w, h);
      c.strokeStyle = '#b3ffcd99';
      c.fillStyle = '#c6ffd8';
      c.lineWidth = 1;
      c.font = '11px monospace';
      c.textAlign = 'center';
      // Heading ruler.
      c.beginPath();
      for (let i = -6; i <= 6; i++) {
        const x = w / 2 + i * 34;
        const d = (Math.round(heading / 10) * 10 + i * 10 + 360) % 360;
        c.moveTo(x, 50);
        c.lineTo(x, i % 3 === 0 ? 62 : 57);
        if (i % 3 === 0) c.fillText(String(d).padStart(3, '0'), x, 40);
      }
      c.stroke();
      c.beginPath();
      c.moveTo(w / 2 - 5, 70);
      c.lineTo(w / 2, 64);
      c.lineTo(w / 2 + 5, 70);
      c.stroke();
      const cx = w / 2,
        cy = h * 0.48,
        r = Math.min(w, h) * 0.115;
      c.globalAlpha = 0.65;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 1;
      c.beginPath();
      c.moveTo(cx - 24, cy);
      c.lineTo(cx - 8, cy);
      c.lineTo(cx, cy + 5);
      c.lineTo(cx + 8, cy);
      c.lineTo(cx + 24, cy);
      c.moveTo(cx, cy - 14);
      c.lineTo(cx, cy - 6);
      c.stroke();
      c.fillRect(cx - 1, cy - 1, 2, 2);
      // Pitch ladder follows actual pitch, avoiding roll-induced text rotation.
      const pitch = (Math.asin(S.math.clamp(f.y, -1, 1)) * 180) / Math.PI;
      for (let a = -20; a <= 20; a += 10) {
        const y = cy + (pitch - a) * 6;
        if (y < h * 0.28 || y > h * 0.7) continue;
        c.globalAlpha = 0.45;
        c.beginPath();
        c.moveTo(cx - 65, y);
        c.lineTo(cx - 30, y);
        c.moveTo(cx + 30, y);
        c.lineTo(cx + 65, y);
        c.stroke();
        c.fillText(String(a), cx - 80, y + 4);
      }
      c.globalAlpha = 1;
      for (const e of m.entities) {
        if (!e.enemy || !e.alive) continue;
        const ep = e.body.translation(),
          point = view.project(ep),
          selected = e === m.target,
          locked = selected && m.lock >= S.config.lockTime;
        c.strokeStyle = locked ? '#b3ffcd' : '#ffb08a';
        c.fillStyle = c.strokeStyle;
        if (point.front && point.x > 28 && point.x < w - 28 && point.y > 80 && point.y < h - 50) {
          const x = point.x,
            y = point.y,
            s = selected ? 20 : 10;
          c.beginPath();
          if (selected) {
            c.rect(x - s, y - s, s * 2, s * 2);
          } else {
            c.moveTo(x, y - s);
            c.lineTo(x + s, y);
            c.lineTo(x, y + s);
            c.lineTo(x - s, y);
            c.closePath();
          }
          c.stroke();
          if (selected) {
            c.fillText(locked ? 'LOCKED' : e.name, x, y - s - 10);
            const d = new T.Vector3().copy(ep).distanceTo(pos);
            c.fillText((d / 1000).toFixed(2) + ' km', x, y + s + 16);
            if (m.lock > 0) {
              c.beginPath();
              c.arc(
                x,
                y,
                29,
                -Math.PI / 2,
                -Math.PI / 2 + (Math.PI * 2 * m.lock) / S.config.lockTime
              );
              c.stroke();
            }
          }
        } else if (selected) {
          const d = new T.Vector3().copy(ep).sub(pos),
            right = new T.Vector3(1, 0, 0).applyQuaternion(q),
            up = new T.Vector3(0, 1, 0).applyQuaternion(q);
          let dx = d.dot(right),
            dy = -d.dot(up);
          if (Math.abs(dx) + Math.abs(dy) < 0.01) dx = 1;
          const angle = Math.atan2(dy, dx),
            x = cx + Math.cos(angle) * Math.min(w * 0.36, 480),
            y = cy + Math.sin(angle) * h * 0.3;
          c.save();
          c.translate(x, y);
          c.rotate(angle);
          c.beginPath();
          c.moveTo(14, 0);
          c.lineTo(-6, -7);
          c.lineTo(-6, 7);
          c.closePath();
          c.stroke();
          c.restore();
          c.fillText('TARGET', x, y + 24);
        }
      }
      // Heading-up radar, 5 km range.
      const rx = w < 650 ? 82 : 113,
        ry = h - 128,
        rr = w < 650 ? 58 : 76;
      c.fillStyle = '#061e2677';
      c.strokeStyle = '#b3ffcd66';
      c.beginPath();
      c.arc(rx, ry, rr, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.beginPath();
      c.arc(rx, ry, rr / 2, 0, Math.PI * 2);
      c.moveTo(rx - rr, ry);
      c.lineTo(rx + rr, ry);
      c.moveTo(rx, ry - rr);
      c.lineTo(rx, ry + rr);
      c.stroke();
      c.fillStyle = '#b3ffcd';
      c.fillText('RADAR / 5 km', rx, ry + rr + 18);
      c.beginPath();
      c.moveTo(rx, ry - 5);
      c.lineTo(rx - 4, ry + 4);
      c.lineTo(rx + 4, ry + 4);
      c.closePath();
      c.fill();
      const yaw = Math.atan2(-f.x, -f.z);
      for (const e of m.entities) {
        if (!e.enemy || !e.alive) continue;
        const ep = e.body.translation(),
          dx = ep.x - pos.x,
          dz = ep.z - pos.z;
        let x = ((Math.cos(yaw) * dx - Math.sin(yaw) * dz) / 5000) * rr,
          y = ((Math.sin(yaw) * dx + Math.cos(yaw) * dz) / 5000) * rr;
        const len = Math.hypot(x, y);
        if (len > rr - 4) {
          x *= (rr - 4) / len;
          y *= (rr - 4) / len;
        }
        c.fillStyle = e === m.target ? '#ffb08a' : '#b3ffcd';
        c.fillRect(rx + x - 2, ry + y - 2, 4, 4);
        if (e === m.target) {
          c.strokeStyle = '#ffb08a';
          c.strokeRect(rx + x - 5, ry + y - 5, 10, 10);
        }
      }
    }
  };
})();
