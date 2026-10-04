/* =====================================================================
   MEDVAYU H6 · scene_mats.js
   Procedural textures, PBR materials, sky dome, studio floor, terrain.
   Everything is generated in code; nothing is downloaded.
   ===================================================================== */
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function srgb(tex) { tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8; return tex; }

/* 2x2 twill carbon-fibre weave */
function carbonTexture() {
  const c = mkCanvas(256, 256), g = c.getContext('2d'), s = 16;
  g.fillStyle = '#101316'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const horiz = ((x + y) % 4) < 2;
    const gr = horiz ? g.createLinearGradient(x * s, 0, x * s + s, 0) : g.createLinearGradient(0, y * s, 0, y * s + s);
    gr.addColorStop(0, '#2c3238'); gr.addColorStop(0.5, '#0c0f12'); gr.addColorStop(1, '#2a3036');
    g.fillStyle = gr; g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return srgb(t);
}

/* Scored aluminium: fine horizontal lines used as a bump map */
function brushedBump() {
  const c = mkCanvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) { const v = 100 + Math.random() * 60 | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, Math.random() * 256, 256, 1); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function textTexture(w, h, draw) {
  const c = mkCanvas(w, h), g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.userData = { draw, w, h, c }; return srgb(t);
}

/* Medical pod decal: cross, wordmark and a technical data strip */
function drawPodDecal(g, w, h) {
  g.clearRect(0, 0, w, h);
  const teal = '#0f9aa0';
  g.fillStyle = teal; const a = h * 0.17, cx = h * 0.5, cy = h * 0.5;
  g.fillRect(cx - a * 0.5, cy - a * 1.5, a, a * 3); g.fillRect(cx - a * 1.5, cy - a * 0.5, a * 3, a);
  g.fillStyle = '#1b2a33'; g.font = '600 ' + h * 0.11 + 'px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
  g.fillText('MEDVAYU H6', h * 1.05, h * 0.36);
  g.fillStyle = teal; g.font = '500 ' + h * 0.075 + 'px "IBM Plex Mono", monospace';
  g.fillText('MODULAR MEDICAL POD', h * 1.05, h * 0.52);
  g.fillStyle = '#5b6b75'; g.fillText('SLIDE-OUT CASSETTE · TOOL-FREE LATCH', h * 1.05, h * 0.66);
}
function podDecalTexture() { return textTexture(1024, 256, drawPodDecal); }

function batteryTexture() {
  return textTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#1d252b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff7a2f';
    for (let i = -2; i < 12; i++) { g.beginPath(); g.moveTo(i * 44, h); g.lineTo(i * 44 + 22, h); g.lineTo(i * 44 + 54, h - 26); g.lineTo(i * 44 + 32, h - 26); g.fill(); }
    g.fillStyle = '#e8eef1'; g.font = '600 34px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
    g.fillText('LI-ION PACK', 26, 54);
    g.fillStyle = '#9fb0b9'; g.font = '500 20px "IBM Plex Mono", monospace';
    g.fillText('2.4 kWh · 200 Wh/kg (assumed)', 26, 100);
    g.fillText('COLD PLATE LOOP: MOTOR WASTE HEAT', 26, 134);
  });
}

function crossTexture() {
  return textTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e9f6f6'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f9aa0'; g.fillRect(w * 0.4, h * 0.2, w * 0.2, h * 0.6); g.fillRect(w * 0.2, h * 0.4, w * 0.6, h * 0.2);
  });
}

function numberSprite(n, color) {
  const t = textTexture(64, 64, (g, w, h) => {
    g.fillStyle = color; g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = '700 30px "IBM Plex Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M' + n, 32, 34);
  });
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
  const s = new THREE.Sprite(m); s.scale.set(0.15, 0.15, 1); s.renderOrder = 10; return s;
}

function radialDiscTexture() {
  const c = mkCanvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.95, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
}

/* ---------- Materials ---------- */
function makeMaterials() {
  const carbonTex = carbonTexture();
  const mat = {};
  const cTex = (rx, ry) => { const t = carbonTex.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return t; };
  mat.carbon = new THREE.MeshPhysicalMaterial({ map: cTex(3, 3), roughness: 0.38, metalness: 0.15, clearcoat: 0.9, clearcoatRoughness: 0.12 });
  mat.carbonTube = new THREE.MeshPhysicalMaterial({ map: cTex(1, 8), roughness: 0.34, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08 });
  mat.carbonProp = new THREE.MeshPhysicalMaterial({ map: cTex(1, 2), color: 0xdfe5ea, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide });
  const bump = brushedBump();
  mat.alu = new THREE.MeshStandardMaterial({ color: 0xb9c3ca, metalness: 1, roughness: 0.34, bumpMap: bump, bumpScale: 0.4 });
  mat.aluDark = new THREE.MeshStandardMaterial({ color: 0x2d3943, metalness: 0.9, roughness: 0.42, bumpMap: bump, bumpScale: 0.3 });
  mat.anodTeal = new THREE.MeshStandardMaterial({ color: 0x0f8f95, metalness: 0.85, roughness: 0.32 });
  mat.anodOrange = new THREE.MeshStandardMaterial({ color: 0xff7a2f, metalness: 0.8, roughness: 0.35 });
  mat.steel = new THREE.MeshStandardMaterial({ color: 0x59636b, metalness: 1, roughness: 0.28 });
  mat.copper = new THREE.MeshStandardMaterial({ color: 0xc87941, metalness: 1, roughness: 0.28 });
  mat.rubber = new THREE.MeshStandardMaterial({ color: 0x15191c, metalness: 0, roughness: 0.92 });
  mat.pcb = new THREE.MeshStandardMaterial({ color: 0x0c5a3a, metalness: 0.2, roughness: 0.55 });
  mat.gold = new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 1, roughness: 0.3 });
  mat.podBody = new THREE.MeshPhysicalMaterial({ color: 0xf3f6f7, roughness: 0.28, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.08 });
  mat.glass = new THREE.MeshPhysicalMaterial({ color: 0x0d1c24, roughness: 0.05, metalness: 0.2, clearcoat: 1 });
  mat.cassette = new THREE.MeshStandardMaterial({ color: 0x0f9aa0, roughness: 0.45, metalness: 0.05 });
  mat.battShell = new THREE.MeshStandardMaterial({ color: 0x232c33, roughness: 0.55, metalness: 0.2 });
  mat.battLabel = new THREE.MeshStandardMaterial({ map: batteryTexture(), roughness: 0.6, metalness: 0.1 });
  mat.podDecal = new THREE.MeshBasicMaterial({ map: podDecalTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  mat.crossFace = new THREE.MeshStandardMaterial({ map: crossTexture(), roughness: 0.5 });
  mat.tubeHot = new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff4d00, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.3 });
  mat.ledRed = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  mat.ledGreen = new THREE.MeshBasicMaterial({ color: 0x2ee66b });
  mat.ledWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
  mat.disc = new THREE.MeshBasicMaterial({ map: radialDiscTexture(), color: 0xcfd8de, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  // Cassette/pod redraw once the web font arrives
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { [mat.podDecal.map, mat.battLabel.map].forEach(t => { if (t.userData && t.userData.draw) { t.userData.draw(t.userData.c.getContext('2d'), t.userData.w, t.userData.h); t.needsUpdate = true; } }); });
  return mat;
}

/* ---------- Sky dome ---------- */
const SKY_THEMES = {
  light: { top: '#7fa9c9', horizon: '#dfe9ef', ground: '#c7d2d8', fog: '#dfe9ef', sun: 0xfff3e0, sunI: 2.2, hemiI: 0.85, floor: '#e6edf1', exposure: 1.0 },
  dark:  { top: '#05090d', horizon: '#1a2a35', ground: '#0e1519', fog: '#14212a', sun: 0xcfe3ff, sunI: 1.5, hemiI: 0.55, floor: '#111a20', exposure: 0.95 }
};
function makeSky() {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 ground; varying vec3 vP;' +
      'void main(){ float h = vP.y; vec3 c = h>0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0),0.55)) : mix(horizon, ground, pow(clamp(-h*3.0,0.0,1.0),0.6)); gl_FragColor = vec4(c,1.0); }'
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; return m;
}
function applySky(sky, theme) {
  const t = SKY_THEMES[theme];
  sky.material.uniforms.top.value.set(t.top); sky.material.uniforms.horizon.value.set(t.horizon); sky.material.uniforms.ground.value.set(t.ground);
}

/* ---------- Studio floor: scaled measurement grid in metres ---------- */
function studioFloorTexture(theme) {
  const S = 1024, c = mkCanvas(S, S), g = c.getContext('2d'), dark = theme === 'dark';
  const per = S / 8;                                         // 8 m across
  g.clearRect(0, 0, S, S);
  const rg = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S / 2);
  rg.addColorStop(0, dark ? 'rgba(30,44,54,0.95)' : 'rgba(255,255,255,0.95)'); rg.addColorStop(0.7, dark ? 'rgba(20,32,40,0.6)' : 'rgba(236,242,245,0.6)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  for (let i = 0; i <= 80; i++) { const p = i * per / 10, major = i % 10 === 0, mid = i % 5 === 0; g.strokeStyle = dark ? (major ? 'rgba(130,170,190,0.5)' : mid ? 'rgba(130,170,190,0.22)' : 'rgba(130,170,190,0.09)') : (major ? 'rgba(40,80,100,0.45)' : mid ? 'rgba(40,80,100,0.2)' : 'rgba(40,80,100,0.08)'); g.lineWidth = major ? 2 : 1; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke(); }
  g.fillStyle = dark ? 'rgba(160,200,220,0.8)' : 'rgba(30,70,90,0.8)'; g.font = '600 15px "IBM Plex Mono", monospace'; g.textAlign = 'center';
  for (let m = -3; m <= 3; m++) if (m) g.fillText(m + ' m', S / 2 + m * per, S / 2 + 18);
  // circular mask
  g.globalCompositeOperation = 'destination-in';
  const mk = g.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2); mk.addColorStop(0, 'rgba(0,0,0,1)'); mk.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mk; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); return srgb(t);
}

/* ---------- Terrain texture and landing pad ---------- */
function terrainTexture(theme) {
  const c = mkCanvas(512, 512), g = c.getContext('2d'), dark = theme === 'dark';
  g.fillStyle = dark ? '#18241d' : '#8aa07a'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) { const v = Math.random(); g.fillStyle = dark ? `rgba(${40 + v * 40 | 0},${60 + v * 40 | 0},${48 + v * 20 | 0},0.35)` : `rgba(${110 + v * 60 | 0},${135 + v * 50 | 0},${100 + v * 30 | 0},0.35)`; g.fillRect(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 6, 2 + Math.random() * 4); }
  g.strokeStyle = dark ? 'rgba(160,200,180,0.18)' : 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(1, 1, 510, 510);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(120, 120); return srgb(t);
}
function padTexture() {
  const c = mkCanvas(512, 512), g = c.getContext('2d');
  g.fillStyle = '#7d8890'; g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#f4f7f8'; g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 236, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#f4f7f8'; g.font = '700 300px "IBM Plex Sans", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H', 256, 268);
  return srgb(new THREE.CanvasTexture(c));
}
