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
if (isTouch) document.body.classList.add('mobile');

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
sun.shadow.mapSize.set(2048, 2048);
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

// ---------- Audio (WebAudio synth) ----------
let audioCtx = null;
function ensureAudio() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
function playShot(big = true, vol = 0.5) {
  if (!audioCtx) return;
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
  if (!audioCtx) return;
  const t = audioCtx.currentTime, o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'square'; o.frequency.value = 900; g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.05);
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
const SPAWNS = [
  new THREE.Vector3(0, 0, 42), new THREE.Vector3(-42, 0, -40), new THREE.Vector3(42, 0, 40),
  new THREE.Vector3(-42, 0, 40), new THREE.Vector3(42, 0, -40), new THREE.Vector3(0, 0, -42),
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

// muzzle flash sprite (shared; repositioned per weapon)
const flashMat = new THREE.SpriteMaterial({ color: 0xffdd88, transparent: true, opacity: 0, depthTest: false });
const flash = new THREE.Sprite(flashMat); flash.scale.set(0.5, 0.5, 0.5); flash.position.set(0, 0.05, -1.15);
viewGroup.add(flash);

function updateViewmodel() {
  awpModel.visible = curKey === 'awp';
  akModel.visible = curKey === 'ak';
  flash.position.z = curKey === 'awp' ? -1.45 : -1.15;
}
updateViewmodel();

// ---------- Bots ----------
const BOT_COUNT = 5;
const bots = [];
const botMatBody = () => new THREE.MeshStandardMaterial({ color: 0xb23a2a, roughness: 0.7, metalness: 0.1 });
const botMatDark = () => new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8 });
const botMatHead = () => new THREE.MeshStandardMaterial({ color: 0xd9b48f, roughness: 0.8 });

function makeBot() {
  const g = new THREE.Group();
  const skin = botMatHead(), cloth = botMatBody(), dark = botMatDark();
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.34), cloth); torso.position.y = 1.15;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.32), dark); hips.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skin); head.position.y = 1.75;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.4), dark); helmet.position.y = 1.9;
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), cloth); lArm.position.set(-0.4, 1.15, 0);
  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.16), cloth); rArm.position.set(0.4, 1.15, 0);
  const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), dark); lLeg.position.set(-0.16, 0.35, 0);
  const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.75, 0.2), dark); rLeg.position.set(0.16, 0.35, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.7), dark); gun.position.set(0.3, 1.2, -0.35);
  [torso, hips, head, helmet, lArm, rArm, lLeg, rLeg, gun].forEach(m => { m.castShadow = true; g.add(m); });

  // health bar sprite
  const hbCanvas = document.createElement('canvas'); hbCanvas.width = 64; hbCanvas.height = 8;
  const hbTex = new THREE.CanvasTexture(hbCanvas);
  const hbMat = new THREE.SpriteMaterial({ map: hbTex, depthTest: false, transparent: true });
  const hbSprite = new THREE.Sprite(hbMat); hbSprite.position.set(0, 2.3, 0); hbSprite.scale.set(1.1, 0.14, 1); g.add(hbSprite);

  scene.add(g);
  const bot = {
    group: g, head, torso, legs: [lLeg, rLeg], arms: [lArm, rArm],
    hp: 100, alive: true, respawnAt: 0,
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    target: new THREE.Vector3(), lastSeen: 0, nextShot: 0, state: 'patrol',
    walkPhase: Math.random() * 6,
    hbCanvas, hbCtx: hbCanvas.getContext('2d'), hbTex, hbSprite,
    yaw: 0,
  };
  bots.push(bot);
  spawnBot(bot);
  return bot;
}
function spawnBot(bot) {
  let p; let tries = 0;
  do {
    p = new THREE.Vector3((Math.random() - 0.5) * (MAP.hw * 2 - 8), 0, (Math.random() - 0.5) * (MAP.hd * 2 - 8));
    tries++;
  } while (tries < 30 && (p.distanceTo(player.pos) < 22 || pointBlocked(p)));
  bot.pos.copy(p); bot.hp = 100; bot.alive = true; bot.group.visible = true;
  bot.state = 'patrol'; pickPatrol(bot); bot.nextShot = time + 1;
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
for (let i = 0; i < BOT_COUNT; i++) makeBot();

// gather bot hit meshes for raycasting
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
  const sens = scoped ? (curW().scope ? 0.0016 : 0.0028) : 0.0042;
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
bindBtn('btnFire', () => { firing = true; if (!curW().auto) fireOnce(); }, () => { firing = false; });
bindBtn('btnScope', (b) => { setAim(!scoped); b.classList.toggle('on', scoped); });
bindBtn('btnReload', () => startReload());
bindBtn('btnJump', () => { wantJump = true; });
bindBtn('btnCrouch', (b) => { mCrouch = !mCrouch; b.classList.toggle('on', mCrouch); });
bindBtn('btnSwap', () => switchWeapon(curKey === 'ak' ? 'awp' : 'ak'));

function setAim(on) {
  scoped = on;
  const useScope = on && curW().scope;             // full scope overlay only for AWP
  document.getElementById('scope').classList.toggle('on', useScope);
  document.getElementById('crosshair').classList.toggle('hidden', on);
  document.getElementById('dot').style.display = useScope ? 'none' : 'block';
  viewGroup.visible = !useScope;
  controls.pointerSpeed = on ? (curW().scope ? 0.35 : 0.62) : 1.0;
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
  if (!player.alive) return;
  const w = curW(), a = curAmmo();
  if (a.reloading) return;
  if (time - a.lastShot < w.fireDelay) return;
  if (a.mag <= 0) { startReload(); return; }
  a.lastShot = time; a.mag--; updateAmmo();
  ensureAudio(); playShot(w.sndBig, w.sndVol);
  // muzzle flash + viewmodel kick + aim recoil
  flashMat.opacity = 1; flash.scale.setScalar((w.scope ? 0.5 : 0.35) + Math.random() * 0.25);
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
      const head = h.object.userData.part === 'head';
      damageBot(bot, head ? w.dmgHead : w.dmgBody, head);
      showHitmarker(bot.hp <= 0);
    } else {
      spawnImpact(h.point, h.face ? h.face.normal : null);
    }
  }
  spawnTracer(raycaster.ray.origin, raycaster.ray.direction, hits.length ? hits[0].distance : 200);
}

function showHitmarker(kill) {
  hitmarkerEl.classList.toggle('kill', kill);
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
  const take = Math.min(w.magMax - a.mag, a.reserve);
  a.mag += take; a.reserve -= take; a.reloading = false;
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
  const n = 14, arr = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) { arr[i*3]=point.x; arr[i*3+1]=point.y; arr[i*3+2]=point.z; vel.push(new THREE.Vector3((Math.random()-.5)*5,(Math.random())*5,(Math.random()-.5)*5)); }
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({ color: 0xaa1010, size: 0.16, transparent: true });
  const pts = new THREE.Points(geo, mat); scene.add(pts);
  effects.push({ obj: pts, mat, geo, vel, life: 0.5, max: 0.5, type: 'particles' });
}

// ---------- Bot combat ----------
function damageBot(bot, dmg, head) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  spawnBlood((head ? bot.head : bot.torso).getWorldPosition(new THREE.Vector3()));
  if (bot.hp <= 0) { killBot(bot); }
  else updateBotHealthbar(bot);
}
function killBot(bot) {
  bot.alive = false; bot.group.visible = false; bot.respawnAt = time + 2.2;
  stats.kills++; updateScore();
  addKillFeed('Sen', 'BOT', true);
  ensureAudio();
}
function updateBotHealthbar(bot) {
  const ctx = bot.hbCtx;
  ctx.clearRect(0, 0, 64, 8);
  ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, 64, 8);
  const p = Math.max(0, bot.hp / 100);
  ctx.fillStyle = p > 0.5 ? '#3dff8b' : p > 0.25 ? '#ffcc4d' : '#ff4d4d';
  ctx.fillRect(1, 1, 62 * p, 6);
  bot.hbTex.needsUpdate = true;
}

function botCanSee(bot, eyePos) {
  const from = bot.head.getWorldPosition(new THREE.Vector3());
  const dir = eyePos.clone().sub(from);
  const dist = dir.length(); dir.normalize();
  if (dist > 70) return false;
  raycaster.set(from, dir);
  raycaster.far = dist - 0.4;
  const hits = raycaster.intersectObjects(colliderMeshes, false);
  raycaster.far = Infinity;
  return hits.length === 0;
}

function botShoot(bot, eyePos) {
  ensureAudio();
  const from = bot.head.getWorldPosition(new THREE.Vector3());
  const dist = from.distanceTo(eyePos);
  // accuracy: worse at range and if player moving fast; bots are "smart but fair"
  const spread = 0.045 + dist * 0.0026 + player.vel.length() * 0.004;
  const hitChance = Math.max(0.14, Math.min(0.72, 0.8 - dist * 0.008));
  playShot(false, 0.28 * Math.max(0.2, 1 - dist / 80));
  // tracer from bot
  const dir = eyePos.clone().sub(from).normalize();
  dir.x += (Math.random() - 0.5) * spread; dir.y += (Math.random() - 0.5) * spread; dir.z += (Math.random() - 0.5) * spread;
  spawnTracer(from, dir.normalize(), dist);
  if (Math.random() < hitChance) {
    const dmg = 14 + Math.random() * 16;
    damagePlayer(dmg, from);
  }
}

// ---------- Player damage ----------
const dmgflash = document.getElementById('dmgflash');
function damagePlayer(dmg, fromPos) {
  if (!player.alive) return;
  player.hp -= dmg;
  dmgflash.style.boxShadow = 'inset 0 0 160px 50px rgba(180,0,0,.55)';
  clearTimeout(dmgflash._t); dmgflash._t = setTimeout(() => dmgflash.style.boxShadow = 'inset 0 0 160px 40px rgba(180,0,0,0)', 120);
  updateHealth();
  if (player.hp <= 0) playerDie();
}
function playerDie() {
  player.alive = false;
  stats.deaths++; updateScore();
  addKillFeed('BOT', 'Sen', false);
  setAim(false);
  setTimeout(() => { if (!player.alive) respawnPlayer(); updateHealth(); }, 1400);
}

// ---------- HUD updates ----------
const stats = { kills: 0, deaths: 0 };
const el = id => document.getElementById(id);
function updateHealth() {
  const h = Math.max(0, Math.round(player.hp));
  el('health').textContent = h;
  el('health').classList.toggle('low', h <= 30);
}
function updateAmmo() {
  const a = curAmmo();
  el('mag').textContent = a.mag;
  el('reserve').textContent = a.reserve;
}
function updateScore() {
  el('kills').textContent = stats.kills;
  el('deaths').textContent = stats.deaths;
  el('enemies').textContent = bots.filter(b => b.alive).length;
}
const killfeedEl = el('killfeed');
function addKillFeed(killer, victim, byPlayer) {
  const row = document.createElement('div');
  row.className = 'row' + (byPlayer ? '' : ' dead');
  row.innerHTML = `<b>${killer}</b> ⟶ ${victim} <span style="opacity:.6">🎯</span>`;
  killfeedEl.prepend(row);
  setTimeout(() => { row.style.opacity = '0'; setTimeout(() => row.remove(), 300); }, 3200);
  while (killfeedEl.children.length > 5) killfeedEl.lastChild.remove();
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
  flashMat.opacity *= (1 - Math.min(1, dt * 18));

  // reload finish (per active weapon)
  if (curAmmo().reloading && time >= curAmmo().reloadEnd) finishReload();

  // ----- Bots -----
  const eyePos = co.position.clone();
  let visibleEnemies = 0;
  for (const bot of bots) {
    if (!bot.alive) {
      if (time >= bot.respawnAt) spawnBot(bot);
      continue;
    }
    visibleEnemies++;
    const toPlayer = eyePos.clone().sub(bot.pos); toPlayer.y = 0;
    const distP = toPlayer.length();
    const canSee = player.alive && botCanSee(bot, eyePos);
    if (canSee) { bot.state = 'engage'; bot.lastSeen = time; }
    else if (bot.state === 'engage' && time - bot.lastSeen > 3) bot.state = 'patrol';

    let move = new THREE.Vector3();
    if (bot.state === 'engage') {
      // face player
      bot.yaw = Math.atan2(toPlayer.x, toPlayer.z);
      // keep mid range: approach if far, back off if close, strafe
      const strafe = Math.sin(time * 1.5 + bot.walkPhase) ;
      const dir = toPlayer.clone().normalize();
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      if (distP > 30) move.add(dir).multiplyScalar(1);
      else if (distP < 12) move.sub(dir);
      move.add(side.multiplyScalar(strafe * 0.7));
      if (canSee && time >= bot.nextShot) {
        botShoot(bot, eyePos.clone());
        bot.nextShot = time + 0.9 + Math.random() * 0.8;
      }
    } else {
      // patrol toward target
      const toT = bot.target.clone().sub(bot.pos); toT.y = 0;
      if (toT.length() < 1.5) pickPatrol(bot);
      else { bot.yaw = Math.atan2(toT.x, toT.z); move.add(toT.normalize()); }
    }

    // move with simple collision (slide against boxes)
    const spd = bot.state === 'engage' ? 4.4 : 2.6;
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(spd);
    bot.pos.x += move.x * dt; botCollide(bot);
    bot.pos.z += move.z * dt; botCollide(bot);
    // clamp inside
    bot.pos.x = Math.max(-MAP.hw + 1, Math.min(MAP.hw - 1, bot.pos.x));
    bot.pos.z = Math.max(-MAP.hd + 1, Math.min(MAP.hd - 1, bot.pos.z));
    // ground for bot (stand on boxes too)
    bot.pos.y = groundHeight(bot.pos, 0.4);

    bot.group.position.copy(bot.pos);
    bot.group.rotation.y = bot.yaw;
    // leg walk animation
    const wobble = (Math.abs(move.x) + Math.abs(move.z)) > 0.5 ? Math.sin(time * 9 + bot.walkPhase) * 0.5 : 0;
    bot.legs[0].rotation.x = wobble; bot.legs[1].rotation.x = -wobble;
    // healthbar faces cam
    updateBotHealthbar(bot);
  }
  el('enemies').textContent = bots.filter(b => b.alive).length;

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
window.__diag = () => ({ bots: bots.length, aliveBots: bots.filter(b => b.alive).length, colliders: colliders.length, hp: player.hp, weapon: curW().name, curKey, mag: curAmmo().mag, recoil: +recPitch.toFixed(3) });
window.__switch = switchWeapon;
window.__hold = (on) => { firing = !!on; };
window.__advance = (n) => { for (let i = 0; i < n; i++) update(1 / 60); };   // pure loop steps (no injected fire/reload)
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

