global.THREE = require('three');
const Phys = require('../src/physics.js');
global.numberSprite = () => new THREE.Sprite(new THREE.SpriteMaterial());
const names = ['carbon','carbonTube','carbonProp','alu','aluDark','anodTeal','anodOrange','steel','copper','rubber','pcb','gold','podBody','glass','cassette','battShell','battLabel','podDecal','crossFace','tubeHot','ledRed','ledGreen','ledWhite','disc'];
const mats = {}; names.forEach(n => mats[n] = new THREE.MeshStandardMaterial());
const { buildDrone, PART_ORDER } = require('../src/model.js');
for (const id of ['hex','quad']) {
  const v = Phys.VEH[id], d = buildDrone(v, mats, Phys.layout(v));
  let nan = 0, tris = 0, meshes = 0;
  d.group.traverse(m => { if (m.isMesh) { meshes++; const p = m.geometry.attributes.position.array; for (const x of p) if (!isFinite(x)) nan++; tris += (m.geometry.index ? m.geometry.index.count : p.length/3)/3; } });
  d.explode(0); const b0 = new THREE.Box3().setFromObject(d.group);
  d.explode(1); const b1 = new THREE.Box3().setFromObject(d.group);
  console.log(id, 'meshes', meshes, 'tris', tris|0, 'NaN', nan);
  console.log('  parts', PART_ORDER.map(p => p + ':' + d.parts[p].objs.length).join(' '));
  const f = x => x.toFixed(3);
  console.log('  assembled bbox y', f(b0.min.y), f(b0.max.y), 'x', f(b0.min.x), f(b0.max.x), 'z', f(b0.min.z), f(b0.max.z));
  console.log('  exploded  bbox y', f(b1.min.y), f(b1.max.y), 'x', f(b1.min.x), f(b1.max.x), 'z', f(b1.min.z), f(b1.max.z));
  d.explode(0);
}
{ const v = Phys.VEH.hex, d = buildDrone(v, mats, Phys.layout(v)); d.explode(0); d.group.updateMatrixWorld(true);
  d.group.traverse(m => { if (m.isMesh || m.isSprite) { const b = new THREE.Box3().setFromObject(m); if (b.max.y > 0.4) console.log('HIGH', m.userData.partId, m.type, b.max.y.toFixed(3)); } });
  const p = d.parts.props.objs[0]; console.log('prop0 pos', p.position.toArray(), 'base', p.userData.base.toArray()); }
