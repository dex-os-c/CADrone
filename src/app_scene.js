/* =====================================================================
   MEDVAYU H6 · app_scene.js
   Renderer, lighting, image-based reflections, studio floor, terrain world,
   drone rigs (model + simulation), camera tweening, picking, render loop.
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const L = hex => new THREE.Color(hex).convertSRGBToLinear();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/* ---------- global app state ---------- */
const S = {
  theme: 'light', tab: 'design', stage: 'design', env: Object.assign({}, Phys.DEFAULT_ENV, { h: 4000 }),
  explode: 0, selected: null, labels: false, wire: false, spin: true, hidden: new Set(),
  flightVeh: 'hex', wind: 0, running: true, tourStep: -1, hooks: []
};
const W = { stage: $('#stage'), canvas: null, renderer: null, scene: null, camera: null, controls: null };

/* ---------- renderer, scene, camera ---------- */
(function initRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  W.stage.insertBefore(r.domElement, W.stage.firstChild); W.canvas = r.domElement; W.renderer = r;
  W.scene = new THREE.Scene();
  W.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 4000);
  W.camera.position.set(2.9, 1.7, -3.9);
  W.controls = new THREE.OrbitControls(W.camera, W.canvas);
  Object.assign(W.controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 0.8, maxDistance: 60, maxPolarAngle: Math.PI * 0.495, rotateSpeed: 0.7, zoomSpeed: 0.8, screenSpacePanning: true });
  W.controls.target.set(0, 0.45, 0);
})();

const MATS = makeMaterials();
const sky = makeSky(); W.scene.add(sky);

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(0xffffff, 0x8899a0, 0.8); W.scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
W.scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x9fd8ff, 0.7); rim.position.set(-6, 3, -8); W.scene.add(rim);
function setShadowBox(half, near, far) { const c = sun.shadow.camera; c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = near; c.far = far; c.updateProjectionMatrix(); }
const SUNDIR = new THREE.Vector3(0.45, 0.8, 0.38).normalize();

/* ---------- reflections: PMREM of a sky plus soft-boxes ---------- */
let pmrem = new THREE.PMREMGenerator(W.renderer), envRT = null;
function buildEnv(theme) {
  const t = SKY_THEMES[theme], es = new THREE.Scene();
  const dome = makeSky(); applySky(dome, theme); es.add(dome);
  const box = (w, h, pos, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); es.add(m); };
  const k = theme === 'dark' ? 2.2 : 3.6;
  box(30, 6, new THREE.Vector3(0, 30, 0), k); box(4, 26, new THREE.Vector3(26, 10, 6), k * 0.8); box(4, 22, new THREE.Vector3(-24, 8, -10), k * 0.5); box(26, 3, new THREE.Vector3(0, 6, 30), k * 0.35);
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(es, 0.02); W.scene.environment = envRT.texture;
  es.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
}

/* ---------- studio floor ---------- */
const studio = new THREE.Group(); W.scene.add(studio);
const floorMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
const floor = new THREE.Mesh(new THREE.CircleGeometry(6.2, 64), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.renderOrder = -1; studio.add(floor);
const shadowCatch = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.28 })); shadowCatch.rotation.x = -Math.PI / 2; shadowCatch.position.y = 0.004; shadowCatch.receiveShadow = true; studio.add(shadowCatch);
function setStudioTheme(theme) { if (floorMat.map) floorMat.map.dispose(); floorMat.map = studioFloorTexture(theme); floorMat.needsUpdate = true; }

/* ---------- terrain world (flight view) ---------- */
const world = new THREE.Group(); world.visible = false; W.scene.add(world);
const WORLD = { windsock: null, dust: null, trees: null, ground: null };
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v); }
function fbm(x, y, o = 5) { let a = 0.5, f = 1, s = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
function terrainH(x, z) {
  const d = Math.hypot(x, z), flat = clamp((d - 28) / 60, 0, 1), flat2 = flat * flat * (3 - 2 * flat);
  const rolling = (fbm(x * 0.006, z * 0.006, 4) - 0.35) * 22;
  const far = clamp((d - 220) / 700, 0, 1), ridge = 1 - Math.abs(fbm(x * 0.0022 + 9, z * 0.0022 - 4, 5) * 2 - 1);
  const mount = far * far * (Math.pow(ridge, 1.6) * 520 + fbm(x * 0.01, z * 0.01, 3) * 60);
  return (rolling + mount) * flat2;
}
function buildWorld(theme) {
  while (world.children.length) { const c = world.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); }
  const N = 200, SZ = 3000, geo = new THREE.PlaneGeometry(SZ, SZ, N, N); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), dark = theme === 'dark';
  const cGrass = L(dark ? 0x2a3f31 : 0x6f8f5c), cDry = L(dark ? 0x3d3f36 : 0x9c9170), cRock = L(dark ? 0x56606a : 0x80858a), cSnow = L(dark ? 0xc4d2de : 0xf4f7fa), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainH(x, z); p.setY(i, h);
    const n = fbm(x * 0.02, z * 0.02, 3);
    tmp.copy(cGrass).lerp(cDry, clamp(n * 1.2 + h / 90 - 0.2, 0, 1)).lerp(cRock, clamp((h - 90) / 120, 0, 1)).lerp(cSnow, clamp((h - 260 + n * 80) / 70, 0, 1));
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })); ground.receiveShadow = true; world.add(ground); WORLD.ground = ground;
  // Landing pad with perimeter lights
  const pad = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ map: padTexture(), roughness: 0.85 })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.02; pad.receiveShadow = true; world.add(pad);
  const ledM = new THREE.MeshBasicMaterial({ color: L(0xffb347) });
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, l = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), ledM); l.position.set(Math.cos(a) * 4.15, 0.07, Math.sin(a) * 4.15); world.add(l); }
  // Trees (instanced cone + trunk) on low, gentle ground
  const treeN = 520, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 2, 6), new THREE.MeshStandardMaterial({ color: L(dark ? 0x2a1f18 : 0x5a4130), roughness: 1 }), treeN);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 6, 7), new THREE.MeshStandardMaterial({ color: L(dark ? 0x153a26 : 0x2f6b3f), roughness: 0.9 }), treeN);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(); let k = 0;
  for (let i = 0; i < 6000 && k < treeN; i++) {
    const a = hash2(i, 1.7) * Math.PI * 2, d = 22 + Math.pow(hash2(i, 9.1), 0.7) * 380, x = Math.cos(a) * d, z = Math.sin(a) * d, h = terrainH(x, z);
    if (h > 55 || fbm(x * 0.012, z * 0.012, 3) < 0.5) continue;
    const s = 0.7 + hash2(i, 3.3) * 1.1; sc.set(s, s, s); ps.set(x, h + 1 * s, z); M.compose(ps, q, sc); trunk.setMatrixAt(k, M);
    ps.set(x, h + 4.2 * s, z); M.compose(ps, q, sc); crown.setMatrixAt(k, M); k++;
  }
  trunk.count = crown.count = k; trunk.castShadow = crown.castShadow = true; world.add(trunk, crown);
  // Windsock
  const ws = new THREE.Group(), pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4.5, 8), MATS.alu); pole.position.y = 2.25; ws.add(pole);
  const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.1, 1.6, 16, 1, true), new THREE.MeshStandardMaterial({ color: L(0xff7a2f), side: THREE.DoubleSide, roughness: 0.8 }));
  sock.geometry.translate(0, -0.8, 0); const hinge = new THREE.Group(); hinge.add(sock); const sockPivot = new THREE.Group(); sockPivot.position.y = 4.4; sockPivot.rotation.y = -Math.PI / 4; sockPivot.add(hinge); ws.add(sockPivot); ws.position.set(7, 0, -6); ws.traverse(o => { if (o.isMesh) o.castShadow = true; }); world.add(ws); WORLD.windsock = hinge;
  // Rotor-wash dust
  const dg = new THREE.BufferGeometry(), dn = 360; dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dn * 3), 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: L(dark ? 0x8fa0a8 : 0xc9bda5), size: 0.35, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true })); dust.frustumCulled = false; world.add(dust);
  WORLD.dust = { pts: dust, n: dn, seed: new Float32Array(dn * 2).map((_, i) => hash2(i, 5.5)) };
}

/* ---------- drone rigs ---------- */
const DRONES = {};
for (const id of ['hex', 'quad']) { const veh = Phys.VEH[id], d = buildDrone(veh, MATS, Phys.layout(veh)); DRONES[id] = d; W.scene.add(d.group); d.discs.forEach(x => { x.raycast = () => { }; }); d.labels.forEach(l => { l.raycast = () => { }; }); }
DRONES.quad.group.visible = false;

const sim = new FlightSim(THREE, Phys);                       // main rig, hex or quad
const sim2 = new FlightSim(THREE, Phys);                      // second rig for the compare race
let simCmp = { on: false, tFail: null };
const trail = (() => { const g = new THREE.BufferGeometry(), a = new Float32Array(900 * 3); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setDrawRange(0, 0); const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff7a2f })); l.frustumCulled = false; l.visible = false; W.scene.add(l); return { line: l, a, n: 0, last: new THREE.Vector3(1e9, 0, 0) }; })();
function pushTrail(p) { if (trail.last.distanceToSquared(p) < 0.04) return; trail.last.copy(p); if (trail.n >= 900) { trail.a.copyWithin(0, 3); trail.n = 899; } trail.a.set([p.x, p.y, p.z], trail.n * 3); trail.n++; trail.line.geometry.setDrawRange(0, trail.n); trail.line.geometry.attributes.position.needsUpdate = true; }
function clearTrail() { trail.n = 0; trail.line.geometry.setDrawRange(0, 0); trail.last.set(1e9, 0, 0); }

let spinPhase = 0;
function spinProps(drone, forces, hoverF, dt, always) {
  for (let i = 0; i < drone.props.length; i++) {
    const pr = drone.props[i], f = forces ? forces[i] : hoverF, k = clamp(f / hoverF, 0, 1.8);
    const w = always ? 16 * Math.sqrt(k) : 12;            // visual rad/s, scaled so rotation stays readable at 60 fps
    pr.spin.rotation.y += pr.dir * w * dt * (always ? 1 : 1);
    pr.disc.material.opacity = k < 0.02 ? 0 : 0.05 + 0.20 * Math.min(k, 1.4);
  }
}
function applyRig(drone, s, offset, dt) {
  drone.group.position.copy(s.pos).add(offset); drone.group.quaternion.copy(s.q);
  const hoverF = s.ev.Wt / s.veh.n;
  spinProps(drone, s.f, hoverF, dt, true);
  drone.leds.forEach((l, i) => { l.material.color.setHex(s.failed.has(i) ? 0xff3b30 : 0x2ee66b); });
  drone.labels.forEach((sp, i) => { sp.visible = (S.stage === 'flight' || S.stage === 'compare'); sp.position.copy(s.pos).add(offset).add(new THREE.Vector3(Math.sin(s.layout[i].th) * s.veh.armR, 0.55, -Math.cos(s.layout[i].th) * s.veh.armR).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0))); });
}

/* ---------- camera tweens and presets ---------- */
let tween = null, exTarget = null;   // exTarget: explode value the UI is easing toward (null = none)
function flyTo(pos, tgt, dur = 1.1) { tween = { t: 0, dur, p0: W.camera.position.clone(), t0: W.controls.target.clone(), p1: new THREE.Vector3(...pos), t1: new THREE.Vector3(...tgt) }; }
const VIEWS = { iso: [[2.6, 1.55, -3.4], [0, 0.35, 0]], front: [[0, 0.45, -5.4], [0, 0.35, 0]], side: [[5.4, 0.45, 0], [0, 0.35, 0]], top: [[0, 6.8, 0.01], [0, 0, 0]] };
function setView(name, instant) { const v = VIEWS[name]; if (!v) return; const e = exTarget !== null ? exTarget : S.explode; const sc = ((S.stage === 'compare') ? 1.9 : 1) * (1 + 0.38 * e), lift = e * 0.5; flyTo([v[0][0] * sc, v[0][1] * sc + lift, v[0][2] * sc], [v[1][0], v[1][1] + lift, v[1][2]], instant ? 0.001 : 0.9); if (instant) { W.camera.position.copy(tween.p1); W.controls.target.copy(tween.t1); tween = null; } $$('#viewbar [data-view]').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === name)); }

/* ---------- selection highlight (overlay clones that pulse) ---------- */
const hiMat = new THREE.MeshBasicMaterial({ color: 0x2de2e6, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
let overlays = [];
function setSelected(id) {
  overlays.forEach(o => o.parent && o.parent.remove(o)); overlays = [];
  S.selected = id;
  if (id) DRONES.hex.parts[id].objs.forEach(root => root.traverse(m => { if (m.isMesh && !m.userData.overlay) { const o = new THREE.Mesh(m.geometry, hiMat); o.userData.overlay = true; o.raycast = () => { }; o.castShadow = false; m.add(o); overlays.push(o); } }));
  $$('.pbtn').forEach(b => b.setAttribute('aria-pressed', b.dataset.part === id));
  $$('.plabel').forEach(l => l.classList.toggle('sel', l.dataset.part === id));
  S.hooks.forEach(h => h.onSelect && h.onSelect(id));
}

/* ---------- picking ---------- */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let downAt = null;
W.canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
W.canvas.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || S.stage === 'flight') return; downAt = null;
  if (S.stage === 'compare') return;
  const r = W.canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, W.camera);
  const hits = ray.intersectObjects(DRONES.hex.group.children.filter(c => c.visible), true).filter(h => h.object.userData.partId);
  setSelected(hits.length ? hits[0].object.userData.partId : null);
});

/* ---------- display toggles ---------- */
function setWire(on) { S.wire = on; Object.values(MATS).forEach(m => { if (m !== MATS.disc && m !== MATS.podDecal) m.wireframe = on; }); $('#btnWire').setAttribute('aria-pressed', on); }
function setPartVisible(id, v) { if (v) S.hidden.delete(id); else S.hidden.add(id); DRONES.hex.setPartVisible(id, v); }

/* ---------- theme ---------- */
function effectiveTheme() { const a = document.documentElement.dataset.theme; if (a === 'light' || a === 'dark') return a; return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
function applyTheme() {
  const th = effectiveTheme(); S.theme = th; const t = SKY_THEMES[th];
  applySky(sky, th); buildEnv(th); setStudioTheme(th); buildWorld(th);
  W.scene.fog = new THREE.FogExp2(L(t.fog), 0.00055);
  hemi.intensity = t.hemiI; sun.color.copy(L(t.sun)); sun.intensity = t.sunI; W.renderer.toneMappingExposure = t.exposure;
  W.stage.style.background = t.horizon; shadowCatch.material.opacity = th === 'dark' ? 0.5 : 0.28;
  S.hooks.forEach(h => h.onTheme && h.onTheme(th));
}
$('#themeBtn').addEventListener('click', () => { document.documentElement.dataset.theme = S.theme === 'dark' ? 'light' : 'dark'; try { localStorage.setItem('mv-theme', document.documentElement.dataset.theme); } catch (e) { } applyTheme(); });
try { const t = localStorage.getItem('mv-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) { }
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) applyTheme(); });

/* ---------- stage modes: what the 3D view shows for each tab ---------- */
function setStageMode(tab) {
  S.stage = tab; W.stage.dataset.mode = tab; Object.values(DRONES).forEach(d => d.labels.forEach(l => { l.visible = false; }));
  const flight = tab === 'flight', cmp = tab === 'compare';
  studio.visible = !flight; world.visible = flight; sky.visible = true;
  W.scene.fog.density = flight ? 0.00055 : 0;
  trail.line.visible = flight;
  $('#viewbar').classList.toggle('hide', flight);
  $('#explodeBox').classList.toggle('hide', flight || cmp);
  $('#flightHud').style.display = (flight || cmp) ? 'grid' : 'none'; $('#flightHud').style.top = cmp ? '58px' : '12px'; $('#rotorBars').style.display = (flight || cmp) ? 'flex' : 'none';
  $('#stick').style.display = flight && window.matchMedia('(pointer: coarse), (max-width: 900px)').matches ? 'flex' : 'none';
  if (flight) { setShadowBox(14, 1, 120); resetFlight(); }
  else { setShadowBox(5.5, 1, 40); sun.target.position.set(0, 0, 0); sun.position.copy(SUNDIR).multiplyScalar(18); }
  // which drone is visible and where
  if (flight) { DRONES.hex.group.visible = S.flightVeh === 'hex'; DRONES.quad.group.visible = S.flightVeh === 'quad'; }
  else if (cmp) { DRONES.hex.group.visible = DRONES.quad.group.visible = true; }
  else { DRONES.hex.group.visible = true; DRONES.quad.group.visible = false; }
  if (!flight && !cmp) { DRONES.hex.group.position.set(0, Phys.VEH ? 0.42 : 0, 0); DRONES.hex.group.quaternion.identity(); DRONES.hex.explode(S.explode * 1.0); DRONES.hex.group.position.y = 0.42 + S.explode * 0.95; }
  trail.line.visible = flight;
}
const CMP_X = 2.1;                                            // lateral offset of each vehicle in compare view

/* ---------- resize ---------- */
function resize() { const w = W.stage.clientWidth, h = W.stage.clientHeight; if (!w || !h) return; W.renderer.setSize(w, h, false); W.camera.aspect = w / h; W.camera.updateProjectionMatrix(); }
new ResizeObserver(resize).observe(W.stage);

/* ---------- label layer: leader lines to each part ---------- */
const LBL = { els: {}, svg: $('#leaders'), built: false };
function buildLabels() {
  const layer = $('#labelLayer'); PART_ORDER.forEach(id => { const d = document.createElement('div'); d.className = 'plabel'; d.dataset.part = id; d.textContent = PARTS[id].short; d.style.display = 'none'; d.addEventListener('click', () => setSelected(id)); layer.appendChild(d); LBL.els[id] = d; });
  LBL.lines = {}; PART_ORDER.forEach(id => { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'), c = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); c.setAttribute('r', 3); LBL.svg.append(l, c); LBL.lines[id] = [l, c]; });
}
const _b = new THREE.Box3(), _v = new THREE.Vector3();
function anchorFor(id) {
  const objs = DRONES.hex.parts[id].objs; let o = objs[0];
  if (id === 'thermal') o = objs[objs.length - 1];            // cold plate
  else if (objs.length > 1) { o = objs.reduce((a, b) => (a.userData.base.x > b.userData.base.x ? a : b)); }
  _b.setFromObject(o); return _b.getCenter(_v).clone();
}
function updateLabels() {
  const show = S.stage === 'design' && (S.labels || S.explode > 0.04);
  if (!LBL.built) { buildLabels(); LBL.built = true; }
  const w = W.stage.clientWidth, h = W.stage.clientHeight;
  if (!show) { PART_ORDER.forEach(id => { LBL.els[id].style.display = 'none'; LBL.lines[id].forEach(e => e.style.display = 'none'); }); return; }
  const pts = PART_ORDER.map(id => { const p = anchorFor(id).project(W.camera); return { id, x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, vis: DRONES.hex.parts[id].objs[0].visible && p.z < 1 }; }).filter(p => p.vis);
  const cx = w / 2, colL = 10, colR = w - 10, gap = w < 520 ? 17 : 24;
  for (const side of [-1, 1]) {
    const col = pts.filter(p => (p.x < cx ? -1 : 1) === side).sort((a, b) => a.y - b.y);
    let last = 58; col.forEach(p => { p.ly = Math.max(p.y, last + gap); last = p.ly; }); const over = last - (h - 62); if (over > 0) col.forEach(p => { p.ly = Math.max(58, p.ly - over); });
    col.forEach(p => { p.lx = side < 0 ? colL : colR; p.side = side; });
  }
  PART_ORDER.forEach(id => { const el = LBL.els[id], [ln, c] = LBL.lines[id], p = pts.find(q => q.id === id); if (!p) { el.style.display = 'none'; ln.style.display = c.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = p.side < 0 ? colL + 'px' : 'auto'; el.style.right = p.side > 0 ? 10 + 'px' : 'auto'; el.style.top = p.ly + 'px';
    const ex = p.side < 0 ? colL + el.offsetWidth : colR - el.offsetWidth;
    ln.style.display = c.style.display = 'block'; ln.setAttribute('x1', ex); ln.setAttribute('y1', p.ly); ln.setAttribute('x2', p.x); ln.setAttribute('y2', p.y); c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); });
}

/* ---------- main loop ---------- */
const clock = new THREE.Clock(); let frame = 0;
const _o1 = new THREE.Vector3(-CMP_X, 0, 0), _o2 = new THREE.Vector3(CMP_X, 0, 0), _zero = new THREE.Vector3();
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; frame++;
  if (tween) { tween.t += dt / tween.dur; const k = ease(Math.min(tween.t, 1)); W.camera.position.lerpVectors(tween.p0, tween.p1, k); W.controls.target.lerpVectors(tween.t0, tween.t1, k); if (tween.t >= 1) tween = null; }
  const tab = S.stage;
  if (tab === 'flight') {
    S.hooks.forEach(h => h.preStep && h.preStep(dt));
    sim.wind = S.wind; sim.advance(dt); const d = DRONES[S.flightVeh]; applyRig(d, sim, _zero, dt); pushTrail(sim.pos);
    // follow camera
    const dp = sim.pos.clone().sub(W.controls.target).multiplyScalar(Math.min(1, dt * 4)); if (!tween) { W.controls.target.add(dp); W.camera.position.add(dp); }
    sun.target.position.copy(sim.pos); sun.position.copy(sim.pos).addScaledVector(SUNDIR, 40);
    updateDust(dt); if (WORLD.windsock) WORLD.windsock.rotation.z = Math.PI / 2 * clamp(0.08 + S.wind / 8, 0.08, 1);
  } else if (tab === 'compare') {
    if (simCmp.on) { sim.wind = sim2.wind = S.wind; sim.advance(dt); sim2.advance(dt); S.hooks.forEach(h => h.preStep && h.preStep(dt)); applyRig(DRONES.hex, sim, _o1, dt); applyRig(DRONES.quad, sim2, _o2, dt); }
    else { for (const [id, off] of [['hex', _o1], ['quad', _o2]]) { const d = DRONES[id]; d.group.position.set(off.x, 0.42, 0); d.group.quaternion.identity(); spinProps(d, null, 1, dt, false); d.labels.forEach(l => l.visible = false); d.explode && d.explode(0); } }
    sun.target.position.set(0, 0, 0); sun.position.copy(SUNDIR).multiplyScalar(18);
  } else {
    const d = DRONES.hex; if (S.spin) { const hf = Phys.evaluate(Phys.VEH.hex, S.env); spinProps(d, null, 1, dt, false); }
    d.explode(S.explode * 1.0); d.group.position.y = 0.42 + S.explode * 0.95;
    if (S.selected) hiMat.opacity = 0.22 + 0.16 * Math.sin(t * 5);
  }
  W.controls.update();
  if (frame % 2 === 0) updateLabels();
  S.hooks.forEach(h => h.onFrame && h.onFrame(dt, t));
  W.renderer.render(W.scene, W.camera);
}

/* rotor wash dust particles near the ground under the drone */
function updateDust(dt) {
  const D = WORLD.dust; if (!D) return; const agl = sim.pos.y - 0.42, thr = clamp(sim.f.reduce((a, b) => a + b, 0) / sim.ev.Wt, 0, 2), k = clamp(1 - agl / 7, 0, 1) * (sim.armed ? clamp(thr, 0, 1.3) : 0);
  const a = D.pts.geometry.attributes.position.array, tt = clock.elapsedTime;
  for (let i = 0; i < D.n; i++) { const ph = (tt * 0.6 + D.seed[i * 2]) % 1, ang = D.seed[i * 2 + 1] * 6.283 + i, r = 0.5 + ph * (4 + 5 * k); a[i * 3] = sim.pos.x + Math.cos(ang) * r; a[i * 3 + 1] = 0.15 + ph * 0.9 * k; a[i * 3 + 2] = sim.pos.z + Math.sin(ang) * r; }
  D.pts.geometry.attributes.position.needsUpdate = true; D.pts.material.opacity = 0.5 * k * k;
}

function resetFlight() {
  const veh = Phys.VEH[S.flightVeh]; sim.setVehicle(veh, S.env); sim.wind = S.wind; clearTrail();
  DRONES.hex.group.visible = S.flightVeh === 'hex'; DRONES.quad.group.visible = S.flightVeh === 'quad';
  const d = DRONES[S.flightVeh]; d.explode(0); applyRig(d, sim, _zero, 0.016);
  W.controls.target.set(0, 1.0, 0); W.camera.position.set(-4.6, 3.0, 6.2); W.controls.maxDistance = 120;
}
function startCompareRace() {
  sim.setVehicle(Phys.VEH.hex, S.env); sim2.setVehicle(Phys.VEH.quad, S.env);
  [sim, sim2].forEach(s => { s.command('takeoff'); }); simCmp = { on: true, tFail: null, t: 0 };
}
function stopCompareRace() { simCmp.on = false; }

/* ---------- boot ---------- */
applyTheme(); resize(); setStageMode('design'); setView('iso'); W.camera.position.set(...VIEWS.iso[0]); W.controls.target.set(0, 0.35, 0); tween = null;
requestAnimationFrame(() => { $('#loadNote').classList.add('done'); });
loop();
