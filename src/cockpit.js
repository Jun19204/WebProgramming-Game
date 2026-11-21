(function () {
  'use strict';
  const S = window.SkyStrike,
    T = window.THREE;
  // A lightweight, camera-local 3D interior. Displays use live mission values.
  // This is a game cockpit, not a reproduction of classified aircraft systems.
  S.Cockpit = class {
    constructor(camera) {
      this.root = new T.Group();
      this.root.name = 'Cockpit interior';
      camera.add(this.root);
      const shell = new T.MeshStandardMaterial({
        color: 0x182025,
        roughness: 0.8,
        metalness: 0.25
      });
      const trim = new T.MeshStandardMaterial({
        color: 0x39454b,
        roughness: 0.48,
        metalness: 0.65
      });
      const black = new T.MeshStandardMaterial({ color: 0x080f13, roughness: 0.8 });
      const box = (x, y, z, w, h, d, material) => {
        const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), material);
        mesh.position.set(x, y, z);
        this.root.add(mesh);
        return mesh;
      };
      box(0, -0.73, -1.12, 1.88, 0.72, 0.2, shell);
      box(0, -0.4, -1.1, 1.94, 0.1, 0.31, black); // Glare shield.
      for (const side of [-1, 1]) {
        box(side * 0.94, -0.71, -0.72, 0.16, 0.66, 0.8, shell);
        const points = [
          new T.Vector3(side * 0.94, -0.65, -0.25),
          new T.Vector3(side * 0.89, -0.15, -0.83),
          new T.Vector3(side * 0.85, 0.45, -1.0),
          new T.Vector3(side * 0.64, 0.84, -0.75)
        ];
        const arch = new T.Mesh(
          new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, 0.026, 6, false),
          trim
        );
        this.root.add(arch);
        for (let i = 0; i < 6; i++)
          box(side * 0.75, -0.48 - i * 0.047, -0.997, 0.035, 0.018, 0.015, trim);
      }
      // A faint collimator pane leaves the flight path and target markings clear.
      const glass = new T.Mesh(
        new T.PlaneGeometry(0.55, 0.35),
        new T.MeshBasicMaterial({
          color: 0xb0ffd0,
          transparent: true,
          opacity: 0.035,
          side: T.DoubleSide,
          depthWrite: false
        })
      );
      glass.position.set(0, -0.2, -1.05);
      this.root.add(glass);
      for (const x of [-0.285, 0.285]) box(x, -0.37, -1.05, 0.014, 0.12, 0.025, trim);
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1024;
      this.canvas.height = 256;
      this.context = this.canvas.getContext('2d');
      this.texture = new T.CanvasTexture(this.canvas);
      this.texture.colorSpace = T.SRGBColorSpace;
      this.texture.minFilter = T.LinearFilter;
      this.texture.generateMipmaps = false;
      const displays = new T.Mesh(
        new T.PlaneGeometry(1.42, 0.3),
        new T.MeshBasicMaterial({ map: this.texture, toneMapped: false })
      );
      displays.position.set(0, -0.57, -1.008);
      this.root.add(displays);
      this.lastUpdate = -Infinity;
      this.root.visible = false;
    }
    update(mission, clock) {
      if (clock - this.lastUpdate < 0.1) return;
      this.lastUpdate = clock;
      const p = mission.player,
        position = p.removed ? p.prev : p.body.translation();
      const c = this.context;
      c.fillStyle = '#030b0e';
      c.fillRect(0, 0, 1024, 256);
      c.strokeStyle = '#35515a';
      c.lineWidth = 4;
      for (const x of [3, 346, 689]) c.strokeRect(x, 3, 332, 250);
      c.fillStyle = '#87c8bb';
      c.font = '19px monospace';
      c.textAlign = 'left';
      c.fillText('FLIGHT / NAV', 24, 34);
      c.fillText('TACTICAL / AIR', 365, 34);
      c.fillText('STORES / STATUS', 708, 34);
      c.fillStyle = '#b1efd0';
      c.font = '30px monospace';
      c.fillText('SPD ' + Math.round(p.speed * 3.6), 24, 88);
      c.fillText('ALT ' + Math.round(position.y), 24, 134);
      c.font = '21px monospace';
      c.fillText('ARMOR ' + p.hp + '%', 24, 184);
      c.fillText(
        'TIME ' +
          String(Math.floor(mission.time / 60)).padStart(2, '0') +
          ':' +
          String(Math.floor(mission.time % 60)).padStart(2, '0'),
        24,
        223
      );
      c.fillText('MSL  ' + String(mission.ammo).padStart(2, '0'), 710, 91);
      c.fillText('GUN  READY', 710, 131);
      c.fillText('KILL ' + mission.kills + ' / ' + S.config.enemies, 710, 179);
      c.fillStyle = mission.lock >= S.config.lockTime ? '#afffc2' : '#eece86';
      c.fillText(mission.lock >= S.config.lockTime ? 'LOCKED' : 'SEARCH', 710, 223);
      const cx = 512,
        cy = 150,
        r = 77;
      c.strokeStyle = '#37695c';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.moveTo(cx - r, cy);
      c.lineTo(cx + r, cy);
      c.moveTo(cx, cy - r);
      c.lineTo(cx, cy + r);
      c.stroke();
      c.fillStyle = '#a1e9ce';
      c.fillRect(cx - 3, cy - 3, 6, 6);
      for (const e of mission.entities) {
        if (!e.enemy || !e.alive) continue;
        const ep = e.body.translation(),
          dx = ep.x - position.x,
          dz = ep.z - position.z;
        const yaw = p.yaw;
        let x = ((Math.cos(yaw) * dx - Math.sin(yaw) * dz) / 5000) * r,
          y = ((Math.sin(yaw) * dx + Math.cos(yaw) * dz) / 5000) * r;
        const len = Math.hypot(x, y);
        if (len > r) {
          x *= r / len;
          y *= r / len;
        }
        c.fillStyle = e === mission.target ? '#ffb780' : '#a1e9ce';
        c.fillRect(cx + x - 3, cy + y - 3, 6, 6);
      }
      this.texture.needsUpdate = true;
    }
  };
})();
