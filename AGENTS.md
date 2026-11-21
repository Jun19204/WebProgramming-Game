# SKY STRIKE offline edition

Current rules only. Older notes that later decisions replaced have been removed; git history keeps them.

## 이 앱
Single-player F-22A air-combat game. Destroy 5 enemies within 300 s (5:00). Screens: lobby (orbit view, briefing, settings, controls guide), flight (chase/cockpit), pause, debrief, results. Nothing is saved except settings in localStorage (volume, musicVolume, shake, mute), which may be unavailable on file://. README.md is the player guide; TESTING.md records verification and its limits.

## Delivery constraints
- Runs by opening index.html over file://: fully offline, no install, build or server. Never add package manifests, node_modules, ES modules/imports, external requests, workers, React, Phaser or TypeScript to the deliverable.
- Game JavaScript is classic defer scripts, IIFE-wrapped, under window.SkyStrike. Libraries expose THREE (with GLTFLoader) and RAPIER; keep their pinned standalone bundles, licenses and SHA256SUMS.
- Models are authored in Blender (tools/*.py), exported as texture-free GLB, embedded in assets/models.js and parsed from ArrayBuffers. Never use URL loaders. GLB/.blend/mp3 files are authoring intermediates, not runtime needs.
- Radio speech is embedded PCM in assets/radio.js. tools/create_radio.ps1 is optional authoring (edge-tts only with -Regenerate, FFmpeg for processing), never needed at runtime.

## Controls
Arrow-up climb, arrow-down dive, A/D bank, Left/Right yaw, W/S throttle, Space gun, Shift missile, Tab target, F flare, C chase/cockpit (only while playing, no autorepeat), Escape pause. Focus loss pauses and clears input; focus return never auto-resumes. A+Left / D+Right hard turn increases actual yaw torque (never sets pose).

Settings toggle 자세 자동 복귀 (S.settings.assist, default on, persisted): on = original assist (keys set target pitch/bank, release returns level). Off = manual flight like Ace Combat without auto-level: controlPlayer sets p.rates (body rad/s: pitch .85, yaw .35 / .6 on hard turn, roll 1.7, plus a small lift-driven heading change while banked) and Mission.fly applies a body-rate torque controller (RATE_GAIN) so zero stick holds attitude; loops and continuous rolls work. Still forces/torques only; enemies always use the assist path. Can be changed while paused.

## Simulation
- Rapier dynamic rigid bodies integrate aircraft pose from forces and torques at a fixed timestep (1/60, max 6 steps). Rendering interpolates snapshots and never writes body pose. Keep resource limits in src/config.js.
- Island meshes and colliders use the same geometry. Dispose the old world on restart.
- All damage and kill accounting goes through Mission.damage; no duplicate kills; damage stays gated after victory.
- Projectiles survive owner death; casts exclude owner.body only while it is not removed.
- Player: HP 100, 20 missiles (lock 4000 m, 22°, 0.65 s; cooldown 0.65 s), unlimited gun. Player missile guidance is fixed as is.
- Flares: 5 uses per mission, 1.2 s cooldown, no autorepeat, none while paused. One use emits 5 pairs (10 decoys) at 0.15 s intervals on simulation time (pauses with it). Each pair diverts currently detected incoming threats to a moving decoy (3 s life) and plays an ignition sound; collision damage is never disabled. Warning (HUD + audio) for player-targeted enemy missiles within 2500 m.

## Enemy AI (pressure = min(1, kills/4))
- Pursue after 4 s. Aircraft steering .65 rad/s. Pursuit speed 210 + index*7 + 12*pressure.
- Gun: reset .175 - .045*pressure, timer rate 1 + .25*pressure.
- Missiles: 25 damage, range 2600, aim dot .80, max 3 active. Reload 7.2 + index*.4 - 2.4*pressure (timer rate 1 + .35*pressure); global spacing 1.9 - .6*pressure s.
- Enemy missile turn rates near .105 + .025*pressure / far .72 + .16*pressure, lead .22 + .08*pressure: a timed hard turn must still be able to evade without flares.
- Damage values and flare counts are fixed.

## Victory and debrief
Victory starts a debrief: .6 s delay, then the victory radio clip ("All targets neutralized. Good work, SpearOne!", Christopher voice, natural speed), then the clip length plus .6 s tail, then a .8 s result fade. No victory dialogue text in HUD or results. During debrief stepDebrief keeps running the fixed-step flight (controlPlayer, forces, snapshots), C works, and projectiles continue until collision/expiry. Mission result/time stay fixed. Pause/focus rules apply; debriefPaused suspends the AudioContext and the timer, explicit resume continues both. Home/retry cancels the clip.

## Audio
Locally synthesized filtered noise and turbine tones; dedicated gun/missile sounds, cockpit filtering, 32-voice cap, immediate pause gating; missile flight sound follows the nearest missile. Radio voices: controller en-US-ChristopherNeural, pilot en-US-GuyNeural, with carrier/squelch noise and role-specific filtering, compression and saturation. Start radio plays once per mission; enemy-source player damage plays alternating hit lines with a 4.5 s cooldown; pause cancels speech. Lobby music: original 88 BPM synthesized stereo loop, one reusable source, own musicVolume plus global mute, starts after a user gesture, fades out on departure or focus loss.

## Presentation
- Chase camera offset (0, 6.5, 29)/1.5 with zoom 1.2. Cockpit: camera-local 3D interior with live CanvasTexture MFDs; tracks the interpolated aircraft exactly, including roll; own exterior hidden only in cockpit, enemies stay visible. Lobby pointer/keyboard orbit moves the camera only.
- CombatFX: capped at 2400 particles and 64 debris pieces, cleared on restart; flare visuals reuse this pool. Missile visibility scale is render-only.
- Control surfaces (render-only): 8 hinged nodes CS_stab_L/R, CS_aileron_L/R, CS_flaperon_L/R, CS_rudder_L/R; node origin on the hinge, local X = hinge line (+angle = trailing edge down / rudder right). Mission.fly writes e.ctrl (pitch/roll/yaw) from player stick (e.stick) plus body-frame attitude error; enemies use the error only. View.moveSurfaces: servo 4/s, stab ±20° pitch with ±8° differential roll, aileron 22°, flaperon 15°, rudder 25°. Lobby runs a slow control-check sweep. ctrl never feeds physics.
- Exhaust (render-only, View.plumeMaterial/updatePlume): per nozzle an additive open-tube shader plume from local z 8.05, pink-violet shock diamonds every 1.75 m over a faint lilac glow, scale .5/.25 for the 2D nozzle, glow core quad at z 8.12. Power eases toward speed (lobby .55); length 4.5 + 8*power. One plume/core material per aircraft, disposed in View.clear.

## F-22A exterior (tools/create_fighter.py → kestrel.blend → assets/models.js kestrel entry)
- The user asked for the F-22A shape, built from DVIDS public top/side references and public USAF photos. Fixed coordinates: cockpit at local (0, 1.16, -5.35), nozzle centres at x = ±0.98.
- Shape: wide flat ogive nose with slight droop and a sharp side chine; faceted upper side wall; low, long gold canopy with an integrated aft fairing; integrated engine shoulders; fins canted out with broad tip chord, rudder outline and formation lights; swept trapezoidal beveled inlets with splitters and stepped recessed ducts that taper inward and stay inside the fairing; broad 2D vectoring nozzle flaps with sawtooth edges, deep liners, cooling channels and hinge covers; sawtooth bay/gear doors, air-data probes (y 7.0/7.35), nose formation lights, RAM strips, control-surface divisions, flush antenna panels.
- Belly: the lower inlet lip meets the belly contour and a 25-section cheek/underside loft runs into the centre keel to match the aft hull stations. Keep this continuous belly; never return to a boxed inlet fairing.
- Paint (refs: Wikimedia USAF Kadena photo, usaf-sig.org colour notes): metallic two-tone (metal .30), LIGHT .30/.312/.326, DARK .145/.155/.166 shared by body and wings. Fuselage tone varies only along its length (light forward, smoothly darker aft of y ≈ 1.5). Never add side-to-side or normal-based paint edges on the hull (rejected twice). Wing lobes reach the wing root; dark lobes are inset from every planform edge (wings, stabilators, control surfaces); swept mid-fin patch follows the leading edge. Wide hard-edged FS 36375-like light ghost grey trim on leading/trailing edges. Flat light ghost grey radome back to y ≈ 7.65 with a joint line. Engine and spine panels use the fuselage rule times .93; a single flat colour there was rejected. Low-visibility stencils SP / 001 (fictional SpearOne identity, not a real unit), star-and-bars on the upper left wing, tail stencil upright. Matte coating.
- Current size: 16 materials, about 37k triangles, no textures.

## Testing
tests.html is an optional no-install browser self-check (network APIs blocked): currently 45/45 pass over file:// (physics, WebGL rendering with both camera modes, OfflineAudioContext PCM, presentation/integration, flare/missile/AI, full normal-input mission). This proves nothing about other browsers, long-duration performance, subjective voice/audio quality or fidelity to real recordings. Never carry over test claims from the old Vite project. Details in TESTING.md.
