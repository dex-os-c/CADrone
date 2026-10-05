/* =====================================================================
   MEDVAYU H6 · model.js
   Procedural drone geometry. buildDrone(veh, mats, layout) returns:
     { group, parts, props[], leds[], labels[], explode(t), setPartVisible }
   Axes: x right, y up, z back; nose points to −z. Units: metres.
   Every mesh carries userData.partId so the UI can pick it with a ray.
   ===================================================================== */
const PART_ORDER = ['props', 'motors', 'arms', 'esc', 'thermal', 'frame', 'avionics', 'battery', 'pod', 'payload', 'latch', 'skids'];

function buildDrone(veh, mats, layout) {
  const V3 = THREE.Vector3, root = new THREE.Group();
  const parts = {}; PART_ORDER.forEach(id => parts[id] = { id, objs: [] });
  const props = [], leds = [], labels = [], discs = [];
  const R = veh.propD / 2, ARM_IN = 0.20, hex = veh.n === 6;

  /* ----- helpers ----- */
  function shadowed(o) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return o; }
  function reg(partId, obj, dir) {
    obj.userData.base = obj.position.clone(); obj.userData.dir = dir ? dir.clone() : new V3();
    obj.traverse(m => { m.userData.partId = partId; });
    shadowed(obj); root.add(obj); parts[partId].objs.push(obj); return obj;
  }
  function between(a, b, radius, mat, seg = 10) {          // cylinder between two points
    const d = b.clone().sub(a), len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, seg), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return m;
  }
  function ringMesh(r, tube, mat) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, 36), mat); m.rotation.x = Math.PI / 2; return m; }

  /* ----- propeller blade: lofted lens-section airfoil with taper and twist ----- */
  function bladeGeometry(Rt, hubR) {
    const N = 16, M = 10, pos = [], idx = [];
    const af = []; for (let i = 0; i < M; i++) { const a = i / M * Math.PI * 2, xc = Math.cos(a) * 0.5, yt = Math.sin(a) * 0.5 * 0.09 * (1 - Math.pow(Math.abs(Math.cos(a)), 6) * 0.2); af.push([xc, yt]); }
    for (let s = 0; s <= N; s++) {
      const u = s / N, r = hubR + (Rt - hubR) * u;
      const chord = 0.085 * (1 - 0.62 * u) * (u < 0.12 ? 0.55 + u / 0.12 * 0.45 : 1);
      const tw = (24 - 17 * u) * Math.PI / 180, droop = -0.02 * u * u;
      for (const [xc, yt] of af) {
        const cx = xc * chord, cy = yt * chord * 2.2;
        pos.push(r, cx * Math.sin(tw) + cy * Math.cos(tw) + droop, cx * Math.cos(tw) - cy * Math.sin(tw));
      }
    }
    for (let s = 0; s < N; s++) for (let i = 0; i < M; i++) { const a = s * M + i, b = s * M + (i + 1) % M, c = a + M, d = b + M; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const uv = []; for (let s = 0; s <= N; s++) for (let i = 0; i < M; i++) uv.push(s / N, i / M); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  const bladeGeo = bladeGeometry(R, 0.05);

  /* ===================== ARMS, MOTORS, PROPS, ESC, LEDS, THERMAL ===================== */
  const hubPlate = new V3(0, 0.0, 0);
  layout.forEach((r, i) => {
    const dir = new V3(r.x, 0, r.z).normalize(), tip = new V3(r.x, 0, r.z);
    const root0 = dir.clone().multiplyScalar(ARM_IN), len = tip.clone().sub(root0).length();

    // Carbon arm tube with root clamp and tip motor-mount plate
    const arm = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, len, 20), mats.carbonTube);
    tube.position.copy(root0).addScaledVector(dir, len / 2); tube.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir); arm.add(tube);
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 20), mats.aluDark);
    clamp.position.copy(root0).addScaledVector(dir, 0.04); clamp.quaternion.copy(tube.quaternion); arm.add(clamp);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 32), mats.alu);
    plate.position.set(tip.x, 0.027, tip.z); arm.add(plate);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 20), mats.carbon);
    sleeve.position.copy(tip).addScaledVector(dir, -0.04); sleeve.quaternion.copy(tube.quaternion); arm.add(sleeve);
    reg('arms', arm, dir.clone().multiplyScalar(0.34));

    // Motor: stator, rotating bell with cooling slots, shaft nut
    const motor = new THREE.Group();
    const stator = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.03, 32), mats.aluDark); stator.position.y = 0.047; motor.add(stator);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.052, 40), mats.anodTeal); bell.position.y = 0.088; motor.add(bell);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.066, 0.01, 40), mats.alu); cap.position.y = 0.119; motor.add(cap);
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const sl = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.004), mats.glass); sl.position.set(Math.cos(a) * 0.0665, 0.088, Math.sin(a) * 0.0665); sl.rotation.y = -a; motor.add(sl); }
    const wind = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.007, 8, 28), mats.copper); wind.rotation.x = Math.PI / 2; wind.position.y = 0.066; motor.add(wind);
    motor.position.set(tip.x, 0, tip.z);
    reg('motors', motor, new V3(0, 0.52, 0));

    // Propeller: hub, two blades, spinner and a motion-disc that fades in with RPM
    const prop = new THREE.Group(), spin = new THREE.Group();
    for (let b = 0; b < 2; b++) { const bl = new THREE.Mesh(bladeGeo, mats.carbonProp); bl.rotation.y = b * Math.PI; spin.add(bl); }
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.026, 32), mats.anodTeal); spin.add(hubM);
    const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 8, 24), mats.anodOrange); hubRing.rotation.x = Math.PI / 2; hubRing.position.y = 0.014; spin.add(hubRing);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.04, 24), mats.alu); cone.position.y = 0.032; spin.add(cone);
    // tip colour marker so rotation reads at low speed: red on CW rotors, blue on CCW
    const tipMat = new THREE.MeshBasicMaterial({ color: r.s > 0 ? 0xff3b30 : 0x2f8bff });
    for (let b = 0; b < 2; b++) { const tp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.004, 0.036), tipMat); tp.position.set((b ? -1 : 1) * (R - 0.025), 0.004, 0); spin.add(tp); }
    prop.add(spin);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48), mats.disc.clone()); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.012; disc.castShadow = false; prop.add(disc);
    prop.position.set(tip.x, 0.158, tip.z);
    reg('props', prop, new V3(0, 0.95, 0)); disc.castShadow = false;
    props.push({ spin, disc, dir: r.s }); discs.push(disc);

    // Rotor label sprite above the prop (used by the flight sim and the labels view)
    const sp = numberSprite(i + 1, '#0f8f95'); sp.position.set(tip.x, 0.46, tip.z); sp.visible = false; root.add(sp); labels.push(sp);

    // ESC under the arm, near the motor
    const esc = new THREE.Group();
    const escBody = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.022, 0.05), mats.aluDark); esc.add(escBody);
    const fins = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.046), mats.alu); fins.position.y = -0.014; esc.add(fins);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 8), mats.ledGreen.clone()); led.position.set(0, 0.014, 0.02); esc.add(led); leds.push(led);
    esc.position.copy(tip).addScaledVector(dir, -0.2); esc.position.y = -0.042; esc.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
    reg('esc', esc, new V3(dir.x * 0.18, -0.46, dir.z * 0.18));

    // Heat-collection loop: copper tube wraps the motor stator, then runs inward under the arm
    if (veh.thermal) {
      const th = new THREE.Group();
      const ringT = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.008, 10, 32), mats.tubeHot); ringT.rotation.x = Math.PI / 2; ringT.position.set(tip.x, 0.035, tip.z); th.add(ringT);
      const side = new V3(-dir.z, 0, dir.x).multiplyScalar(0.012);
      const pts = [tip.clone().addScaledVector(dir, -0.058).setY(0.035), tip.clone().addScaledVector(dir, -0.12).setY(0.002), dir.clone().multiplyScalar(0.55).setY(-0.032), dir.clone().multiplyScalar(0.30).setY(-0.03), dir.clone().multiplyScalar(0.16).setY(0.03), new V3(0, 0.055, 0).addScaledVector(dir, 0.1)];
      const c = new THREE.CatmullRomCurve3(pts.map(p => p.clone().add(side)));
      th.add(new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.007, 8, false), mats.tubeHot));
      reg('thermal', th, new V3(dir.x * 0.1, 0.30, dir.z * 0.1));
    }

    // Navigation / status LED on arm tip (green starboard, red port, white rear)
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), r.x > 0.01 ? mats.ledGreen : r.x < -0.01 ? mats.ledRed : mats.ledWhite);
    nav.position.set(tip.x + dir.x * 0.075, 0.03, tip.z + dir.z * 0.075); reg('arms', nav, dir.clone().multiplyScalar(0.34));
  });

  /* ===================== FRAME: sandwich plates, standoffs, arm clamps ===================== */
  {
    const hubR = hex ? 0.34 : 0.30;
    const top = new THREE.Group();
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(hubR, hubR, 0.012, hex ? 6 : 8), mats.carbon); tp.rotation.y = Math.PI / 6; tp.position.y = 0.056; top.add(tp);
    const tpe = ringMesh(hubR * 0.86, 0.004, mats.anodTeal); tpe.position.y = 0.063; top.add(tpe);
    reg('frame', top, new V3(0, 0.34, 0));
    const bot = new THREE.Group();
    const bp = new THREE.Mesh(new THREE.CylinderGeometry(hubR, hubR, 0.012, hex ? 6 : 8), mats.carbon); bp.rotation.y = Math.PI / 6; bp.position.y = -0.056; bot.add(bp);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6, so = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.112, 12), mats.alu); so.position.set(Math.cos(a) * hubR * 0.78, 0, Math.sin(a) * hubR * 0.78); bot.add(so); }
    reg('frame', bot, new V3(0, -0.04, 0));
  }

  /* ===================== AVIONICS: PDB, flight-controller stack, GPS mast ===================== */
  {
    const av = new THREE.Group();
    const pdb = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.006, 0.26), mats.pcb); pdb.position.y = -0.032; av.add(pdb);
    const pdbRing = ringMesh(0.1, 0.01, mats.copper); pdbRing.position.y = -0.026; av.add(pdbRing);
    const fc = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.006, 0.17), mats.pcb); fc.position.y = -0.008; av.add(fc);
    const fc2 = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.006, 0.15), mats.pcb); fc2.position.y = 0.018; av.add(fc2);
    for (let k = 0; k < 5; k++) { const chip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.03), mats.steel); chip.position.set(-0.05 + k * 0.025, -0.002, (k % 2 ? 0.03 : -0.03)); av.add(chip); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.17, 10), mats.alu); mast.position.set(0, 0.23, 0.17); av.add(mast);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.02, 32), mats.podBody); puck.position.set(0, 0.325, 0.17); av.add(puck);
    reg('avionics', av, new V3(0, 0.12, 0.0));
  }

  /* ===================== BATTERY (top-mounted) with cold plate ===================== */
  {
    const b = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.30), mats.battShell); b.add(shell);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.004, 0.28), mats.battLabel); lid.position.y = 0.072; b.add(lid);
    for (const sx of [-0.14, 0.14]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.146, 0.31), mats.rubber); st.position.x = sx; b.add(st); }
    const hnd = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.007, 8, 20, Math.PI), mats.alu); hnd.position.set(0, 0.074, 0.1); b.add(hnd);
    const xt = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.03), mats.gold); xt.position.set(0.27, 0, 0); b.add(xt);
    b.position.y = 0.15; reg('battery', b, new V3(0, 0.78, 0));
  }
  if (veh.thermal) {
    const cp = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.28), mats.alu); plate.position.y = 0.068; cp.add(plate);
    const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 20), mats.anodOrange); pump.position.set(-0.2, 0.09, -0.19); pump.rotation.z = Math.PI / 2; cp.add(pump);
    const man = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 10, 32), mats.tubeHot); man.rotation.x = Math.PI / 2; man.position.y = 0.075; cp.add(man);
    reg('thermal', cp, new V3(0, 0.42, 0));
  }

  /* ===================== MEDICAL POD (underslung) + cassette + latches ===================== */
  const podLen = 0.92;
  {
    const prof = []; const Rp = 0.13;
    for (let i = 0; i <= 28; i++) {
      const y = -podLen / 2 + podLen * i / 28; let r;
      if (y < -0.24) r = Rp * Math.sqrt(Math.max(0, 1 - Math.pow((y + 0.24) / 0.22, 2))); else if (y > 0.34) r = Rp * (1 - 0.18 * Math.pow((y - 0.34) / 0.12, 2)); else r = Rp;
      prof.push(new THREE.Vector2(Math.max(r, 0.002), y));
    }
    const geo = new THREE.LatheGeometry(prof, 48); geo.rotateX(Math.PI / 2); geo.scale(1.55, 1, 1);
    const pod = new THREE.Group();
    const body = new THREE.Mesh(geo, mats.podBody); pod.add(body);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.2), mats.glass); win.position.set(0.1985, 0.03, -0.28); pod.add(win); const win2 = win.clone(); win2.position.x = -0.2; pod.add(win2);
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), mats.podDecal); decal.position.set(0.2035, -0.03, 0.13); decal.rotation.y = Math.PI / 2; decal.scale.x = 0.8; pod.add(decal);
    const decal2 = decal.clone(); decal2.position.x = -0.2035; decal2.rotation.y = -Math.PI / 2; pod.add(decal2);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 10), mats.glass); nose.position.set(0, 0.005, -0.45); nose.scale.set(1.4, 1, 0.6); pod.add(nose);
    const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), mats.ledWhite); strobe.position.set(0, -0.125, 0.3); pod.add(strobe);
    pod.position.set(0, -0.215, 0); reg('pod', pod, new V3(0, -0.78, 0));

    const cas = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.17, 0.5), mats.cassette); cas.add(cb);
    const ff = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.19, 0.02), mats.crossFace); ff.position.z = 0.26; cas.add(ff);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.007, 8, 20, Math.PI), mats.alu); handle.position.set(0, 0, 0.275); handle.rotation.z = Math.PI; cas.add(handle);
    for (let k = -1; k <= 1; k += 2) { const trg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.14), mats.podBody); trg.position.set(k * 0.07, 0.03, -0.1); cas.add(trg); }
    cas.position.set(0, -0.215, 0.0); reg('payload', cas, new V3(0, -0.78, 0.95));

    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const l = new THREE.Group();
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.045), mats.alu); l.add(lb);
      const lp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 10), mats.steel); lp.position.y = -0.03; l.add(lp);
      const lh = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.016), mats.anodOrange); lh.position.set(0, -0.02, 0.03); l.add(lh);
      l.position.set(sx * 0.16, -0.09, sz * 0.26); reg('latch', l, new V3(sx * 0.1, -0.4, sz * 0.2));
    }
  }

  /* ===================== SKIDS ===================== */
  for (const sx of [-1, 1]) {
    const sk = new THREE.Group(), X = sx * 0.42, yb = -0.399;
    const curve = new THREE.CatmullRomCurve3([new V3(X, -0.25, -0.76), new V3(X, -0.33, -0.70), new V3(X, yb + 0.003, -0.58), new V3(X, yb, -0.3), new V3(X, yb, 0.3), new V3(X, yb + 0.003, 0.58), new V3(X, -0.33, 0.70), new V3(X, -0.25, 0.76)]);
    sk.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.014, 12, false), mats.carbonTube));
    for (const sz of [-1, 1]) {
      sk.add(between(new V3(sx * 0.30, -0.04, sz * 0.22), new V3(X, yb, sz * 0.44), 0.013, mats.carbonTube));
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.07, 14), mats.rubber); foot.rotation.z = Math.PI / 2; foot.position.set(X, yb + 0.005, sz * 0.6); foot.rotation.x = Math.PI / 2; sk.add(foot);
      const brk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), mats.aluDark); brk.position.set(sx * 0.30, -0.04, sz * 0.22); sk.add(brk);
    }
    reg('skids', sk, new V3(sx * 0.18, -0.95, 0));
  }
  // cross-tube linking the runners through the frame
  { const xt = new THREE.Group(); [-0.2, 0.2].forEach(z => xt.add(between(new V3(-0.30, -0.04, z * 1.1), new V3(0.30, -0.04, z * 1.1), 0.011, mats.carbonTube))); reg('skids', xt, new V3(0, -0.95, 0)); }

  /* ===================== API ===================== */
  function explode(t) {
    for (const id in parts) for (const o of parts[id].objs) o.position.copy(o.userData.base).addScaledVector(o.userData.dir, t);
  }
  // Anchor point of a part in model space (used for label leader lines)
  function anchor(id) {
    const box = new THREE.Box3(); parts[id].objs.forEach(o => box.expandByObject(o));
    return box.getCenter(new V3());
  }
  function setPartVisible(id, v) { parts[id].objs.forEach(o => { o.visible = v; }); }
  function setGhost(selectedId) {      // fade all parts except the selected one
    root.traverse(m => { if (!m.isMesh || m.userData.partId === undefined) return; });
  }

  return { group: root, parts, props, leds, labels, discs, explode, anchor, setPartVisible, veh, R };
}

if (typeof module !== 'undefined') module.exports = { buildDrone, PART_ORDER };
