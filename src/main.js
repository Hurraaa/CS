import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

// ============================================================================
//  AWP HANGAR — a compact CS-style deathmatch against bots, built on Three.js
// ============================================================================

window.__step && window.__step('three-loaded');

// ---------- Core Three.js setup ----------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x11161c);
scene.fog = new THREE.Fog(0x11161c, 60, 150);

const BASE_FOV = 78, SCOPE_FOV = 20;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.05, 400);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

let time = 0;   // global sim clock (referenced by bot spawn/AI created below)

// Mobile / touch state
const isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
let mobileActive = false;          // true while playing on a touch device (no pointer lock)
let yaw = 0, pitch = 0;            // camera orientation we own on mobile
const moveVec = { x: 0, y: 0 };    // analog joystick output: x=strafe, y=forward
let joyActive = false, joyMag = 0;
let mCrouch = false;               // mobile crouch toggle
camera.rotation.order = 'YXZ';     // matches PointerLockControls; lets us set yaw/pitch directly
const isActive = () => controls.isLocked || mobileActive;
if (isTouch) {
  document.body.classList.add('mobile');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));   // phones: cap fill-rate cost
}

// ---------- Procedural textures ----------
function canvasTex(w, h, draw, repeat = 1, repeatY) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeatY ?? repeat);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function noise(ctx, w, h, base, amp) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amp;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i+1] = Math.max(0, Math.min(255, d[i+1] + n));
    d[i+2] = Math.max(0, Math.min(255, d[i+2] + n));
  }
  ctx.putImageData(img, 0, 0);
}
const floorTex = canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#3a3f45'; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0, 46);
  ctx.strokeStyle = 'rgba(20,22,25,.7)'; ctx.lineWidth = 3;
  for (let i = 0; i <= w; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
}, 14);
const wallTex = canvasTex(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#4b5560'; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0, 26);
  ctx.strokeStyle = 'rgba(28,32,38,.6)'; ctx.lineWidth = 4;
  for (let i = 0; i <= w; i += 128) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  for (let i = 0; i <= h; i += 64) { ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(w, i); ctx.stroke(); }
}, 4, 2);
const crateTex = canvasTex(128, 128, (ctx, w, h) => {
  ctx.fillStyle = '#7a5326'; ctx.fillRect(0, 0, w, h);
  noise(ctx, w, h, 0, 30);
  ctx.strokeStyle = '#4d3316'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w-8, h-8);
  ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(6,6); ctx.lineTo(w-6,h-6); ctx.moveTo(w-6,6); ctx.lineTo(6,h-6); ctx.stroke();
});
function metalTex(color) {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0, 18);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 5;
    for (let i = 0; i <= w; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke(); }
  });
}

// ---------- Lighting ----------
scene.add(new THREE.HemisphereLight(0xbcd2e8, 0x2a2620, 0.95));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
sun.position.set(30, 55, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);   // cheaper shadows on phones
sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0004;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x8899bb, 0.35);
fill.position.set(-25, 30, -20);
scene.add(fill);

// ---------- World / map ----------
const MAP = { hw: 48, hd: 48, wallH: 12 };   // half-width, half-depth, wall height
const colliders = [];        // { box: THREE.Box3 } used for movement + bullet blocking
const colliderMeshes = [];   // meshes to raycast for bullets/LOS

function addBox(w, h, d, x, y, z, tex, texRepeat) {
  const map = tex.clone(); map.needsUpdate = true;
  if (texRepeat) map.repeat.set(texRepeat.x, texRepeat.y);
  else map.repeat.copy(tex.repeat);
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0.08 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(x, y, z), new THREE.Vector3(w, h, d));
  colliders.push({ box });
  colliderMeshes.push(mesh);
  return mesh;
}

// Floor
{
  const mat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.96, metalness: 0.04 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(MAP.hw * 2, MAP.hd * 2), mat);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  scene.add(floor);
}
// Ceiling (dark, subtle)
{
  const mat = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 1 });
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(MAP.hw * 2, MAP.hd * 2), mat);
  ceil.rotation.x = Math.PI / 2; ceil.position.y = MAP.wallH;
  scene.add(ceil);
  // roof beams for depth
  const beamMat = new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8, metalness: 0.3 });
  for (let x = -MAP.hw + 8; x < MAP.hw; x += 12) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, MAP.hd * 2), beamMat);
    beam.position.set(x, MAP.wallH - 0.6, 0); beam.castShadow = true; scene.add(beam);
  }
}
// Perimeter walls
const wt = 1.5;
addBox(MAP.hw * 2 + wt, MAP.wallH, wt, 0, MAP.wallH / 2, -MAP.hd, wallTex, { x: 12, y: 3 });
addBox(MAP.hw * 2 + wt, MAP.wallH, wt, 0, MAP.wallH / 2,  MAP.hd, wallTex, { x: 12, y: 3 });
addBox(wt, MAP.wallH, MAP.hd * 2 + wt, -MAP.hw, MAP.wallH / 2, 0, wallTex, { x: 12, y: 3 });
addBox(wt, MAP.wallH, MAP.hd * 2 + wt,  MAP.hw, MAP.wallH / 2, 0, wallTex, { x: 12, y: 3 });

// Interior layout: containers, crate stacks, cover, ramps — a hangar arena.
const teal = metalTex('#2f6f6a'), rust = metalTex('#8a4a2f'), blue = metalTex('#2d4a6f'), gray = metalTex('#565c63');
function container(x, z, rot, tex) {
  const w = 12, h = 5.2, d = 4.4;
  const m = addBox(rot ? d : w, h, rot ? w : d, x, h / 2, z, tex, { x: rot ? 1 : 3, y: 1 });
  return m;
}
function crate(x, z, s = 2.4, y = null) { return addBox(s, s, s, x, y ?? s / 2, z, crateTex); }
function crateStack(x, z) { crate(x, z, 2.6); crate(x, z, 2.4, 2.6 + 1.2); crate(x + 2.7, z, 2.6); }

// Central cluster
container(0, -6, false, teal);
container(0, 10, true, rust);
crateStack(-3, 0);
crate(3.5, 2, 2.4); crate(3.5, -2, 2.4); crate(3.5, 0, 2.4, 2.6);

// Corners
container(-30, -30, false, blue);
container(30, 30, false, teal);
container(-32, 28, true, rust);
container(32, -28, true, gray);

// Scattered cover
const coverSpots = [[-18,4],[18,-4],[-8,-24],[10,26],[-24,-8],[24,10],[-14,20],[16,-20],[-38,0],[38,2],[0,34],[2,-36]];
coverSpots.forEach(([x, z], i) => {
  if (i % 3 === 0) crateStack(x, z);
  else if (i % 3 === 1) { crate(x, z, 2.8); crate(x + 3, z, 2.2); }
  else container(x, z, i % 2 === 0, [teal, rust, blue, gray][i % 4]);
});

// A couple of ramps (climbable via step logic)
function ramp(x, z, rot) {
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    const y = (i + 0.5) * 0.7;
    const w = 4, d = 1.6;
    addBox(rot ? d : w, 0.7, rot ? w : d, rot ? x + i * 1.5 - 2.2 : x, y, rot ? z : z + i * 1.5 - 2.2, gray);
  }
}
ramp(-20, -14, false);
ramp(22, 16, true);

// ---------- Settings (persisted) ----------
const settings = {
  sens: Math.max(0.3, Math.min(2, parseFloat(localStorage.getItem('awp.sens')) || 1)),
  sound: localStorage.getItem('awp.sound') !== '0',
  diff: ['easy', 'normal', 'hard'].includes(localStorage.getItem('awp.diff')) ? localStorage.getItem('awp.diff') : 'normal',
};
// Difficulty scales how bots fight the PLAYER (bot-vs-bot stays balanced):
// acc = hit-chance multiplier, dmg = damage multiplier, rate = fire-interval multiplier.
const DIFF = {
  easy:   { acc: 0.55, dmg: 0.65, rate: 1.45 },
  normal: { acc: 1.0,  dmg: 1.0,  rate: 1.0 },
  hard:   { acc: 1.4,  dmg: 1.25, rate: 0.72 },
};
const diff = () => DIFF[settings.diff];

// ---------- Audio (WebAudio synth) ----------
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playShot(big = true, vol = 0.5) {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime;
  // noise burst
  const dur = big ? 0.28 : 0.12;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, big ? 2.4 : 3.4);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const flt = audioCtx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(big ? 2600 : 4200, t); flt.frequency.exponentialRampToValueAtTime(big ? 400 : 900, t + dur);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
  src.connect(flt); flt.connect(g); g.connect(audioCtx.destination); src.start(t); src.stop(t + dur);
  if (big) { // low thump
    const osc = audioCtx.createOscillator(); const og = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    og.gain.setValueAtTime(vol * 0.9, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(og); og.connect(audioCtx.destination); osc.start(t); osc.stop(t + 0.2);
  }
}
function playClick() {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'square'; o.frequency.value = 900; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.05);
}
// soft footstep thud (alternating pitch)
let stepFlip = false;
function playStep(run) {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime, dur = 0.07;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = (stepFlip = !stepFlip) ? 420 : 360;
  const g = audioCtx.createGain(); g.gain.value = run ? 0.11 : 0.07;
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(t);
}
// near-miss bullet whiz (quick noise sweep past the ear)
function playWhiz() {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime, dur = 0.16;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9;
  f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(t);
}
// meaty flesh-hit thwack for confirmed body shots (pitch varies per hit)
function playFleshHit() {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime, dur = 0.09;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 550 + Math.random() * 250;
  const g = audioCtx.createGain(); g.gain.setValueAtTime(0.22, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(audioCtx.destination); src.start(t);
}
// bright metallic 'tink' on headshot hits
function playTink() {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(2300, t); o.frequency.exponentialRampToValueAtTime(1600, t + 0.07);
  g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.09);
}
// short rising two-tone when the player confirms a kill (higher for headshots)
function playKillConfirm(head) {
  if (!audioCtx || !settings.sound) return;
  const t = audioCtx.currentTime;
  [head ? 880 : 660, head ? 1320 : 990].forEach((f, i) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.07); g.gain.exponentialRampToValueAtTime(0.14, t + i * 0.07 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.12);
    o.connect(g); g.connect(audioCtx.destination); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.13);
  });
}

// ---------- Player ----------
const EYE_STAND = 1.68, EYE_CROUCH = 1.0, RADIUS = 0.38, STEP = 0.65;
const player = {
  pos: new THREE.Vector3(0, 0, 40),   // feet
  vel: new THREE.Vector3(),
  onGround: true,
  eye: EYE_STAND,
  hp: 100,
  crouch: false,
  alive: true,
};
// 5v5 team play: player + 4 allies (CT, south half) vs 5 enemies (T, north half).
const SPAWNS = [
  new THREE.Vector3(0, 0, 42), new THREE.Vector3(-20, 0, 42), new THREE.Vector3(20, 0, 42),
  new THREE.Vector3(-40, 0, 42), new THREE.Vector3(40, 0, 42),
];
function respawnPlayer() {
  const s = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
  player.pos.copy(s); player.vel.set(0, 0, 0); player.hp = 100; player.alive = true; player.crouch = false;
  // face the arena center so you never spawn staring at a wall
  yaw = Math.atan2(s.x, s.z); pitch = 0;
  camera.rotation.set(pitch, yaw, 0);
}
respawnPlayer();

// ---------- Weapons ----------
// Two guns: an AK-47-style full-auto rifle (primary, spray) and the AWP (secondary, bolt).
const WEAPONS = {
  ak: {
    key: 'ak', name: 'AK-47', auto: true,
    magMax: 30, reserveMax: 90, dmgBody: 33, dmgHead: 130,
    fireDelay: 0.1, reloadTime: 2.4, scope: false, adsFov: 58, walkWhileAiming: false,
    recoilUp: 0.010, recoilSide: 0.006, recover: 6.5, kick: 0.05,
    spreadHip: 0.014, spreadAds: 0.004, sndBig: false, sndVol: 0.34,
  },
  awp: {
    key: 'awp', name: 'AWP', auto: false,
    magMax: 10, reserveMax: 30, dmgBody: 115, dmgHead: 450,
    fireDelay: 1.45, reloadTime: 3.4, scope: true, adsFov: SCOPE_FOV, walkWhileAiming: true,
    recoilUp: 0.05, recoilSide: 0.012, recover: 3.5, kick: 0.12,
    spreadHip: 0.02, spreadAds: 0.0, sndBig: true, sndVol: 0.5,
  },
};
// Per-weapon ammo/reload runtime, kept independently so switching preserves each mag.
const ammoState = {
  ak: { mag: 30, reserve: 90, lastShot: -99, reloading: false, reloadEnd: 0 },
  awp: { mag: 10, reserve: 30, lastShot: -99, reloading: false, reloadEnd: 0 },
};
let curKey = 'ak';                     // start on the rifle — spray first
const curW = () => WEAPONS[curKey];
const curAmmo = () => ammoState[curKey];
let firing = false;                    // left mouse / fire button held
// aim-recoil accumulators (layered on top of look; auto-recovers)
let recPitch = 0, recYaw = 0, recAppP = 0, recAppY = 0;

// ---------- Weapon viewmodels (box-built AK-47 + AWP) ----------
const viewGroup = new THREE.Group();
camera.add(viewGroup);
scene.add(camera); // ensure camera (already via controls) — safe, adds once
viewGroup.position.set(0.22, -0.2, -0.42);
viewGroup.rotation.y = 0.02;

const metalMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.4, metalness: 0.7 });

// AWP model
const awpModel = new THREE.Group();
{
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x20361f, roughness: 0.6, metalness: 0.3 });
  const scopeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.6 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.5), bodyMat); stock.position.set(0, -0.02, 0.18);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.7), bodyMat); body.position.set(0, 0.02, -0.28);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.9, 12), metalMat); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.05, -0.85);
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 14), scopeMat); scopeTube.rotation.x = Math.PI / 2; scopeTube.position.set(0, 0.13, -0.2);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.12), metalMat); mag.position.set(0, -0.12, -0.15);
  awpModel.add(stock, body, barrel, scopeTube, mag);
}
viewGroup.add(awpModel);

// AK-47 model (wood furniture + banana mag)
const akModel = new THREE.Group();
{
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.75, metalness: 0.05 });
  const black = new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.5, metalness: 0.6 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.42), wood); stock.position.set(0, -0.03, 0.2);
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.13, 0.5), black); receiver.position.set(0, 0.01, -0.18);
  const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.34), wood); handguard.position.set(0, 0, -0.5);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.5, 12), metalMat); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.82);
  const gasblock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.12), black); gasblock.position.set(0, 0.06, -0.55);
  const banana = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.13), black); banana.position.set(0, -0.16, -0.08); banana.rotation.x = 0.35;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), black); grip.position.set(0, -0.13, 0.02); grip.rotation.x = -0.3;
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), black); sight.position.set(0, 0.09, -0.34);
  akModel.add(stock, receiver, handguard, barrel, gasblock, banana, grip, sight);
}
akModel.visible = false;
viewGroup.add(akModel);

viewGroup.traverse(m => { if (m.isMesh) m.castShadow = false; });

function updateViewmodel() {
  awpModel.visible = curKey === 'awp';
  akModel.visible = curKey === 'ak';
}
updateViewmodel();

// ---------- Bots ----------
// 5v5 teams: 'ct' = player's side (blue), 't' = enemies (red). Bots fight each other too.
const TEAM = {
  ct: { cloth: 0x2d4f7c, dark: 0x1c2733, names: ['Şahin', 'Kartal', 'Doğan', 'Atmaca'] },
  t:  { cloth: 0xb23a2a, dark: 0x33221c, names: ['Kobra', 'Çakal', 'Akrep', 'Engerek', 'Pars'] },
};
const bots = [];

// Limb with its pivot at the top (shoulder/hip) so rotation.x swings it naturally.
function limb(w, h, d, mat) {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(0, -h / 2, 0);
  return new THREE.Mesh(geo, mat);
}

function makeBot(team, name) {
  const cfg = TEAM[team];
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: cfg.cloth, roughness: 0.7, metalness: 0.1 });
  const dark = new THREE.MeshStandardMaterial({ color: cfg.dark, roughness: 0.8 });
  const gunmetal = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.45, metalness: 0.65 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3f1d, roughness: 0.75 });

  // Rig: root (feet) → legs (hip pivots) + torsoG (pitch-aims at target) → head/arms/rifle
  const g = new THREE.Group();
  const legL = limb(0.19, 0.95, 0.19, dark); legL.position.set(-0.15, 0.95, 0);
  const legR = limb(0.19, 0.95, 0.19, dark); legR.position.set(0.15, 0.95, 0);

  const torsoG = new THREE.Group(); torsoG.position.y = 0.95;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.72, 0.3), cloth); torso.position.y = 0.36;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.34), dark); vest.position.y = 0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin); head.position.y = 0.9;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.38), dark); helmet.position.y = 1.06;
  // Arms reach forward to hold the rifle at the ready (CS bot stance).
  const armL = limb(0.14, 0.62, 0.14, cloth); armL.position.set(-0.34, 0.62, 0);
  const armR = limb(0.14, 0.62, 0.14, cloth); armR.position.set(0.34, 0.62, 0);
  armL.rotation.set(-1.15, 0, 0.35); armR.rotation.set(-1.25, 0, -0.2);
  // Rifle held in front of the chest, pointing forward (-z).
  const rifle = new THREE.Group();
  const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.6), gunmetal);
  const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.2), wood); rStock.position.set(0, -0.01, 0.38);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.34, 10), gunmetal);
  rBarrel.rotation.x = Math.PI / 2; rBarrel.position.set(0, 0.02, -0.44);
  const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.1), gunmetal); rMag.position.set(0, -0.11, -0.05); rMag.rotation.x = 0.3;
  rifle.add(rBody, rStock, rBarrel, rMag);
  rifle.position.set(0.1, 0.42, -0.35);
  torsoG.add(torso, vest, head, helmet, armL, armR, rifle);
  g.add(legL, legR, torsoG);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });

  // name + health bar sprite
  const hbCanvas = document.createElement('canvas'); hbCanvas.width = 96; hbCanvas.height = 22;
  const hbTex = new THREE.CanvasTexture(hbCanvas);
  const hbMat = new THREE.SpriteMaterial({ map: hbTex, depthTest: false, transparent: true });
  const hbSprite = new THREE.Sprite(hbMat); hbSprite.position.set(0, 2.32, 0); hbSprite.scale.set(1.5, 0.34, 1); g.add(hbSprite);

  scene.add(g);
  const bot = {
    team, name, group: g, head, torso, torsoG, legs: [legL, legR], arms: [armL, armR],
    hp: 100, alive: true, respawnAt: 0,
    kills: 0, deaths: 0,
    dying: false, deathStart: 0, fallDir: 1,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    target: new THREE.Vector3(),                   // patrol destination
    enemy: null,                                   // current combat target: bot object or 'player'
    lastSeen: 0, nextShot: 0, nextThink: 0, state: 'patrol',
    walkPhase: Math.random() * 6, moveAmt: 0,
    hbCanvas, hbCtx: hbCanvas.getContext('2d'), hbTex, hbSprite,
    yaw: 0, aimPitch: 0,
  };
  bots.push(bot);
  spawnBot(bot);
  return bot;
}

// Team spawn zones: CT south (z>0), T north (z<0).
function spawnBot(bot) {
  let p; let tries = 0;
  const zMin = bot.team === 'ct' ? MAP.hd * 0.45 : -MAP.hd + 3;
  const zMax = bot.team === 'ct' ? MAP.hd - 3 : -MAP.hd * 0.45;
  do {
    p = new THREE.Vector3((Math.random() - 0.5) * (MAP.hw * 2 - 8), 0, zMin + Math.random() * (zMax - zMin));
    tries++;
  } while (tries < 30 && pointBlocked(p));
  bot.pos.copy(p); bot.hp = 100; bot.alive = true; bot.dying = false;
  bot.group.visible = true;
  bot.group.rotation.set(0, 0, 0); bot.torsoG.rotation.x = 0;
  bot.state = 'patrol'; bot.enemy = null; pickPatrol(bot);
  bot.nextShot = time + 1; bot.nextThink = time + Math.random() * 0.3;
  updateBotHealthbar(bot);
}
function pointBlocked(p) {
  for (const c of colliders) {
    if (p.x > c.box.min.x - 0.6 && p.x < c.box.max.x + 0.6 && p.z > c.box.min.z - 0.6 && p.z < c.box.max.z + 0.6 && c.box.max.y > 0.5) return true;
  }
  return false;
}
function pickPatrol(bot) {
  let p, tries = 0;
  do { p = new THREE.Vector3((Math.random() - 0.5) * (MAP.hw * 2 - 8), 0, (Math.random() - 0.5) * (MAP.hd * 2 - 8)); tries++; }
  while (tries < 20 && pointBlocked(p));
  bot.target.copy(p);
}
TEAM.ct.names.forEach(n => makeBot('ct', n));
TEAM.t.names.forEach(n => makeBot('t', n));

// gather bot hit meshes for raycasting (both teams — allies block bullets but take no damage)
function botHitMeshes() {
  const arr = [];
  for (const b of bots) if (b.alive) { arr.push(b.head, b.torso); b.head.userData.bot = b; b.head.userData.part = 'head'; b.torso.userData.bot = b; b.torso.userData.part = 'body'; }
  return arr;
}

// ---------- Collision (AABB move-and-slide with step & gravity) ----------
const GRAVITY = 24, JUMP_V = 8.2, WALK_SPEED = 4.4, RUN_SPEED = 7.0, CROUCH_SPEED = 2.6, AIR_CTRL = 0.5;

function collideAxis(pos, r, head) {
  // returns adjusted pos for horizontal after checking all boxes on current axis test
  for (const c of colliders) {
    const b = c.box;
    // vertical overlap check: is the player's body (feet..head) intersecting box's y-range, above step?
    const feet = pos.y, top = pos.y + head;
    if (top < b.min.y || feet > b.max.y) continue;
    if (b.max.y - feet <= STEP && b.max.y > 0) continue; // low enough to step onto -> not a wall
    // horizontal overlap (circle vs expanded AABB)
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = (r - d);
      pos.x += (dx / d) * push;
      pos.z += (dz / d) * push;
    }
  }
}
function groundHeight(pos, r) {
  let g = 0;
  for (const c of colliders) {
    const b = c.box;
    // footprint overlap
    if (pos.x > b.min.x - r && pos.x < b.max.x + r && pos.z > b.min.z - r && pos.z < b.max.z + r) {
      if (b.max.y <= pos.y + STEP + 0.01 && b.max.y > g) g = b.max.y;
    }
  }
  return g;
}

// ---------- Input ----------
const keys = {};
let wantJump = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { wantJump = true; e.preventDefault(); }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Digit1') switchWeapon('ak');
  if (e.code === 'Digit2') switchWeapon('awp');
  if (e.code === 'KeyQ') switchWeapon(curKey === 'ak' ? 'awp' : 'ak');
  if (e.code === 'KeyF') toggleAllyMode();
  if (['ControlLeft','ControlRight'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

let scoped = false;
renderer.domElement.addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  if (e.button === 0) { firing = true; if (!curW().auto) fireOnce(); }   // auto guns fire from the update loop
  if (e.button === 2) setAim(true);
});
renderer.domElement.addEventListener('mouseup', e => {
  if (e.button === 0) firing = false;
  if (e.button === 2) setAim(false);
});
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Touch controls (mobile) ----------
// Look: drag anywhere on the canvas (touches on buttons/joystick are captured by them).
let lookId = null, lookX = 0, lookY = 0;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
function applyLook(dx, dy) {
  const sens = (scoped ? (curW().scope ? 0.0016 : 0.0028) : 0.0042) * settings.sens;
  yaw -= dx * sens;
  pitch -= dy * sens;
  pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));
  camera.rotation.set(pitch, yaw, 0);
}
const canvas = renderer.domElement;
canvas.addEventListener('touchstart', e => {
  if (!mobileActive) return;
  for (const t of e.changedTouches) {
    if (lookId === null) { lookId = t.identifier; lookX = t.clientX; lookY = t.clientY; }
  }
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  if (!mobileActive) return;
  for (const t of e.changedTouches) {
    if (t.identifier === lookId) {
      applyLook(t.clientX - lookX, t.clientY - lookY);
      lookX = t.clientX; lookY = t.clientY;
    }
  }
}, { passive: true });
function endLook(e) { for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null; }
canvas.addEventListener('touchend', endLook, { passive: true });
canvas.addEventListener('touchcancel', endLook, { passive: true });

// Virtual joystick (left)
const joy = document.getElementById('joy'), joyKnob = document.getElementById('joyKnob');
let joyId = null, joyCX = 0, joyCY = 0, joyR = 60;
function joyStart(e) {
  const t = e.changedTouches[0];
  const r = joy.getBoundingClientRect();
  joyCX = r.left + r.width / 2; joyCY = r.top + r.height / 2; joyR = r.width * 0.5;
  joyId = t.identifier; joyActive = true;
  joyMove(e);
  e.preventDefault();
}
function joyMove(e) {
  for (const t of e.changedTouches) {
    if (t.identifier !== joyId) continue;
    let dx = t.clientX - joyCX, dy = t.clientY - joyCY;
    const d = Math.hypot(dx, dy) || 0.0001;
    const cl = Math.min(d, joyR);
    const nx = (dx / d) * cl, ny = (dy / d) * cl;
    joyKnob.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
    moveVec.x = nx / joyR;          // strafe (right positive)
    moveVec.y = -ny / joyR;         // forward (up = forward)
    joyMag = cl / joyR;
  }
  e.preventDefault();
}
function joyEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) {
      joyId = null; joyActive = false; joyMag = 0; moveVec.x = moveVec.y = 0;
      joyKnob.style.transform = 'translate(-50%,-50%)';
    }
  }
}
joy.addEventListener('touchstart', joyStart, { passive: false });
joy.addEventListener('touchmove', joyMove, { passive: false });
joy.addEventListener('touchend', joyEnd, { passive: true });
joy.addEventListener('touchcancel', joyEnd, { passive: true });

// Action buttons
function bindBtn(id, onDown, onUp) {
  const b = document.getElementById(id);
  b.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); onDown && onDown(b); }, { passive: false });
  if (onUp) {
    b.addEventListener('touchend', e => { e.preventDefault(); onUp(b); }, { passive: false });
    b.addEventListener('touchcancel', () => onUp(b), { passive: true });
  }
}
// Fire: hold to spray (auto guns fire from the loop while `firing`); semi guns fire on press.
// Fire button = fire + aim (one thumb). Press to fire; slide the SAME thumb to aim.
// Touch events stay captured by the button element even after the finger slides off it,
// so you can walk (left joystick) + fire + aim all at once with two thumbs.
{
  const bf = document.getElementById('btnFire');
  let fireId = null, fx = 0, fy = 0;
  bf.addEventListener('touchstart', e => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0];
    fireId = t.identifier; fx = t.clientX; fy = t.clientY;
    firing = true; if (!curW().auto) fireOnce();
  }, { passive: false });
  bf.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === fireId) { applyLook(t.clientX - fx, t.clientY - fy); fx = t.clientX; fy = t.clientY; }
    }
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) if (t.identifier === fireId) { fireId = null; firing = false; } };
  bf.addEventListener('touchend', end, { passive: false });
  bf.addEventListener('touchcancel', end, { passive: true });
}
bindBtn('btnScope', (b) => { setAim(!scoped); b.classList.toggle('on', scoped); });
bindBtn('btnReload', () => startReload());
bindBtn('btnJump', () => { wantJump = true; });
bindBtn('btnCrouch', (b) => { mCrouch = !mCrouch; b.classList.toggle('on', mCrouch); });
bindBtn('btnSwap', () => switchWeapon(curKey === 'ak' ? 'awp' : 'ak'));
bindBtn('btnSquad', () => toggleAllyMode());

function setAim(on) {
  scoped = on;
  const useScope = on && curW().scope;             // full scope overlay only for AWP
  document.getElementById('scope').classList.toggle('on', useScope);
  document.getElementById('crosshair').classList.toggle('hidden', on);
  document.getElementById('dot').style.display = useScope ? 'none' : 'block';
  viewGroup.visible = !useScope;
  controls.pointerSpeed = (on ? (curW().scope ? 0.35 : 0.62) : 1.0) * settings.sens;
}

function updateWeaponName() {
  el('weaponName').textContent = curW().name;
  const sb = document.getElementById('btnSwap');
  if (sb) sb.textContent = curKey === 'ak' ? 'AWP' : 'AK';   // label shows the gun you'll switch TO
}
function switchWeapon(key) {
  if (key === curKey || !WEAPONS[key]) return;
  const a = curAmmo();
  if (a.reloading) { a.reloading = false; document.getElementById('ammo').classList.remove('reloading'); }
  setAim(false);
  curKey = key; firing = false;
  updateViewmodel(); updateAmmo(); updateWeaponName();
  ensureAudio(); playClick();
}

// ---------- Shooting ----------
const raycaster = new THREE.Raycaster();
const hitmarkerEl = document.getElementById('hitmarker');

function fireOnce() {
  if (!player.alive || roundOver) return;
  const w = curW(), a = curAmmo();
  if (a.reloading) return;
  if (time - a.lastShot < w.fireDelay) return;
  if (a.mag <= 0) { startReload(); return; }
  a.lastShot = time; a.mag--; updateAmmo();
  ensureAudio(); playShot(w.sndBig, w.sndVol);
  // viewmodel kick + aim recoil
  viewGroup.position.z = -0.42 + w.kick * 0.7;
  recPitch += w.recoilUp;
  recYaw += (Math.random() * 2 - 1) * w.recoilSide;

  // bullet spread: tighter when aiming
  const spread = scoped ? w.spreadAds : w.spreadHip;
  raycaster.setFromCamera({ x: (Math.random() * 2 - 1) * spread, y: (Math.random() * 2 - 1) * spread }, camera);
  const targets = [...botHitMeshes(), ...colliderMeshes];
  const hits = raycaster.intersectObjects(targets, false);
  if (hits.length) {
    const h = hits[0];
    if (h.object.userData.bot) {
      const bot = h.object.userData.bot;
      if (bot.team === 'ct') {
        spawnImpact(h.point, h.face ? h.face.normal : null);   // friendly fire off — bullet stops on allies
      } else {
        const head = h.object.userData.part === 'head';
        damageBot(bot, head ? w.dmgHead : w.dmgBody, head, 'player');
        showHitmarker(bot.hp <= 0, head);
        if (head) playTink(); else playFleshHit();
      }
    } else {
      spawnImpact(h.point, h.face ? h.face.normal : null);
    }
  }
  spawnTracer(raycaster.ray.origin, raycaster.ray.direction, hits.length ? hits[0].distance : 200);
}

function showHitmarker(kill, head) {
  hitmarkerEl.classList.toggle('kill', kill);
  hitmarkerEl.classList.toggle('head', !!head && !kill);
  hitmarkerEl.style.opacity = '1';
  clearTimeout(hitmarkerEl._t);
  hitmarkerEl._t = setTimeout(() => hitmarkerEl.style.opacity = '0', kill ? 260 : 130);
}

function startReload() {
  const w = curW(), a = curAmmo();
  if (a.reloading || a.mag >= w.magMax || a.reserve <= 0) return;
  a.reloading = true; a.reloadEnd = time + w.reloadTime;
  document.getElementById('ammo').classList.add('reloading');
  ensureAudio(); playClick();
}
function finishReload() {
  const w = curW(), a = curAmmo();
  // Infinite reserve: endless deathmatch, so reloads always top the mag and the
  // reserve never depletes (shown as ∞ in the HUD).
  a.mag = w.magMax; a.reserve = w.reserveMax; a.reloading = false;
  document.getElementById('ammo').classList.remove('reloading');
  updateAmmo(); playClick();
}

// ---------- Effects ----------
const effects = [];
function spawnTracer(origin, dir, dist) {
  const start = origin.clone().add(dir.clone().multiplyScalar(0.6));
  const end = origin.clone().add(dir.clone().multiplyScalar(dist));
  const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geo, mat); scene.add(line);
  effects.push({ obj: line, mat, life: 0.08, max: 0.08, type: 'fade' });
}
function spawnImpact(point, normal) {
  const geo = new THREE.BufferGeometry();
  const n = 8, arr = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { arr[i*3]=point.x; arr[i*3+1]=point.y; arr[i*3+2]=point.z; vel.push(new THREE.Vector3((Math.random()-.5)*4,(Math.random())*4,(Math.random()-.5)*4)); }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffcc66, size: 0.12, transparent: true });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  effects.push({ obj: pts, mat, geo, vel, life: 0.4, max: 0.4, type: 'particles' });
}
function spawnBlood(point) {
  const geo = new THREE.BufferGeometry();
  const n = 22, arr = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { arr[i*3]=point.x; arr[i*3+1]=point.y; arr[i*3+2]=point.z; vel.push(new THREE.Vector3((Math.random()-.5)*6,(Math.random())*5.5,(Math.random()-.5)*6)); }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: Math.random() < 0.5 ? 0xaa1010 : 0x7d0b0b, size: 0.19, transparent: true });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  effects.push({ obj: pts, mat, geo, vel, life: 0.55, max: 0.55, type: 'particles' });
}

// ---------- Floating damage numbers (screen-space, player hits only) ----------
const dmgNumHolder = document.getElementById('hurtdir').parentElement; // #hud
function spawnDamageNumber(worldPos, dmg, head, kill) {
  const v = worldPos.clone().project(camera);
  if (v.z > 1) return;                                   // behind the camera
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
  const d = document.createElement('div');
  d.className = 'dmgnum' + (kill ? ' kill' : head ? ' head' : '');
  d.textContent = Math.round(dmg);
  d.style.left = (x + (Math.random() - 0.5) * 26) + 'px';
  d.style.top = (y - 8) + 'px';
  dmgNumHolder.appendChild(d);
  setTimeout(() => d.remove(), 750);
}

// ---------- Bot combat ----------
// killer: 'player' | a bot object | null — used for kill-feed names and team score.
function damageBot(bot, dmg, head, killer) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  bot.flinchT = time;                                    // rig jerks for ~0.2s
  const hitPos = (head ? bot.head : bot.torso).getWorldPosition(new THREE.Vector3());
  spawnBlood(hitPos);
  if (killer === 'player') spawnDamageNumber(hitPos, dmg, head, bot.hp <= 0);
  if (bot.hp <= 0) { killBot(bot, killer, head); }
  else updateBotHealthbar(bot);
}
function killBot(bot, killer, headshot) {
  bot.alive = false; bot.dying = true; bot.deathStart = time;
  bot.fallDir = Math.random() < 0.5 ? 1 : -1;
  bot.respawnAt = time + 3.2;
  bot.deaths++;
  if (killer === 'player') { stats.kills++; teamScore.ct++; }
  else if (killer && killer.team) { killer.kills++; teamScore[killer.team]++; }
  updateScore();
  addKillFeed(killer === 'player' ? 'Sen' : (killer ? killer.name : '?'), bot.name,
    killer === 'player' ? 'player' : (killer ? killer.team : 't'), headshot);
  ensureAudio();
  if (killer === 'player') playKillConfirm(headshot);
}
function updateBotHealthbar(bot) {
  const ctx = bot.hbCtx, W = 96, H = 22;
  ctx.clearRect(0, 0, W, H);
  // name tag colored by team
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.fillStyle = bot.team === 'ct' ? '#6db3ff' : '#ff8a6b';
  ctx.shadowColor = '#000'; ctx.shadowBlur = 3;
  ctx.fillText(bot.name, W / 2, 11);
  ctx.shadowBlur = 0;
  // bar
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(16, 14, 64, 7);
  const p = Math.max(0, bot.hp / 100);
  ctx.fillStyle = p > 0.5 ? '#3dff8b' : p > 0.25 ? '#ffcc4d' : '#ff4d4d';
  ctx.fillRect(17, 15, 62 * p, 5);
  bot.hbTex.needsUpdate = true;
}

// Clear line of sight between two world points (map geometry only).
function losClear(from, to, maxDist = 70) {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist > maxDist) return false;
  dir.normalize();
  raycaster.set(from, dir);
  raycaster.far = dist - 0.4;
  const hits = raycaster.intersectObjects(colliderMeshes, false);
  raycaster.far = Infinity;
  return hits.length === 0;
}
const eyeOf = (target) => target === 'player'
  ? controls.getObject().position.clone()
  : target.head.getWorldPosition(new THREE.Vector3());
const aliveTarget = (target) => target === 'player' ? player.alive : (target && target.alive);
// Enemies of a bot: for T that includes the player; allies never target each other.
function enemiesOf(bot) {
  const list = [];
  if (bot.team === 't' && player.alive) list.push('player');
  for (const b of bots) if (b.alive && b.team !== bot.team) list.push(b);
  return list;
}

function botShootAt(bot, target) {
  if (roundOver) return;
  ensureAudio();
  const from = bot.head.getWorldPosition(new THREE.Vector3());
  const tPos = eyeOf(target);
  const dist = from.distanceTo(tPos);
  // audible by distance to the PLAYER, so far bot-fights fade out
  const dToPlayer = from.distanceTo(controls.getObject().position);
  playShot(false, 0.28 * Math.max(0.08, 1 - dToPlayer / 80));
  const spread = 0.045 + dist * 0.0026 + (target === 'player' ? player.vel.length() * 0.004 : 0.02);
  const dir = tPos.clone().sub(from).normalize();
  dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
  spawnTracer(from, dir.normalize(), dist);
  if (target === 'player') {
    const hitChance = Math.min(0.9, Math.max(0.14, Math.min(0.72, 0.8 - dist * 0.008)) * diff().acc);
    if (Math.random() < hitChance) damagePlayer((14 + Math.random() * 16) * diff().dmg, from, bot);
    else if (dist < 40 && Math.random() < 0.55) playWhiz();   // near miss whistles past
  } else {
    // bot-vs-bot: slightly less lethal so firefights are watchable and winnable
    const hitChance = Math.max(0.1, Math.min(0.5, 0.6 - dist * 0.008));
    if (Math.random() < hitChance) damageBot(target, 11 + Math.random() * 14, false, bot);
  }
}

// ---------- Player damage ----------
const dmgflash = document.getElementById('dmgflash');
function damagePlayer(dmg, fromPos, attacker) {
  if (!player.alive) return;
  if (time < (player.protectUntil || 0)) return;   // brief spawn protection
  player.hp -= dmg;
  dmgflash.style.boxShadow = 'inset 0 0 160px 50px rgba(180,0,0,.55)';
  clearTimeout(dmgflash._t); dmgflash._t = setTimeout(() => dmgflash.style.boxShadow = 'inset 0 0 160px 40px rgba(180,0,0,0)', 120);
  // directional hurt arc: bearing of the attacker relative to the view (0 = dead ahead)
  if (fromPos) {
    const ang = Math.atan2(fromPos.x - player.pos.x, fromPos.z - player.pos.z);
    const bearing = ang - (yaw + Math.PI);
    const arc = document.createElement('div');
    arc.className = 'hurt-arc';
    arc.style.transform = `rotate(${(-bearing * 180 / Math.PI).toFixed(1)}deg)`;
    el('hurtdir').appendChild(arc);
    setTimeout(() => arc.remove(), 950);
  }
  updateHealth();
  if (player.hp <= 0) playerDie(attacker);
}
function playerDie(attacker) {
  player.alive = false;
  stats.deaths++; teamScore.t++;
  if (attacker && attacker.team) attacker.kills++;
  updateScore();
  const kn = attacker && attacker.name ? attacker.name : 'BOT';
  addKillFeed(kn, 'Sen', 't');
  el('deathBy').textContent = kn + ' seni öldürdü';
  el('deathOverlay').classList.add('show');
  setAim(false);
  setTimeout(() => {
    if (!player.alive) {
      respawnPlayer(); refillAmmo();
      player.protectUntil = time + 2;             // 2s of spawn protection
      showToast('🛡 Spawn koruması (2 sn)');
    }
    el('deathOverlay').classList.remove('show');
    updateHealth();
  }, 1600);
}

// Top every weapon's mag/reserve and clear any reload — called on respawn.
function refillAmmo() {
  for (const k in ammoState) {
    const a = ammoState[k];
    a.mag = WEAPONS[k].magMax; a.reserve = WEAPONS[k].reserveMax; a.reloading = false;
  }
  document.getElementById('ammo').classList.remove('reloading');
  updateAmmo();
}

// ---------- HUD updates ----------
const stats = { kills: 0, deaths: 0 };          // player's personal K/D
const teamScore = { ct: 0, t: 0 };              // kills this round, per team
const ROUND_LIMIT = 20;                         // first team to this many kills wins the round
const roundsWon = { ct: 0, t: 0 };
let roundOver = false, roundResetAt = 0;
const el = id => document.getElementById(id);

function startRoundEnd(winner) {
  roundOver = true; roundResetAt = time + 3.5;
  roundsWon[winner]++;
  el('rounds').textContent = roundsWon.ct + ' - ' + roundsWon.t;
  const txt = el('roundBannerText');
  txt.textContent = winner === 'ct' ? "TAKIMIN ROUND'U ALDI 🏆" : "DÜŞMAN ROUND'U ALDI";
  txt.className = 'big ' + winner;
  el('roundBanner').classList.add('show');
}
function resetRound() {
  roundOver = false;
  teamScore.ct = 0; teamScore.t = 0;
  el('roundBanner').classList.remove('show');
  for (const b of bots) spawnBot(b);
  respawnPlayer(); refillAmmo(); updateHealth(); updateScore();
}
function updateHealth() {
  const h = Math.max(0, Math.round(player.hp));
  el('health').textContent = h;
  el('health').classList.toggle('low', h <= 30);
  dmgflash.classList.toggle('lowhp', h > 0 && h <= 30);   // heartbeat vignette when critical
}
function updateAmmo() {
  const a = curAmmo();
  el('mag').textContent = a.mag;
  el('reserve').textContent = '∞';   // infinite reserve
}
function updateScore() {
  el('scoreCT').textContent = teamScore.ct;
  el('scoreT').textContent = teamScore.t;
  el('kd').textContent = stats.kills + ' / ' + stats.deaths;
  if (!roundOver) {
    if (teamScore.ct >= ROUND_LIMIT) startRoundEnd('ct');
    else if (teamScore.t >= ROUND_LIMIT) startRoundEnd('t');
  }
}
// ---------- Ally squad command (F / mobile button): follow the player or roam free ----------
let allyMode = 'free';
// formation slots around the player, one per allied bot
const FOLLOW_OFFSETS = [[-3, -2], [3, -2], [-1.6, 3], [1.6, 3]];
function toggleAllyMode() {
  allyMode = allyMode === 'free' ? 'follow' : 'free';
  showToast(allyMode === 'follow' ? '🫡 Müttefikler seni takip ediyor' : '🏃 Müttefikler serbest dolaşıyor');
  const sq = document.getElementById('btnSquad');
  if (sq) sq.classList.toggle('on', allyMode === 'follow');
}
let toastT = null;
function showToast(txt) {
  const t = el('toast');
  t.textContent = txt; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- Radar (rotates with the view; enemies show only when spotted) ----------
const radarCv = el('radar'), radarCtx = radarCv.getContext('2d');
const RADAR_RANGE = 45;
let radarNextDraw = 0;
function drawRadar() {
  const S = radarCv.width, C = S / 2, scale = (C - 8) / RADAR_RANGE;
  const ctx = radarCtx;
  ctx.clearRect(0, 0, S, S);
  // dial
  ctx.save();
  ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = 'rgba(8,12,16,.72)'; ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.beginPath(); ctx.moveTo(C, 4); ctx.lineTo(C, S - 4); ctx.moveTo(4, C); ctx.lineTo(S - 4, C); ctx.stroke();
  ctx.beginPath(); ctx.arc(C, C, (C - 8) / 2, 0, Math.PI * 2); ctx.stroke();
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const eye = controls.getObject().position;
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.team === 't' && time > (b.spottedUntil || 0)) continue;   // unspotted enemies hidden
    const dx = b.pos.x - player.pos.x, dz = b.pos.z - player.pos.z;
    const rx = dx * cy - dz * sy;                 // camera-space right
    const rf = -dx * sy - dz * cy;                // camera-space forward
    const px = C + rx * scale, py = C - rf * scale;
    if ((px - C) ** 2 + (py - C) ** 2 > (C - 6) ** 2) continue;     // outside dial
    ctx.fillStyle = b.team === 'ct' ? '#6db3ff' : '#ff5c3c';
    ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
  }
  // player arrow (always center, pointing up = view direction)
  ctx.fillStyle = '#3dff8b';
  ctx.beginPath(); ctx.moveTo(C, C - 6); ctx.lineTo(C - 4.5, C + 5); ctx.lineTo(C + 4.5, C + 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath(); ctx.arc(C, C, C - 2, 0, Math.PI * 2); ctx.stroke();
}

// ---------- Scoreboard (hold Tab / tap the scorebar) ----------
let sbVisible = false, sbRefreshAt = 0;
function renderScoreboard() {
  const rows = (team) => {
    const list = bots.filter(b => b.team === team).map(b => ({ name: b.name, k: b.kills, d: b.deaths, me: false }));
    if (team === 'ct') list.push({ name: 'Sen', k: stats.kills, d: stats.deaths, me: true });
    list.sort((a, b) => b.k - a.k);
    return list.map(r => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.k}</td><td>${r.d}</td></tr>`).join('');
  };
  el('sbCT').innerHTML = `<tr><th>TAKIM</th><th>K</th><th>D</th></tr>` + rows('ct');
  el('sbT').innerHTML = `<tr><th>DÜŞMAN</th><th>K</th><th>D</th></tr>` + rows('t');
}
function setScoreboard(on) {
  sbVisible = on;
  el('scoreboard').classList.toggle('show', on);
  if (on) { renderScoreboard(); sbRefreshAt = time + 0.5; }
}
addEventListener('keydown', e => { if (e.code === 'Tab') { e.preventDefault(); if (!sbVisible) setScoreboard(true); } });
addEventListener('keyup', e => { if (e.code === 'Tab') setScoreboard(false); });
el('scorebar').addEventListener('click', () => setScoreboard(!sbVisible));
el('scorebar').addEventListener('touchstart', e => { e.preventDefault(); setScoreboard(!sbVisible); }, { passive: false });

const killfeedEl = el('killfeed');
// killerSide: 'player' | 'ct' | 't' — colors the feed row's edge; 💀 marks headshots
function addKillFeed(killer, victim, killerSide, headshot) {
  const row = document.createElement('div');
  row.className = 'row ' + (killerSide === 'player' ? 'me' : killerSide);
  row.innerHTML = `<b>${killer}</b> ⟶ ${victim} <span style="opacity:.75">${headshot ? '💀' : '🎯'}</span>`;
  killfeedEl.prepend(row);
  setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 300); }, 3400);
  while (killfeedEl.children.length > 6) killfeedEl.lastChild.remove();
}

// ---------- Settings UI ----------
controls.pointerSpeed = settings.sens;
{
  const slider = el('sensSlider'), val = el('sensVal'), chk = el('soundChk');
  slider.value = settings.sens; val.textContent = settings.sens.toFixed(2);
  chk.checked = settings.sound;
  slider.addEventListener('input', () => {
    settings.sens = parseFloat(slider.value);
    val.textContent = settings.sens.toFixed(2);
    localStorage.setItem('awp.sens', String(settings.sens));
    if (!scoped) controls.pointerSpeed = settings.sens;
  });
  chk.addEventListener('change', () => {
    settings.sound = chk.checked;
    localStorage.setItem('awp.sound', settings.sound ? '1' : '0');
  });
  const diffBtns = document.querySelectorAll('.diffbtns button');
  const paintDiff = () => diffBtns.forEach(b => b.classList.toggle('on', b.dataset.d === settings.diff));
  paintDiff();
  diffBtns.forEach(b => b.addEventListener('click', () => {
    settings.diff = b.dataset.d;
    localStorage.setItem('awp.diff', settings.diff);
    paintDiff();
  }));
}

// ---------- Menu / pointer lock ----------
const menu = el('menu'), hud = el('hud');
el('loading').style.display = 'none';
function enterPlayUI() { menu.classList.add('hidden'); hud.classList.remove('hidden'); document.body.classList.add('playing'); }
function exitPlayUI() { menu.classList.remove('hidden'); hud.classList.add('hidden'); document.body.classList.remove('playing'); setAim(false); }
function startGame() {
  ensureAudio(); if (audioCtx.state === 'suspended') audioCtx.resume();
  if (isTouch) {
    // Mobile: no pointer lock — go fullscreen, try landscape, run via mobileActive
    mobileActive = true; enterPlayUI();
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen || (()=>{})).call(el)?.catch?.(()=>{});
    try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(()=>{}); } catch (e) {}
  } else {
    controls.lock();
  }
}
el('playBtn').addEventListener('click', startGame);
controls.addEventListener('lock', enterPlayUI);
controls.addEventListener('unlock', exitPlayUI);

// ---------- Main loop ----------
const clock = new THREE.Clock();

function update(dt) {
  time += dt;
  if (roundOver && time >= roundResetAt) resetRound();

  // ----- Player movement -----
  if (player.alive) {
    const wishCrouch = keys['ControlLeft'] || keys['ControlRight'] || mCrouch;
    player.crouch = wishCrouch && player.onGround;
    const targetEye = player.crouch ? EYE_CROUCH : EYE_STAND;
    player.eye += (targetEye - player.eye) * Math.min(1, dt * 12);

    // desired direction from camera yaw
    const forward = new THREE.Vector3(); camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const wish = new THREE.Vector3();
    if (keys['KeyW']) wish.add(forward);
    if (keys['KeyS']) wish.sub(forward);
    if (keys['KeyD']) wish.add(right);
    if (keys['KeyA']) wish.sub(right);
    if (joyActive) { wish.addScaledVector(right, moveVec.x); wish.addScaledVector(forward, moveVec.y); }
    const moving = wish.lengthSq() > 0;
    if (moving) wish.normalize();

    let speed = player.crouch ? CROUCH_SPEED : (keys['ShiftLeft'] || keys['ShiftRight']) ? WALK_SPEED : RUN_SPEED;
    if (joyActive) speed *= Math.min(1, joyMag);   // analog throttle from joystick push
    if (scoped && curW().walkWhileAiming) speed = Math.min(speed, WALK_SPEED);

    const accel = player.onGround ? 1 : AIR_CTRL;
    const desired = wish.multiplyScalar(speed);
    player.vel.x += (desired.x - player.vel.x) * Math.min(1, dt * 12 * accel);
    player.vel.z += (desired.z - player.vel.z) * Math.min(1, dt * 12 * accel);

    // jump
    if (wantJump && player.onGround) { player.vel.y = JUMP_V; player.onGround = false; }
    wantJump = false;

    // gravity
    player.vel.y -= GRAVITY * dt;

    // integrate horizontal with slide collisions (two passes to reduce corner sticking)
    player.pos.x += player.vel.x * dt;
    collideAxis(player.pos, RADIUS, Math.max(0.9, player.eye));
    player.pos.z += player.vel.z * dt;
    collideAxis(player.pos, RADIUS, Math.max(0.9, player.eye));

    // vertical
    player.pos.y += player.vel.y * dt;
    const g = groundHeight(player.pos, RADIUS);
    if (player.pos.y <= g) {
      player.pos.y = g; player.vel.y = 0; player.onGround = true;
    } else {
      player.onGround = false;
    }
    // ceiling clamp
    if (player.pos.y + player.eye > MAP.wallH - 0.3) { player.pos.y = MAP.wallH - 0.3 - player.eye; if (player.vel.y > 0) player.vel.y = 0; }

    // keep inside map
    const lim = MAP.hw - 1.2;
    player.pos.x = Math.max(-lim, Math.min(lim, player.pos.x));
    player.pos.z = Math.max(-MAP.hd + 1.2, Math.min(MAP.hd - 1.2, player.pos.z));
  }

  const co = controls.getObject();
  co.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);

  // continuous fire for automatic weapons while the trigger is held
  if (firing && player.alive && curW().auto) fireOnce();

  // aim recoil: layer onto the look, then auto-recover toward zero (delta-applied
  // so it composes with mouse/touch look without fighting it)
  const rc = Math.min(1, dt * curW().recover);
  recPitch -= recPitch * rc; recYaw -= recYaw * rc;
  const dP = recPitch - recAppP, dY = recYaw - recAppY;
  camera.rotation.x += dP; camera.rotation.y += dY;
  pitch += dP; yaw += dY;
  recAppP = recPitch; recAppY = recYaw;

  // viewmodel recover + sway/bob
  viewGroup.position.z += (-0.42 - viewGroup.position.z) * Math.min(1, dt * 10);
  const bob = player.onGround && (Math.abs(player.vel.x) + Math.abs(player.vel.z)) > 1 ? Math.sin(time * 10) * 0.012 : 0;
  viewGroup.position.y = -0.2 + bob;

  // reload finish (per active weapon)
  if (curAmmo().reloading && time >= curAmmo().reloadEnd) finishReload();

  // live-refresh the scoreboard while it's open
  if (sbVisible && time >= sbRefreshAt) { renderScoreboard(); sbRefreshAt = time + 0.5; }

  // footsteps: cadence follows speed; silent when crouch-walking slowly
  {
    const hSpeed = Math.hypot(player.vel.x, player.vel.z);
    if (player.alive && player.onGround && hSpeed > 2.8) {
      if (time >= (player.nextStep || 0)) {
        playStep(hSpeed > 5.5);
        player.nextStep = time + (hSpeed > 5.5 ? 0.32 : 0.46);
      }
    }
  }

  // crosshair spread mirrors recoil + movement inaccuracy
  {
    const moving = player.onGround && (Math.abs(player.vel.x) + Math.abs(player.vel.z)) > 2.5;
    const spread = 1 + Math.min(1.2, recPitch * 14) + (moving ? 0.22 : 0);
    el('crosshair').style.transform = `translate(-50%,-50%) scale(${spread.toFixed(3)})`;
  }
  // reload progress bar
  {
    const a = curAmmo(), bar = el('reloadBar');
    if (a.reloading) {
      bar.classList.add('show');
      const p = 1 - (a.reloadEnd - time) / curW().reloadTime;
      el('reloadFill').style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
    } else bar.classList.remove('show');
  }

  // radar: spot enemies (LOS from player eye, ~5Hz staggered) and redraw ~15Hz
  if (time >= radarNextDraw) {
    radarNextDraw = time + 0.066;
    const eye = co.position;
    for (const b of bots) {
      if (b.team !== 't' || !b.alive) continue;
      if (time > (b.nextSpotCheck || 0)) {
        b.nextSpotCheck = time + 0.2 + Math.random() * 0.1;
        const hp2 = b.head.getWorldPosition(new THREE.Vector3());
        if (losClear(eye, hp2, 60)) b.spottedUntil = time + 1.6;
      }
    }
    drawRadar();
  }

  // ----- Bots (5v5: both teams think, move, fight each other) -----
  for (const bot of bots) {
    // death animation: tip over from the feet, then hide until respawn
    if (bot.dying) {
      const p = Math.min(1, (time - bot.deathStart) / 0.45);
      bot.group.rotation.x = bot.fallDir * p * 1.45;
      bot.group.rotation.y = bot.yaw + p * 0.6 * bot.fallDir;
      if (time - bot.deathStart > 1.1) { bot.dying = false; bot.group.visible = false; }
      continue;
    }
    if (!bot.alive) {
      if (time >= bot.respawnAt) spawnBot(bot);
      continue;
    }

    // Think at ~5Hz: pick nearest visible enemy (bots + player for T side)
    if (time >= bot.nextThink) {
      bot.nextThink = time + 0.18 + Math.random() * 0.1;
      const from = bot.head.getWorldPosition(new THREE.Vector3());
      let best = null, bestD = Infinity;
      for (const cand of enemiesOf(bot)) {
        const tp = eyeOf(cand);
        const d = from.distanceTo(tp);
        if (d < bestD && losClear(from, tp)) { best = cand; bestD = d; }
      }
      // in follow mode allies act as close protection: ignore enemies beyond 25m
      if (best && bot.team === 'ct' && allyMode === 'follow' && bestD > 25) best = null;
      if (best) { bot.enemy = best; bot.state = 'engage'; bot.lastSeen = time; }
      else if (bot.state === 'engage' && time - bot.lastSeen > (bot.team === 'ct' && allyMode === 'follow' ? 0.4 : 2.5)) { bot.state = 'patrol'; bot.enemy = null; }
    }
    if (bot.enemy && !aliveTarget(bot.enemy)) { bot.enemy = null; if (bot.state === 'engage') bot.state = 'patrol'; }

    let move = new THREE.Vector3();
    bot.aimPitch = 0;
    if (bot.state === 'engage' && bot.enemy) {
      const tPos = eyeOf(bot.enemy);
      const toT = tPos.clone().sub(bot.pos);
      const flat = toT.clone(); flat.y = 0;
      const distT = flat.length();
      bot.yaw = Math.atan2(flat.x, flat.z);
      // torso pitch so the rifle points at the target (up/down on crates)
      bot.aimPitch = Math.max(-0.55, Math.min(0.55, Math.atan2(toT.y - 1.4, distT)));
      // keep mid range + strafe
      const strafe = Math.sin(time * 1.5 + bot.walkPhase);
      const dir = flat.normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      if (distT > 30) move.add(dir);
      else if (distT < 10) move.sub(dir);
      move.add(side.multiplyScalar(strafe * 0.7));
      // shoot only with a live LOS at trigger time
      if (time >= bot.nextShot) {
        const from = bot.head.getWorldPosition(new THREE.Vector3());
        if (losClear(from, tPos)) {
          botShootAt(bot, bot.enemy);
          // difficulty only paces shots aimed at the player
          const rate = (bot.enemy === 'player') ? diff().rate : 1;
          bot.nextShot = time + (0.9 + Math.random() * 0.8) * rate;
          bot.lastSeen = time;
        }
      }
    } else {
      // patrol: allies in follow mode hold formation around the player, else roam
      if (bot.team === 'ct' && allyMode === 'follow') {
        const slot = FOLLOW_OFFSETS[bots.filter(b => b.team === 'ct').indexOf(bot) % FOLLOW_OFFSETS.length];
        bot.target.set(player.pos.x + slot[0], 0, player.pos.z + slot[1]);
      }
      const toT = bot.target.clone().sub(bot.pos); toT.y = 0;
      if (toT.length() < 1.5) { if (!(bot.team === 'ct' && allyMode === 'follow')) pickPatrol(bot); }
      else { bot.yaw = Math.atan2(toT.x, toT.z); move.add(toT.normalize()); }
    }

    // move with simple collision (slide against boxes)
    const spd = bot.state === 'engage' ? 4.4 : 2.8;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(spd);
    bot.moveAmt += ((move.lengthSq() > 0 ? 1 : 0) - bot.moveAmt) * Math.min(1, dt * 8);
    bot.pos.x += move.x * dt; botCollide(bot);
    bot.pos.z += move.z * dt; botCollide(bot);
    // clamp inside
    bot.pos.x = Math.max(-MAP.hw + 1, Math.min(MAP.hw - 1, bot.pos.x));
    bot.pos.z = Math.max(-MAP.hd + 1, Math.min(MAP.hd - 1, bot.pos.z));
    // ground for bot (stand on boxes too)
    bot.pos.y = groundHeight(bot.pos, 0.4);
  }

  // gentle separation so bots don't merge into one blob
  for (let i = 0; i < bots.length; i++) {
    const a = bots[i]; if (!a.alive) continue;
    for (let j = i + 1; j < bots.length; j++) {
      const b = bots[j]; if (!b.alive) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.81 && d2 > 0.0001) {
        const d = Math.sqrt(d2), push = (0.9 - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
      }
    }
  }

  // apply transforms + rig animation
  for (const bot of bots) {
    if (!bot.alive && !bot.dying) continue;
    bot.group.position.copy(bot.pos);
    if (!bot.dying) {
      bot.group.rotation.y = bot.yaw;
      // torso aims up/down at the target; a hit adds a short flinch jerk on top
      const flinch = Math.max(0, 1 - (time - (bot.flinchT ?? -9)) / 0.2);
      bot.torsoG.rotation.x += (-bot.aimPitch - bot.torsoG.rotation.x) * Math.min(1, dt * 10);
      if (flinch > 0) {
        bot.torsoG.rotation.x -= flinch * 0.22;
        bot.torsoG.rotation.z = Math.sin(time * 55) * flinch * 0.1;
      } else bot.torsoG.rotation.z = 0;
      // walk cycle scaled by how much the bot is actually moving
      const swing = Math.sin(time * 9 + bot.walkPhase) * 0.55 * bot.moveAmt;
      bot.legs[0].rotation.x = swing; bot.legs[1].rotation.x = -swing;
      // arms keep the rifle up; add a tiny counter-sway while walking
      bot.arms[0].rotation.x = -1.15 + swing * 0.08;
      bot.arms[1].rotation.x = -1.25 - swing * 0.08;
    }
  }

  // ----- Effects -----
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i]; e.life -= dt;
    if (e.type === 'fade') e.mat.opacity = Math.max(0, e.life / e.max) * 0.85;
    if (e.type === 'particles') {
      const pos = e.geo.attributes.position.array;
      for (let j = 0; j < e.vel.length; j++) {
        e.vel[j].y -= 12 * dt;
        pos[j*3] += e.vel[j].x * dt; pos[j*3+1] += e.vel[j].y * dt; pos[j*3+2] += e.vel[j].z * dt;
      }
      e.geo.attributes.position.needsUpdate = true;
      e.mat.opacity = Math.max(0, e.life / e.max);
    }
    if (e.life <= 0) { scene.remove(e.obj); e.obj.geometry.dispose(); e.mat.dispose(); effects.splice(i, 1); }
  }
}

function botCollide(bot) {
  for (const c of colliders) {
    const b = c.box;
    const feet = bot.pos.y, top = bot.pos.y + 1.7;
    if (top < b.min.y || feet > b.max.y) continue;
    if (b.max.y - feet <= STEP + 0.3 && b.max.y > 0) continue;
    const r = 0.42;
    const cx = Math.max(b.min.x, Math.min(bot.pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(bot.pos.z, b.max.z));
    const dx = bot.pos.x - cx, dz = bot.pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) { const d = Math.sqrt(d2) || 0.0001; const push = r - d; bot.pos.x += (dx/d)*push; bot.pos.z += (dz/d)*push; }
  }
}


function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  if (isActive()) update(dt);
  // scope zoom
  const targetFov = scoped ? curW().adsFov : BASE_FOV;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 16);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
}
updateHealth(); updateAmmo(); updateScore(); updateWeaponName();
animate();

// ---------- Diagnostics (used only by automated smoke test; harmless in play) ----------
window.__diag = () => ({
  bots: bots.length, aliveBots: bots.filter(b => b.alive).length,
  ct: bots.filter(b => b.team === 'ct' && b.alive).length, t: bots.filter(b => b.team === 't' && b.alive).length,
  scoreCT: teamScore.ct, scoreT: teamScore.t,
  colliders: colliders.length, hp: player.hp, weapon: curW().name, curKey, mag: curAmmo().mag, recoil: +recPitch.toFixed(3),
});
window.__switch = switchWeapon;
window.__hold = (on) => { firing = !!on; };
window.__advance = (n) => { for (let i = 0; i < n; i++) update(1 / 60); };   // pure loop steps (no injected fire/reload)
window.__reload = () => startReload();
window.__forceScore = (ct, t) => { teamScore.ct = ct; teamScore.t = t; updateScore(); };
window.__hurt = (dmg) => damagePlayer(dmg, new THREE.Vector3(0, 1.5, -10), bots.find(b => b.team === 't'));
window.__roundInfo = () => ({ roundOver, rounds: el('rounds').textContent, ct: teamScore.ct, t: teamScore.t });
window.__teleport = (x, z, yw, pt) => { player.pos.set(x, 0, z); yaw = yw || 0; pitch = pt || 0; camera.rotation.set(pitch, yaw, 0); };
window.__botInfo = () => bots.map(b => ({ team: b.team, name: b.name, alive: b.alive, x: +b.pos.x.toFixed(1), z: +b.pos.z.toFixed(1) }));
window.__setScope = setAim;
window.__yawProbe = () => yaw;
window.__moveProbe = () => ({ x: moveVec.x, y: moveVec.y, mag: joyMag });
window.__forceStep = (n) => {
  for (let i = 0; i < n; i++) {
    // exercise movement + shooting + bot AI paths without pointer lock
    keys['KeyW'] = i % 2 === 0; keys['KeyD'] = i % 3 === 0;
    if (i % 20 === 0) { wantJump = true; }
    if (i % 15 === 0) { curAmmo().lastShot = -99; fireOnce(); }
    if (i % 40 === 0) startReload();
    update(1 / 60);
  }
  keys['KeyW'] = keys['KeyD'] = false;
};

// ---------- Resize ----------
addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__ready = true;
window.__step && window.__step('ready');
window.__bootDone && window.__bootDone();

