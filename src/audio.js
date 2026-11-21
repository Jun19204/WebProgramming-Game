(function () {
  'use strict';
  const S = window.SkyStrike;
  // All sound is synthesized locally; buffers are shared and one-shot voices are capped.
  S.createAudio = function () {
    return {
      ctx: null,
      voices: new Set(),
      maxVoices: 32,
      running: false,
      finishing: false,
      speech: null,
      nextHit: 0,
      hitIndex: 0,
      radioBuffers: {},
      init(context) {
        try {
          if (!this.ctx)
            this.build(context || new (window.AudioContext || window.webkitAudioContext)());
          if (this.ctx.resume) this.ctx.resume().catch(() => {});
        } catch (_) {
          /* Silent play remains available without Web Audio. */
        }
      },
      build(ctx) {
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.limiter = ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -10;
        this.limiter.knee.value = 12;
        this.limiter.ratio.value = 6;
        this.limiter.attack.value = 0.003;
        this.limiter.release.value = 0.18;
        this.ceiling = ctx.createWaveShaper();
        const curve = new Float32Array(2048);
        for (let i = 0; i < curve.length; i++)
          curve[i] = 0.95 * Math.tanh(1.5 * ((i / (curve.length - 1)) * 2 - 1));
        this.ceiling.curve = curve;
        this.ceiling.oversample = '2x';
        this.master.connect(this.limiter);
        this.limiter.connect(this.ceiling);
        this.ceiling.connect(ctx.destination);
        this.engineBus = ctx.createGain();
        this.engineBus.gain.value = 0;
        this.engineBus.connect(this.master);
        this.fxBus = ctx.createGain();
        this.fxBus.gain.value = 0;
        this.fxBus.connect(this.master);
        this.radioBus = ctx.createGain();
        this.radioBus.gain.value = 1;
        this.radioBus.connect(this.master);
        for (const [key, base64] of Object.entries(S.radioData || {})) {
          const raw = atob(base64),
            bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0)),
            v = new DataView(bytes.buffer);
          let rate = 22050,
            channels = 1,
            bits = 16;
          for (let p = 12; p + 8 <= bytes.length; ) {
            const tag = String.fromCharCode(...bytes.subarray(p, p + 4)),
              length = v.getUint32(p + 4, true),
              start = p + 8;
            if (start + length > bytes.length) break;
            if (tag === 'fmt ') {
              channels = v.getUint16(start + 2, true);
              rate = v.getUint32(start + 4, true);
              bits = v.getUint16(start + 14, true);
            }
            if (tag === 'data' && bits === 16) {
              const frames = Math.floor(length / (2 * channels)),
                b = ctx.createBuffer(channels, frames, rate);
              for (let c = 0; c < channels; c++) {
                const data = b.getChannelData(c);
                for (let i = 0; i < frames; i++)
                  data[i] = v.getInt16(start + (i * channels + c) * 2, true) / 32768;
              }
              this.radioBuffers[key] = b;
              break;
            }
            p = start + length + (length % 2);
          }
        }
        let seed = 82479;
        const rand = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 2147483648 - 1;
        };
        const make = (seconds, fn) => {
          const b = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
          for (let c = 0; c < 2; c++) {
            let low = 0;
            const d = b.getChannelData(c);
            for (let i = 0; i < d.length; i++) {
              const white = rand();
              low = 0.985 * low + 0.015 * white;
              d[i] = fn(i / ctx.sampleRate, white, low, c);
            }
          }
          return b;
        };
        this.noise = make(4, (t, w, l) => w * 0.7 + l * 2);
        this.flight = ctx.createBufferSource();
        this.flight.buffer = this.noise;
        this.flight.loop = true;
        this.flightFilter = ctx.createBiquadFilter();
        this.flightFilter.type = 'bandpass';
        this.flightFilter.frequency.value = 1400;
        this.flightFilter.Q.value = 0.45;
        this.flightGain = ctx.createGain();
        this.flightGain.gain.value = 0;
        this.flightPan = ctx.createStereoPanner();
        this.flight.connect(this.flightFilter);
        this.flightFilter.connect(this.flightGain);
        this.flightGain.connect(this.flightPan);
        this.flightPan.connect(this.fxBus);
        this.flight.start();
        // A sharp pressure crack, a falling low-frequency thump and irregular debris tail.
        // Bake the envelope into a shared stereo buffer so repeated kills allocate no PCM.
        this.blastBuffer = make(1.7, (t, w, l, c) => {
          const attack = Math.min(1, t / 0.0015),
            end = Math.min(1, (1.7 - t) / 0.12);
          const crack = w * 0.85 * Math.exp(-t * 65);
          const body = (l * 5 + w * 0.16) * Math.exp(-t * 5.2);
          const thump =
            Math.sin(2 * Math.PI * (34 * t + 70 * 0.075 * (1 - Math.exp(-t / 0.075)))) *
            0.48 *
            Math.exp(-t * 8);
          let debris = 0;
          for (const [delay, level] of [
            [0.12, 0.22],
            [0.23, 0.15],
            [0.39, 0.11],
            [0.62, 0.07]
          ]) {
            const d = t - delay - c * 0.009;
            if (d > 0) debris += (w * 0.65 + l * 2) * level * Math.exp(-d * 24);
          }
          const tail = (l * 3 + w * 0.06) * 0.24 * Math.exp(-t * 2.9);
          return Math.tanh((crack + body + thump + debris + tail) * 1.3) * attack * end;
        });
        // Each simulation gun event carries a short 95 Hz rotary-cannon pulse train.
        this.gunBuffer = make(0.085, (t, w) => {
          const phase = t % (0.01 + 0.0005 * Math.sin(t * 183));
          const impulse = Math.exp(-phase * 650);
          const fade = Math.min(1, t / 0.001) * Math.max(0, Math.min(1, (0.085 - t) / 0.012));
          return fade * (w * impulse * 0.72 + Math.sin(2 * Math.PI * 125 * t) * 0.2);
        });
        this.layers = [];
        for (const [type, hz, gain, rate] of [
          ['lowpass', 190, 0.75, 0.71],
          ['bandpass', 650, 0.22, 1],
          ['highpass', 1800, 0.065, 1.19]
        ]) {
          const src = ctx.createBufferSource(),
            filter = ctx.createBiquadFilter(),
            g = ctx.createGain();
          src.buffer = this.noise;
          src.loop = true;
          src.playbackRate.value = rate;
          filter.type = type;
          filter.frequency.value = hz;
          filter.Q.value = 0.55;
          g.gain.value = gain;
          src.connect(filter);
          filter.connect(g);
          g.connect(this.engineBus);
          src.start(0, rate % 1);
          this.layers.push({ src, filter, g });
        }
        this.turbines = [];
        for (const [hz, level] of [
          [680, 0.014],
          [1127, 0.008],
          [53, 0.023]
        ]) {
          const o = ctx.createOscillator(),
            g = ctx.createGain();
          o.type = 'sine';
          o.frequency.value = hz;
          g.gain.value = level;
          o.connect(g);
          g.connect(this.engineBus);
          o.start();
          this.turbines.push({ o, g, hz });
        }
      },
      setRunning(running, finish = false) {
        this.running = running;
        this.finishing = finish;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.fxBus.gain.setTargetAtTime(running || finish ? 1 : 0, t, 0.025);
        if (!running) {
          this.engineBus.gain.setTargetAtTime(0, t, 0.05);
          this.flightGain.gain.setTargetAtTime(0, t, 0.03);
          if (!finish) this.stopSpeech();
        }
      },
      update(speed, running, cockpit = false, finish = false) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime,
          u = Math.max(0, Math.min(1, (speed - 110) / 180));
        this.setRunning(running, finish);
        this.master.gain.setTargetAtTime(
          S.settings.mute ? 0 : Math.max(0, Math.min(1, S.settings.volume)),
          t,
          0.025
        );
        this.engineBus.gain.setTargetAtTime(
          running ? (cockpit ? 0.46 : 0.8) * (0.55 + u * 0.45) * (this.speech ? 0.42 : 1) : 0,
          t,
          0.18
        );
        this.layers[0].filter.frequency.setTargetAtTime(130 + u * 230, t, 0.5);
        this.layers[1].filter.frequency.setTargetAtTime(430 + u * 950, t, 0.6);
        this.layers[1].g.gain.setTargetAtTime(cockpit ? 0.12 : 0.22 + u * 0.12, t, 0.3);
        this.layers[2].g.gain.setTargetAtTime(cockpit ? 0.018 : 0.045 + u * 0.09, t, 0.3);
        for (const a of this.turbines)
          a.o.frequency.setTargetAtTime(a.hz * (0.75 + u * 0.85), t, 0.65);
      },
      voice(source, nodes, duration, level, attack = 0.002, hold = attack, bus = this.fxBus) {
        if (!this.ctx || this.voices.size >= this.maxVoices) {
          source?.disconnect();
          for (const n of nodes) n.disconnect();
          return;
        }
        const t = this.ctx.currentTime,
          g = this.ctx.createGain();
        let last = source;
        for (const n of nodes) {
          last.connect(n);
          last = n;
        }
        last.connect(g);
        g.connect(bus);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(level, t + attack);
        g.gain.setValueAtTime(level, t + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
        this.voices.add(source);
        source.onended = () => {
          source.disconnect();
          for (const n of nodes) n.disconnect();
          g.disconnect();
          this.voices.delete(source);
          if (this.speech === source) this.speech = null;
        };
        source.start(t);
        source.stop(t + duration + 0.01);
        return source;
      },
      noiseShot(
        duration,
        level,
        startHz,
        endHz,
        attack = 0.003,
        buffer = this.noise,
        hold = attack
      ) {
        if (!this.ctx || !this.running || this.voices.size >= this.maxVoices) return;
        const t = this.ctx.currentTime,
          src = this.ctx.createBufferSource(),
          f = this.ctx.createBiquadFilter();
        src.buffer = buffer;
        f.type = 'lowpass';
        f.Q.value = 0.7;
        f.frequency.setValueAtTime(startHz, t);
        f.frequency.exponentialRampToValueAtTime(endHz, t + duration);
        this.voice(src, [f], duration, level, attack, hold);
      },
      tone(freq, duration = 0.1, type = 'sine', volume = 0.13) {
        if (!this.ctx || !this.running || this.voices.size >= this.maxVoices) return;
        const t = this.ctx.currentTime,
          o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.4), t + duration);
        this.voice(o, [], duration, volume);
      },
      gun() {
        this.noiseShot(0.082, 0.63, 7000, 1800, 0.001, this.gunBuffer, 0.06);
      },
      missile() {
        this.noiseShot(0.11, 0.55, 1900, 450, 0.002);
        this.noiseShot(0.65, 0.68, 4200, 1400, 0.018, this.noise, 0.12);
      },
      flare() {
        this.noiseShot(0.12, 0.27, 4200, 900, 0.001, this.noise, 0.018);
      },
      buildMusic() {
        if (this.musicSource) return;
        const rate = 22050,
          beat = 60 / 88,
          duration = beat * 32,
          frames = Math.round(rate * duration),
          buffer = this.ctx.createBuffer(2, frames, rate),
          tau = Math.PI * 2;
        // Original eight-bar D-minor ambient loop: glassy pads, sub pulse, sparse drums.
        const chords = [
          [146.832, 174.614, 220, 329.628],
          [130.813, 174.614, 220, 293.665],
          [116.541, 146.832, 174.614, 261.626],
          [130.813, 164.814, 195.998, 293.665]
        ];
        for (let c = 0; c < 2; c++) {
          const out = buffer.getChannelData(c);
          let seed = 731 + c,
            low = 0;
          for (let i = 0; i < frames; i++) {
            const t = i / rate,
              b = t / beat,
              section = Math.floor(b / 8) % 4,
              phase = b % 8,
              mix = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, phase / 2)),
              previous = (section + 3) % 4;
            let pad = 0;
            for (let n = 0; n < 4; n++) {
              const hz = chords[section][n],
                old = chords[previous][n],
                detune = c ? 1.0012 : 0.9988;
              pad +=
                (Math.sin(tau * hz * detune * t) + 0.22 * Math.sin(tau * hz * 2 * t)) * mix +
                (Math.sin(tau * old * detune * t) + 0.22 * Math.sin(tau * old * 2 * t)) * (1 - mix);
            }
            const step = b % 1,
              root = [36.708, 43.654, 29.135, 32.703][section],
              pulse = Math.sin(tau * root * t) * Math.exp(-step * 5) * 0.13;
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            const noise = seed / 2147483648 - 1;
            low = 0.85 * low + 0.15 * noise;
            const kickTime = (b % 4) * beat,
              kick =
                Math.sin(tau * (43 * kickTime + 2.7 * (1 - Math.exp(-kickTime * 24)))) *
                Math.exp(-kickTime * 18) *
                0.13;
            const snareTime = ((b + 2) % 4) * beat,
              snare = (noise - low) * Math.exp(-snareTime * 35) * 0.035;
            const hatTime = (b % 0.5) * beat,
              hat = (noise - low) * Math.exp(-hatTime * 120) * 0.018;
            const seam = Math.min(1, t / 0.12, (duration - t) / 0.12);
            out[i] =
              (pad * 0.025 * (0.85 + 0.15 * Math.sin((tau * t) / duration)) +
                pulse +
                kick +
                snare +
                hat) *
              Math.max(0, seam);
          }
        }
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.limiter);
        this.musicSource = this.ctx.createBufferSource();
        this.musicSource.buffer = buffer;
        this.musicSource.loop = true;
        this.musicSource.connect(this.musicGain);
        this.musicSource.start();
      },
      updateMusic(menu) {
        if (!this.ctx) return;
        if (menu && !this.musicSource) this.buildMusic();
        if (this.musicGain)
          this.musicGain.gain.setTargetAtTime(
            menu && !S.settings.mute ? S.settings.musicVolume : 0,
            this.ctx.currentTime,
            0.12
          );
      },
      updateMissiles(projectiles, listener, right) {
        if (!this.ctx) return;
        let nearest = null,
          distance = Infinity;
        for (const p of projectiles) {
          if (p.kind !== 'missile') continue;
          const d = Math.hypot(p.pos.x - listener.x, p.pos.y - listener.y, p.pos.z - listener.z);
          if (d < distance) {
            nearest = p;
            distance = d;
          }
        }
        const t = this.ctx.currentTime,
          level = this.running && nearest ? 0.65 / (1 + (distance / 240) ** 1.5) : 0;
        this.flightGain.gain.setTargetAtTime(level, t, 0.07);
        if (nearest) {
          this.flightFilter.frequency.setTargetAtTime(650 + 2400 / (1 + distance / 350), t, 0.1);
          this.flight.playbackRate.setTargetAtTime(0.72 + 0.38 / (1 + distance / 300), t, 0.1);
          const x = nearest.pos.x - listener.x,
            y = nearest.pos.y - listener.y,
            z = nearest.pos.z - listener.z;
          this.flightPan.pan.setTargetAtTime(
            Math.max(
              -0.9,
              Math.min(0.9, (x * right.x + y * right.y + z * right.z) / Math.max(distance, 1))
            ),
            t,
            0.08
          );
        }
      },
      stopSpeech() {
        if (this.speech) {
          try {
            this.speech.stop();
          } catch (_) {}
          this.speech = null;
        }
      },
      speak(key) {
        if (
          !this.ctx ||
          (!this.running && !(this.finishing && key === 'victory')) ||
          !this.radioBuffers[key]
        )
          return false;
        this.stopSpeech();
        const src = this.ctx.createBufferSource(),
          hp = this.ctx.createBiquadFilter(),
          lp = this.ctx.createBiquadFilter(),
          presence = this.ctx.createBiquadFilter(),
          drive = this.ctx.createWaveShaper(),
          compress = this.ctx.createDynamicsCompressor();
        src.buffer = this.radioBuffers[key];
        src.playbackRate.value = 1;
        hp.type = 'highpass';
        hp.frequency.value = key === 'inbound' || key === 'victory' ? 360 : 440;
        lp.type = 'lowpass';
        lp.frequency.value = key === 'inbound' || key === 'victory' ? 3100 : 2850;
        presence.type = 'peaking';
        presence.frequency.value = 1750;
        presence.Q.value = 0.8;
        presence.gain.value = key === 'inbound' || key === 'victory' ? 2 : 4;
        const curve = new Float32Array(1024),
          amount = key === 'inbound' || key === 'victory' ? 1.7 : 2.6;
        for (let i = 0; i < curve.length; i++)
          curve[i] = Math.tanh(((i / (curve.length - 1)) * 2 - 1) * amount) / Math.tanh(amount);
        drive.curve = curve;
        drive.oversample = '2x';
        compress.threshold.value = -18;
        compress.ratio.value = 5;
        compress.attack.value = 0.002;
        compress.release.value = 0.065;
        const duration = src.buffer.duration;
        this.speech = this.voice(
          src,
          [hp, presence, drive, lp, compress],
          duration,
          key === 'inbound' || key === 'victory' ? 0.78 : 0.9,
          0.004,
          Math.max(0.02, duration - 0.025),
          this.radioBus
        );
        return !!this.speech;
      },
      beginMission() {
        if (!this.ctx) return;
        for (const v of this.voices) {
          try {
            v.stop();
          } catch (_) {}
        }
        this.voices.clear();
        this.nextHit = 0;
        this.hitIndex = 0;
        this.speak('inbound');
      },
      pilotHit() {
        if (!this.ctx || !this.running || this.ctx.currentTime < this.nextHit) return null;
        const key = this.hitIndex % 2 ? 'hit2' : 'hit1';
        if (!this.speak(key)) return null;
        this.hitIndex++;
        this.nextHit = this.ctx.currentTime + 4.5;
        return key;
      },
      blast() {
        this.noiseShot(1.7, 0.95, 9500, 650, 0.0015, this.blastBuffer, 1.45);
      }
    };
  };
  S.audio = S.createAudio();
})();
